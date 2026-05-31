import { NextResponse } from "next/server";
import {
  checkHoneypot,
  checkOrigin,
  checkRateLimit,
} from "@/lib/abuse-protection";

type SubscribeTag =
  | "newsletter-withdrawal-field-notes"
  | "lead-magnet-unsafe"
  | "lead-magnet-family"
  | "lead-magnet-b2b";

const KNOWN_TAGS = new Set<SubscribeTag>([
  "newsletter-withdrawal-field-notes",
  "lead-magnet-unsafe",
  "lead-magnet-family",
  "lead-magnet-b2b",
]);

const GROUP_IDS: Record<SubscribeTag, string | undefined> = {
  "newsletter-withdrawal-field-notes":
    process.env.MAILERLITE_GROUP_ID_NEWSLETTER,
  "lead-magnet-unsafe": process.env.MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE,
  "lead-magnet-family": process.env.MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY,
  "lead-magnet-b2b": process.env.MAILERLITE_GROUP_ID_B2B,
};

export async function POST(req: Request): Promise<Response> {
  if (!checkOrigin(req).ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(req, "subscribe");
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

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !body ||
    typeof body !== "object" ||
    typeof b.email !== "string" ||
    !EMAIL_RE.test(b.email)
  ) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 },
    );
  }

  const { email, tag } = b;

  if (!tag || !KNOWN_TAGS.has(tag as SubscribeTag)) {
    return NextResponse.json(
      { error: "Invalid subscription tag" },
      { status: 400 },
    );
  }

  const knownTag = tag as SubscribeTag;
  const groupId = GROUP_IDS[knownTag];
  const apiKey = process.env.MAILERLITE_API_KEY;

  if (!apiKey || !groupId) {
    return NextResponse.json({ success: true });
  }

  let mlRes: Response;
  try {
    mlRes = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email, groups: [groupId] }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[subscribe] MailerLite network error:", err);
    return NextResponse.json(
      { error: "Subscription failed. Please try again." },
      { status: 502 },
    );
  }

  if (!mlRes.ok) {
    // Don't log the response body — MailerLite echoes the submitted email
    // in error responses (PII leak into Cloud Logging).
    console.error("[subscribe] MailerLite HTTP error", {
      status: mlRes.status,
      tag: knownTag,
    });
    return NextResponse.json(
      { error: "Subscription failed. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
