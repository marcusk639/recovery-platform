# Post-Launch Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After launch, add production visibility (analytics + error monitoring) and improve the "coming soon" service tier experience so visitors have a clear path forward even for unavailable tiers.

**Architecture:** Three independent tasks in order of risk. Task 1 is a small data-file edit with no external dependencies. Task 2 adds one script tag to the layout. Task 3 installs Sentry, which adds an SDK, a config file, and a one-line route wrapper.

**Tech Stack:** Next.js 15 App Router, Cloudflare Analytics (Task 2), Sentry (Task 3), Firebase App Hosting.

---

## Files to create or modify

| Action | File                      | What changes                                              |
| ------ | ------------------------- | --------------------------------------------------------- |
| Modify | `lib/services-data.ts`    | Add `?interest=` query param to coming-soon tier ctaHrefs |
| Modify | `app/layout.tsx`          | Add Cloudflare Analytics script tag                       |
| Create | `sentry.client.config.ts` | Sentry browser-side init                                  |
| Create | `sentry.server.config.ts` | Sentry server-side init                                   |
| Create | `sentry.edge.config.ts`   | Sentry edge-side init                                     |
| Modify | `next.config.ts`          | Wrap with `withSentryConfig`                              |
| Modify | `apphosting.yaml`         | Add `NEXT_PUBLIC_SENTRY_DSN` env var                      |

---

## Task 1: Improve coming-soon service tier CTAs

**Background:** Service tiers 3–5 (Family/Navigation Call, Two-Week Navigation Package, Sliding-Scale) show "coming soon" and link to `/contact`. The contact form already supports `?interest=` pre-fill, which puts the right subject line in the dropdown for the user. Wiring these links to pre-fill the interest reduces friction for visitors who want to express interest.

The five KNOWN_INTERESTS values in `app/api/contact/route.ts` are:
`Patient-Experience Training`, `Withdrawal Journey Mapping`, `Communication Workshops`, `Dropout / Friction Analysis`, `Patient Education Review`, `Digital Health Startup Advisory`, `Sober Living / Housing`, `12-Step / Homegroup Support`, `Other`

None map cleanly to peer support services, so all three coming-soon tiers use `?interest=Other`, which is in the known set and still better than no pre-fill.

**Files:**

- Modify: `lib/services-data.ts`

- [ ] **Step 1.1: Update ctaHrefs for the 3 coming-soon service tiers**

In `lib/services-data.ts`, find the three tiers with `status: "coming-soon"` and update their `ctaHref`:

```ts
  {
    id: "family-call",
    tier: 3,
    name: "60-Minute Family / Navigation Call",
    duration: "60 min",
    price: "$125–$175",
    status: "coming-soon",
    purpose:
      "Help family members understand what may be happening, how to communicate supportively, what red flags require urgent care, and how to help the person connect with appropriate care.",
    cta: "Express interest",
    ctaHref: "/contact?interest=Other",
  },
  {
    id: "navigation-package",
    tier: 4,
    name: "Two-Week Navigation Package",
    duration: "2 weeks",
    price: "$300–$600",
    status: "coming-soon",
    purpose:
      "Limited-term support around treatment navigation, appointment follow-through, family communication, and post-acute recovery planning. This is not medical monitoring or detox management.",
    cta: "Express interest",
    ctaHref: "/contact?interest=Other",
  },
  {
    id: "sliding-scale",
    tier: 5,
    name: "Sliding-Scale / Sponsored Slots",
    duration: "Varies",
    price: "Subsidized",
    status: "coming-soon",
    purpose:
      "Some lower-cost slots may be available when funded by donations or sponsor support. Ask about current availability.",
    cta: "Ask about availability",
    ctaHref: "/contact?interest=Other",
  },
```

The `cta` text changes from the current vague phrases to `"Express interest"` / `"Ask about availability"` — more direct for a waitlist-style CTA on a coming-soon item.

- [ ] **Step 1.2: Run tests to confirm no regression**

```bash
npx jest __tests__/pages/services.test.tsx --no-coverage
```

