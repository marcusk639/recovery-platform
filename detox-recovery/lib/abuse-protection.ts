const DEFAULT_ALLOWED_ORIGINS = [
  "https://nextsteprecovery.io",
  "https://www.nextsteprecovery.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins(): Set<string> {
  const env = process.env.ALLOWED_ORIGINS;
  const list = env
    ? env
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(list);
}

export function checkOrigin(req: Request): { ok: boolean } {
  const origin = req.headers.get("origin");
  if (!origin) return { ok: false };
  return { ok: getAllowedOrigins().has(origin) };
}

export const HONEYPOT_FIELD = "website";

export function checkHoneypot(body: Record<string, unknown>): { ok: boolean } {
  const v = body[HONEYPOT_FIELD];
  if (v === undefined || v === null || v === "") return { ok: true };
  return { ok: false };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitState = new Map<string, number>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function checkRateLimit(
  req: Request,
  route: string,
): { ok: boolean; retryAfter?: number } {
  const ip = getClientIp(req);
  // No forwarding header: dev / direct connections / tests. Skip rather than
  // create a single shared bucket that would block all unauthenticated users.
  if (ip === "unknown") return { ok: true };

  const key = `${ip}:${route}`;
  const last = rateLimitState.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - last)) / 1000);
    return { ok: false, retryAfter };
  }
  rateLimitState.set(key, now);

  if (rateLimitState.size > 10_000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [k, t] of rateLimitState) {
      if (t < cutoff) rateLimitState.delete(k);
    }
  }
  return { ok: true };
}

export function _resetRateLimit(): void {
  rateLimitState.clear();
}
