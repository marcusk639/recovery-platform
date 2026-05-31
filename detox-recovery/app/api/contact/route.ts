import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  checkHoneypot,
  checkOrigin,
  checkRateLimit,
} from "@/lib/abuse-protection";

type ReferralApp = "phoenix-cleanhouse" | "homegroups" | "treatment-center";

const KNOWN_INTERESTS = new Set([
  "Patient-Experience Training",
  "Withdrawal Journey Mapping",
  "Communication Workshops",
  "Dropout / Friction Analysis",
  "Patient Education Review",
  "Digital Health Startup Advisory",
  "Sober Living / Housing",
  "12-Step / Homegroup Support",
  "Other",
]);

const INTEREST_TO_APP: Record<string, ReferralApp> = {
  "Sober Living / Housing": "phoenix-cleanhouse",
  "12-Step / Homegroup Support": "homegroups",
};

async function fireReferral(
  toApp: ReferralApp,
  clientName: string,
  clientEmail: string,
  notes: string,
): Promise<void> {
  const url = process.env.SHARED_API_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key) return;

  await fetch(`${url}/api/referrals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": key,
    },
    body: JSON.stringify({ toApp, clientName, clientEmail, notes }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!checkOrigin(req).ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(req, "contact");
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter ?? 60) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!checkHoneypot(b).ok) {
    return NextResponse.json({ success: true });
  }

  if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!b.email || typeof b.email !== "string" || !EMAIL_RE.test(b.email)) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!b.message || typeof b.message !== "string" || !b.message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.RESEND_TO_EMAIL?.replace(/[\r\n]/g, "");

  if (!apiKey || !toEmail) {
    return NextResponse.json({ success: true });
  }

  const resend = new Resend(apiKey);

  const org =
    typeof b.organization === "string"
      ? b.organization.slice(0, 200).trim()
      : "";
  const rawInterest =
    typeof b.interest === "string" ? b.interest.slice(0, 200).trim() : "";
  const interest = KNOWN_INTERESTS.has(rawInterest) ? rawInterest : "";
  const safeEmail = b.email.replace(/[\r\n]/g, "");
  const safeName = (b.name as string).slice(0, 100).replace(/[\r\n]/g, "");
  const safeMessage = (b.message as string).slice(0, 5000);

  const lines = [
    `Name: ${safeName}`,
    `Email: ${safeEmail}`,
    org ? `Organization: ${org}` : "",
    interest ? `Interest: ${interest}` : "",
    "",
    `Message:\n${safeMessage}`,
  ].filter(Boolean);

  const toApp = interest ? INTEREST_TO_APP[interest] : undefined;
  const referralPromise = toApp
    ? fireReferral(toApp, safeName, safeEmail, safeMessage.slice(0, 500))
    : Promise.resolve();

  const sendEmailPromise = resend.emails.send({
    from:
      process.env.RESEND_FROM_EMAIL ??
      "Withdrawal Support <onboarding@resend.dev>",
    to: toEmail,
    replyTo: safeEmail,
    subject: `New inquiry from ${safeName}`,
    text: lines.join("\n"),
  });

  // Both promises are awaited via Promise.allSettled — do NOT change to
  // `void fireReferral(...)`. Firebase App Hosting / Cloud Run throttles
  // background work after the handler returns; a void-dispatched fetch may
  // be dropped mid-flight. See docs/architecture.md "Referral Routing".
  const [emailResult, referralResult] = await Promise.allSettled([
    sendEmailPromise,
    referralPromise,
  ]);

  if (emailResult.status === "rejected") {
    console.error("[contact] Resend error:", emailResult.reason);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 502 },
    );
  }

  if (referralResult.status === "rejected") {
    // Referral failure must not fail the user-facing request — the email
    // already succeeded. Log and continue.
    console.error("[contact] referral failed:", referralResult.reason);
  }

  return NextResponse.json({ success: true });
}