Expected: All tests in this suite pass. (The services tests check that tier names and descriptions render — they don't assert on CTA text or hrefs, so this change is safe.)

- [ ] **Step 1.3: Verify locally**

```bash
npm run dev
```

Navigate to `http://localhost:3000/services`. Click "Express interest" on any coming-soon tier. Confirm:

- You land on `/contact` with the Interest dropdown pre-selected to "Other"

- [ ] **Step 1.4: Run full suite**

```bash
npm run test -- --no-coverage --ci
```

Expected: 18 suites, 157 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add lib/services-data.ts
git commit -m "ux: pre-fill contact form interest for coming-soon service tiers"
```

---

## Task 2: Add Cloudflare Analytics

**Background:** The site runs behind Cloudflare (nextsteprecovery.io). Cloudflare Analytics is free, privacy-first (no cookies, no GDPR consent banner needed), and requires one script tag. It gives you page views, unique visitors, and top pages.

**Prerequisite:** You must have the Cloudflare dashboard for the nextsteprecovery.io zone. The analytics beacon script URL is found in **Cloudflare Dashboard → nextsteprecovery.io → Analytics & Logs → Web Analytics → Manage site → Get snippet**.

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 2.1: Get your Cloudflare Analytics beacon URL**

1. Log in to https://dash.cloudflare.com
2. Select the `nextsteprecovery.io` zone
3. Navigate to **Analytics & Logs → Web Analytics**
4. If Web Analytics is not enabled: click **Enable Web Analytics** → follow prompts
5. Click **Manage site** → the JS snippet looks like:

```html
<script
  defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_TOKEN_HERE"}'
></script>
```

Copy the token value (the string after `"token": "`).

- [ ] **Step 2.2: Add the script tag to `app/layout.tsx`**

Add a `<Script>` import and the analytics tag to the layout. The full updated file:

```tsx
import type { Metadata } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
import { Header } from "@/components/nav/Header";
import { Footer } from "@/components/nav/Footer";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Withdrawal Support — Find Your Next Safe Step",
  description:
    "Non-clinical support for people navigating withdrawal and the people who care about them.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-white text-slate-900`}>
        <Header />
        <main>{children}</main>
        <Footer />
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CF_BEACON_TOKEN}"}`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
```

The token is read from `NEXT_PUBLIC_CF_BEACON_TOKEN`. When the variable is unset (local dev without the token), the script tag is skipped — no analytics in dev, no console errors.

> **Note on CSP:** The `next.config.ts` CSP currently has `script-src 'self' 'unsafe-inline'`. The Cloudflare beacon loads from `static.cloudflareinsights.com` — a cross-origin script. You must also add the beacon domain to `connect-src` so the beacon can POST analytics data. Update `next.config.ts` in Step 2.5.

- [ ] **Step 2.3: Add the env var to `apphosting.yaml`**

Add `NEXT_PUBLIC_CF_BEACON_TOKEN` as a BUILD + RUNTIME var:

```yaml
- variable: NEXT_PUBLIC_CF_BEACON_TOKEN
  value: "YOUR_TOKEN_HERE"
  availability:
    - BUILD
    - RUNTIME
```

Replace `YOUR_TOKEN_HERE` with the token from Step 2.1.

- [ ] **Step 2.4: Add the env var to `env.example`**

```
# Cloudflare Web Analytics beacon token (public, exposed to browser)
NEXT_PUBLIC_CF_BEACON_TOKEN=
```

- [ ] **Step 2.5: Update CSP in `next.config.ts` to allow the beacon**

The Cloudflare beacon loads a script from `static.cloudflareinsights.com` and POSTs data to `cloudflareinsights.com`. Update the two relevant directives in `securityHeaders`:

```ts
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://cloudflareinsights.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
  // ... rest unchanged
];
```

- [ ] **Step 2.6: Add to CI build env (so build doesn't warn about missing var)**

In `.github/workflows/ci.yml`, under the Build step's `env:` block, add:

```yaml
NEXT_PUBLIC_CF_BEACON_TOKEN: "placeholder"
```

- [ ] **Step 2.7: Run tests and typecheck**

```bash
npm run typecheck && npm run test -- --no-coverage --ci
```

Expected: 18 suites, 157 tests pass, typecheck clean.

- [ ] **Step 2.8: Commit**

```bash
git add app/layout.tsx apphosting.yaml env.example next.config.ts .github/workflows/ci.yml
git commit -m "feat: add Cloudflare Web Analytics beacon"
```

- [ ] **Step 2.9: Deploy and verify**

Push and deploy:

```bash
git push
```

```
! firebase deploy
```

After deploy: open https://nextsteprecovery.io in a browser. Open DevTools → Network tab → filter by `beacon`. You should see a POST request to `cloudflareinsights.com/cdn-cgi/rum` fire within a few seconds. In the Cloudflare dashboard, a new visit should appear in Web Analytics within ~10 minutes.

---

## Task 3: Add Sentry error monitoring

**Background:** Currently, if the contact form route or subscribe route throw an unexpected error in production, there is no alert — the only signal is a user complaining. Sentry's free tier captures up to 5,000 errors/month, sends email alerts, and gives you stack traces with source maps.

**Files:**

- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `next.config.ts`
- Modify: `apphosting.yaml`
- Modify: `env.example`

**Prerequisite:** Create a Sentry account and project before starting.

1. Go to https://sentry.io/signup/ — create a free account
2. Create a new project: **Projects → Create Project → Next.js**
3. Name it `nextsteprecovery`
4. Sentry shows you a DSN that looks like: `https://xxxxx@o000000.ingest.sentry.io/0000000`
5. Copy the DSN — you'll need it in Step 3.3

