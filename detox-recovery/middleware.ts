import { NextRequest, NextResponse } from "next/server";

// In-memory sliding-window rate limiter.
// Single-instance only — acceptable for Firebase App Hosting at this traffic
// level. For multi-instance scale-out, swap counts for Upstash Redis KV.
const counts = new Map<string, { count: number; resetAt: number }>();

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/contact": { max: 5, windowMs: 60_000 },
  "/api/subscribe": { max: 10, windowMs: 60_000 },
};

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anonymous"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const limit = LIMITS[pathname];
  if (!limit) return NextResponse.next();

  const key = `${pathname}:${clientIp(req)}`;
  const now = Date.now();
  const entry = counts.get(key);

  if (!entry || entry.resetAt <= now) {
    counts.set(key, { count: 1, resetAt: now + limit.windowMs });
    return NextResponse.next();
  }

  if (entry.count >= limit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
      },
    });
  }

  entry.count++;
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/contact", "/api/subscribe"],
};