- [ ] **Step 3.1: Install the Sentry Next.js SDK**

```bash
npm install @sentry/nextjs
```

Expected output ends with: `added N packages`

Run tests to confirm install didn't break anything:

```bash
npm run test -- --no-coverage --ci
```

Expected: 18 suites, 157 tests pass.

- [ ] **Step 3.2: Create `sentry.client.config.ts`**

Create this file at the project root:

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  enabled: process.env.NODE_ENV === "production",
});
```

`tracesSampleRate: 0.1` captures 10% of transactions for performance monitoring — low enough to stay within free tier limits. Replays are disabled to avoid capturing any PHI-adjacent data.

- [ ] **Step 3.3: Create `sentry.server.config.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 3.4: Create `sentry.edge.config.ts`**

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 3.5: Wrap `next.config.ts` with `withSentryConfig`**

The full updated file:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://cloudflareinsights.com https://o*.ingest.sentry.io",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "nextsteprecovery",
  project: "nextsteprecovery",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

> **Note:** If you skipped Task 2 (Cloudflare Analytics), omit `https://static.cloudflareinsights.com` from `script-src` and `https://cloudflareinsights.com` from `connect-src`. The Sentry ingest URL `https://o*.ingest.sentry.io` must still be in `connect-src`.

- [ ] **Step 3.6: Add env vars to `apphosting.yaml`**

Add two entries. The DSN is public (safe to commit). The auth token is a secret (used only at build time for source map upload — never sent to the browser).

```yaml
- variable: NEXT_PUBLIC_SENTRY_DSN
  value: "https://YOUR_DSN_HERE@o000000.ingest.sentry.io/0000000"
  availability:
    - BUILD
    - RUNTIME

- variable: SENTRY_AUTH_TOKEN
  secret: sentry-auth-token
```

For the auth token secret, get it from Sentry:

1. Sentry dashboard → Settings → Auth Tokens → Create new token
2. Scopes needed: `project:releases`, `org:read`
3. Copy the token

Then store it in Firebase Secret Manager (run this in your terminal, not Claude's shell):

```
! npx firebase-tools apphosting:secrets:set sentry-auth-token
```

Paste the token when prompted.

- [ ] **Step 3.7: Add env vars to `env.example`**

```
# Sentry — error monitoring (DSN is public; auth token is build-time only)
NEXT_PUBLIC_SENTRY_DSN=https://YOUR_DSN@o000000.ingest.sentry.io/0000000
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 3.8: Add DSN placeholder to CI build env**

In `.github/workflows/ci.yml`, under the Build step's `env:` block:

```yaml
NEXT_PUBLIC_SENTRY_DSN: "https://placeholder@o000000.ingest.sentry.io/0000000"
```

- [ ] **Step 3.9: Run build + tests + typecheck**

```bash
npm run build 2>&1 | tail -5
npm run typecheck
npm run test -- --no-coverage --ci
```

Expected:

- Build succeeds (may show Sentry source map upload warnings if `SENTRY_AUTH_TOKEN` is not set locally — this is fine)
- Typecheck exits 0
- 18 suites, 157 tests pass

- [ ] **Step 3.10: Commit**

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts \
  next.config.ts apphosting.yaml env.example .github/workflows/ci.yml package.json package-lock.json
git commit -m "feat: add Sentry error monitoring for production API routes"
```

- [ ] **Step 3.11: Deploy and verify**

```bash
git push
```

```
! firebase deploy
```

After deploy: open https://nextsteprecovery.io/contact. Submit the form. No errors should appear. To confirm Sentry is receiving events, temporarily trigger a test error:

1. In Sentry dashboard → Projects → nextsteprecovery → click **Send a test event** (Settings → Projects → nextsteprecovery → Client Keys → Send test event)
2. Confirm the event appears in Sentry's Issues feed within 30 seconds

---

## Verification checklist

- [ ] `/services` coming-soon tiers link to `/contact?interest=Other` and pre-fill the dropdown
- [ ] Cloudflare Analytics beacon fires on page load (visible in DevTools → Network → `beacon`)
- [ ] Cloudflare dashboard shows a visit in Web Analytics within 10 minutes
- [ ] Sentry test event appears in Issues feed
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test -- --no-coverage --ci` shows 18 suites passing
- [ ] CI passes on `main`
