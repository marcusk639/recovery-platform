# Feature Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up every placeholder `#` href and non-functional form in the site with real integrations — Calendly scheduling, Stripe payment links, ConvertKit email capture, Resend contact delivery, and a mobile navigation menu.

**Architecture:** Three independent shipping areas: (A) mobile hamburger nav in Header; (B) email capture via a shared `/api/subscribe` route calling ConvertKit, consumed by `LeadMagnetForm`, a new `NewsletterSignup` footer component, and `B2BLeadMagnet`; (C) B2B contact via `/api/contact` route calling Resend, consumed by a new `ContactForm` component on `/contact`. Stripe and Calendly URLs are handled as `NEXT_PUBLIC_*` env vars read directly in `lib/services-data.ts` and `lib/products-data.ts` — no API route needed.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v3, Jest 29 + React Testing Library, ConvertKit API v4, Resend SDK, Node 20+

---

## File Structure

### New files

| Path                                  | Responsibility                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `env.example`                         | Documents every env var needed — committed, no real values                       |
| `app/api/subscribe/route.ts`          | POST handler: validates email + tag, calls ConvertKit form subscription endpoint |
| `app/api/contact/route.ts`            | POST handler: validates fields, sends email via Resend                           |
| `app/contact/page.tsx`                | B2B inquiry page with metadata                                                   |
| `components/contact/ContactForm.tsx`  | Controlled form for B2B inquiries with loading/success/error states              |
| `components/nav/NewsletterSignup.tsx` | Compact inline newsletter form for the Footer (client component)                 |

### Modified files

| Path                                      | Change                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `components/nav/Header.tsx`               | Add `"use client"`, `useState` for mobile menu, hamburger SVG button, slide-out mobile nav                      |
| `components/nav/Footer.tsx`               | Replace static "Subscribe free →" link with `<NewsletterSignup />`                                              |
| `components/resources/LeadMagnetForm.tsx` | Replace `e.preventDefault()` no-op with real fetch to `/api/subscribe`, add loading/success/error states        |
| `components/consulting/B2BLeadMagnet.tsx` | Add `"use client"`, replace static button with inline email form posting to `/api/subscribe`                    |
| `lib/services-data.ts`                    | Replace `"#"` hrefs with `process.env.NEXT_PUBLIC_CALENDLY_*` and `NEXT_PUBLIC_STRIPE_*` with `?? "#"` fallback |
| `lib/products-data.ts`                    | Same pattern — `NEXT_PUBLIC_STRIPE_*` env vars with `?? "#"` fallback                                           |
| `lib/consulting-data.ts`                  | Replace all `ctaHref: "#"` with `ctaHref: "/contact"`                                                           |

### Test files

| Path                                             | What it tests                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `__tests__/components/Header.test.tsx`           | Hamburger opens/closes, mobile nav links visible when open                    |
| `__tests__/components/LeadMagnetForm.test.tsx`   | Form idle state, success state after mock fetch, error state                  |
| `__tests__/components/NewsletterSignup.test.tsx` | Renders form, shows success after mock fetch                                  |
| `__tests__/components/B2BLeadMagnet.test.tsx`    | Renders email input, success state                                            |
| `__tests__/components/ContactForm.test.tsx`      | All fields rendered, success state, error state                               |
| `__tests__/api/subscribe.test.ts`                | 400 on bad email, 400 on bad tag, 200 graceful when ConvertKit not configured |
| `__tests__/api/contact.test.ts`                  | 400 on missing name/email/message, 200 graceful when Resend not configured    |

---

## Task 1: Scaffold Environment Variables

**Files:**

- Create: `env.example`

- [ ] **Step 1: Create `env.example`**

```
# ─────────────────────────────────────────────
# Copy this file to .env.local and fill in real values.
# NEXT_PUBLIC_ vars are safe to expose in the browser.
# All others are server-only.
# ─────────────────────────────────────────────

# ConvertKit (https://app.convertkit.com/account_settings/advanced_settings)
CONVERTKIT_API_KEY=

# ConvertKit Form IDs — one form per audience segment
# Create each form at https://app.convertkit.com/forms
CONVERTKIT_FORM_ID_NEWSLETTER=
CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE=
CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY=
CONVERTKIT_FORM_ID_B2B=

# Calendly — copy the event URL from your Calendly dashboard
NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL=https://calendly.com/YOUR_NAME/fit-check
NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL=https://calendly.com/YOUR_NAME/support-call

# Stripe Payment Links — copy from your Stripe dashboard → Payment Links
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_DONATION_URL=https://donate.stripe.com/REPLACE

# Resend (https://resend.com/api-keys)
RESEND_API_KEY=re_REPLACE
# The email address that receives B2B contact form submissions
RESEND_TO_EMAIL=your@email.com
```

- [ ] **Step 2: Verify `env.example` is tracked by git (not gitignored)**

```bash
git check-ignore -v env.example
```

Expected: no output (not ignored). The existing `.gitignore` uses `.env*` which starts with a dot — `env.example` has no leading dot and is safe.

- [ ] **Step 3: Commit**

```bash
git add env.example
git commit -m "chore: add env.example with all required environment variables"
```

---

## Task 2: Mobile Navigation — Hamburger Menu

**Files:**

- Modify: `components/nav/Header.tsx`
- Create: `__tests__/components/Header.test.tsx`

This task adds a hamburger button and slide-out mobile nav to the Header. The Header must become a client component to use `useState`.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/components/Header.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "@/components/nav/Header";

describe("Header mobile navigation", () => {
  it("renders a hamburger button", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });

  it("shows mobile nav links after clicking hamburger", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    // getAllByText because the links also appear in desktop nav (hidden via CSS in real browser)
    expect(screen.getAllByText("Services").length).toBeGreaterThan(0);
    expect(screen.getAllByText("For Clinicians").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Resources").length).toBeGreaterThan(0);
  });

  it("hamburger button label switches to close when menu is open", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("button", { name: /close menu/i })).toBeInTheDocument();
  });

  it("collapses mobile nav after clicking close", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="Header" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Unable to find role=button" (hamburger doesn't exist yet)

- [ ] **Step 3: Implement the mobile-nav Header**

Replace the entire content of `components/nav/Header.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/consulting", label: "For Clinicians" },
  { href: "/resources", label: "Resources" },
] as const;

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold text-slate-900 hover:text-teal-700"
          onClick={close}
        >
          Withdrawal Support
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-teal-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button
            href="/services#fit-check"
            variant="primary"
            className="hidden sm:inline-block"
          >
            Request a fit check
          </Button>
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-6 pt-4 md:hidden">
          <nav className="flex flex-col gap-4 text-sm font-medium text-slate-700">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-teal-700"
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2">
              <Button
                href="/services#fit-check"
                variant="primary"
                className="block w-full text-center"
                onClick={close}
              >
                Request a fit check
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="Header" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Run all tests to confirm no regressions**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add components/nav/Header.tsx __tests__/components/Header.test.tsx
git commit -m "feat: add mobile hamburger navigation to Header"
```

---

## Task 3: Wire Calendly and Stripe URLs via Env Vars

**Files:**

- Modify: `lib/services-data.ts`
- Modify: `lib/products-data.ts`

Replace all hardcoded `"#"` hrefs with `process.env.NEXT_PUBLIC_*` reads. `NEXT_PUBLIC_` vars are statically inlined by Next.js at build time, so data files can safely reference them. The `?? "#"` fallback ensures the dev server and tests work without any env file.

- [ ] **Step 1: Update `lib/services-data.ts`**

Replace the entire file with:

```typescript
export interface ServiceTier {
  id: string;
  tier: number;
  name: string;
  duration: string;
  price: string;
  betaLabel?: string;
  status: "available" | "coming-soon";
  purpose: string;
  cta: string;
  ctaHref: string;
  calendarHref?: string;
}

export const SERVICE_TIERS: ServiceTier[] = [
  {
    id: "fit-check",
    tier: 1,
    name: "Free 10-Minute Fit Check",
    duration: "10 min",
    price: "Free",
    status: "available",
    purpose:
      "Determine whether the person needs emergency care, medical detox, a licensed clinician, or a non-clinical support call. This is not crisis care, medical triage, diagnosis, or treatment.",
    cta: "Request a fit check",
    ctaHref: process.env.NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL ?? "#",
  },
  {
    id: "support-call",
    tier: 2,
    name: "30-Minute Withdrawal Support Call",
    duration: "30 min",
    price: "$50",
    betaLabel: "Introductory beta pricing",
    status: "available",
    purpose:
      "Non-clinical support, treatment navigation, appointment preparation, and practical next-step planning.",
    cta: "Book a support call",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL ?? "#",
    calendarHref: process.env.NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL ?? "#",
  },
  {
    id: "family-call",
    tier: 3,
    name: "60-Minute Family / Navigation Call",
    duration: "60 min",
    price: "$125–$175",
    status: "coming-soon",
    purpose:
      "Help family members understand what may be happening, how to communicate supportively, what red flags require urgent care, and how to help the person connect with appropriate care.",
    cta: "Plan support for someone you love",
    ctaHref: "/contact",
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
    cta: "Ask about navigation support",
    ctaHref: "/contact",
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
    cta: "Ask about sliding-scale availability",
    ctaHref: "/contact",
  },
];
```

- [ ] **Step 2: Update `lib/products-data.ts`**

Replace the entire file with:

```typescript
export interface Product {
  id: string;
  name: string;
  type:
    | "guide"
    | "worksheet"
    | "workshop"
    | "newsletter"
    | "lead-magnet"
    | "donation";
  price: string | "free";
  description: string;
  cta: string;
  ctaHref: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "family-survival-guide",
    name: "Family Survival Guide",
    type: "guide",
    price: "paid",
    description:
      "A practical guide for family members navigating a loved one's withdrawal — what to watch for, what to say, and when to act.",
    cta: "Get the guide",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL ?? "#",
  },
  {
    id: "appointment-prep",
    name: "Appointment Preparation Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "Step-by-step worksheet to prepare for a medical or treatment appointment — questions to ask, history to gather, goals to set.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL ?? "#",
  },
  {
    id: "withdrawal-safety-checklist",
    name: "Withdrawal Safety Checklist",
    type: "worksheet",
    price: "paid",
    description:
      "A structured checklist for assessing withdrawal severity and identifying when professional medical care is needed.",
    cta: "Download the checklist",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL ?? "#",
  },
  {
    id: "treatment-comparison",
    name: "Detox/Treatment Center Comparison Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "Evaluate treatment options side-by-side across key criteria: medical supervision, insurance, availability, and approach.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL ?? "#",
  },
  {
    id: "relapse-prevention-plan",
    name: "Post-Withdrawal Relapse-Prevention Planning Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "A structured planning tool for the first 30–90 days after acute withdrawal — triggers, support, contingency plans.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL ?? "#",
  },
  {
    id: "family-workshop",
    name: "Low-Cost Group Workshop for Families",
    type: "workshop",
    price: "paid",
    description:
      "A live group session for family members — practical support, community, and actionable next steps.",
    cta: "Join the waitlist",
    ctaHref: "/contact",
  },
  {
    id: "withdrawal-field-notes",
    name: "Withdrawal Field Notes",
    type: "newsletter",
    price: "free",
    description:
      "A practical newsletter on withdrawal, treatment navigation, and recovery — written from lived experience.",
    cta: "Subscribe free",
    ctaHref: "#",
  },
  {
    id: "lead-magnet-unsafe",
    name: "What to Do When Withdrawal Starts Feeling Unsafe",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide on recognizing danger signs during withdrawal and what to do — for the person going through it.",
    cta: "Get the free guide",
    ctaHref: "#",
  },
  {
    id: "lead-magnet-family",
    name: "How to Help Someone in Withdrawal Without Making It Worse",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide for family and friends — how to support without shaming, enabling, or escalating crisis.",
    cta: "Get the free guide",
    ctaHref: "#",
  },
  {
    id: "donation",
    name: "Support a Low-Cost Call",
    type: "donation",
    price: "free",
    description:
      "Donate to fund sliding-scale support calls for people who cannot afford full-price sessions.",
    cta: "Make a donation",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_DONATION_URL ?? "#",
  },
];
```

- [ ] **Step 3: Update `lib/consulting-data.ts`**

Replace all six `ctaHref: "#"` values with `ctaHref: "/contact"`. Replace the entire file:

```typescript
export interface B2BOffer {
  id: string;
  name: string;
  description: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
}

export const B2B_OFFERS: B2BOffer[] = [
  {
    id: "patient-experience-training",
    name: "Patient-Experience Training",
    description: "Staff learn the withdrawal experience from the patient side.",
    bullets: [
      "What withdrawal feels like from the patient side",
      "Why patients panic, leave detox, or disengage",
      "How shame and distrust affect treatment engagement",
    ],
    cta: "Discuss staff training",
    ctaHref: "/contact",
  },
  {
    id: "journey-mapping",
    name: "Withdrawal Journey Mapping",
    description:
      "Map the patient experience from first call to post-discharge.",
    bullets: [
      "Map the experience from first call to intake, acute withdrawal, discharge, and relapse-risk period",
      "Identify friction points and trust breaks",
    ],
    cta: "Request a patient-experience review",
    ctaHref: "/contact",
  },
  {
    id: "communication-workshops",
    name: "Communication Workshops",
    description:
      "Practical language that reduces shame, fear, and defensiveness.",
    bullets: [
      "How staff can speak to patients in withdrawal without escalating shame, fear, or defensiveness",
      "Practical language examples and anti-patterns",
    ],
    cta: "Discuss staff training",
    ctaHref: "/contact",
  },
  {
    id: "dropout-analysis",
    name: "Dropout / Friction Analysis",
    description:
      "Identify where patients abandon care and recommend improvements.",
    bullets: [
      "Review where patients abandon care",
      "Recommend non-clinical workflow improvements",
    ],
    cta: "Request a patient-experience review",
    ctaHref: "/contact",
  },
  {
    id: "patient-education-review",
    name: "Patient Education Review",
    description: "Evaluate materials for clarity, empathy, and usefulness.",
    bullets: [
      "Review handouts, website copy, onboarding materials, and discharge instructions for clarity, empathy, and usefulness",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "/contact",
  },
  {
    id: "startup-advisory",
    name: "Digital Health / Recovery Startup Advisory",
    description:
      "Patient-experience and product design advisory for recovery startups.",
    bullets: [
      "Advise recovery, MOUD, detox-navigation, peer-support, and behavioral health startups on patient experience and product design",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "/contact",
  },
];
```

- [ ] **Step 4: Run all tests to confirm no regressions**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (env vars are undefined in test env, `?? "#"` fallback keeps hrefs at `"#"` which existing tests tolerate)

- [ ] **Step 5: Commit**

```bash
git add lib/services-data.ts lib/products-data.ts lib/consulting-data.ts
git commit -m "feat: wire Calendly and Stripe URLs via NEXT_PUBLIC env vars"
```

---

## Task 4: ConvertKit Subscribe API Route

**Files:**

- Create: `app/api/subscribe/route.ts`
- Create: `__tests__/api/subscribe.test.ts`

A single POST endpoint that accepts `{ email, tag }`, validates both, and calls the ConvertKit v4 form subscription API. When `CONVERTKIT_API_KEY` or the form ID for the given tag is not set, it logs a warning and returns `{ success: true }` so the form works during local development.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/api/subscribe.test.ts
import { POST } from "@/app/api/subscribe/route";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});
afterEach(() => {
  jest.resetAllMocks();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/subscribe", () => {
  it("returns 400 when email is missing", async () => {
    const res = await POST(
      makeRequest({ tag: "newsletter-withdrawal-field-notes" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when email has no @ sign", async () => {
    const res = await POST(
      makeRequest({
        email: "notanemail",
        tag: "newsletter-withdrawal-field-notes",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when tag is not a known value", async () => {
    const res = await POST(
      makeRequest({ email: "user@example.com", tag: "unknown-tag" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/tag/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/subscribe", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with success:true when ConvertKit is not configured (graceful degradation)", async () => {
    // In test env, CONVERTKIT_API_KEY and form IDs are undefined → graceful return
    const res = await POST(
      makeRequest({
        email: "user@example.com",
        tag: "newsletter-withdrawal-field-notes",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // fetch should NOT have been called (ConvertKit not configured)
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="api/subscribe" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '@/app/api/subscribe/route'"

- [ ] **Step 3: Create `app/api/subscribe/route.ts`**

```typescript
import { NextResponse } from "next/server";

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

const FORM_IDS: Record<SubscribeTag, string | undefined> = {
  "newsletter-withdrawal-field-notes":
    process.env.CONVERTKIT_FORM_ID_NEWSLETTER,
  "lead-magnet-unsafe": process.env.CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE,
  "lead-magnet-family": process.env.CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY,
  "lead-magnet-b2b": process.env.CONVERTKIT_FORM_ID_B2B,
};

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).email !== "string" ||
    !(body as Record<string, unknown>).email.toString().includes("@")
  ) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 },
    );
  }

  const { email, tag } = body as Record<string, unknown>;

  if (!tag || !KNOWN_TAGS.has(tag as SubscribeTag)) {
    return NextResponse.json(
      { error: "Invalid subscription tag" },
      { status: 400 },
    );
  }

  const knownTag = tag as SubscribeTag;
  const formId = FORM_IDS[knownTag];
  const apiKey = process.env.CONVERTKIT_API_KEY;

  if (!apiKey || !formId) {
    console.warn(`[subscribe] ConvertKit not configured for tag: ${knownTag}`);
    return NextResponse.json({ success: true });
  }

  const ckRes = await fetch(
    `https://api.convertkit.com/v4/forms/${formId}/subscriptions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email_address: email }),
    },
  );

  if (!ckRes.ok) {
    const errText = await ckRes.text();
    console.error("[subscribe] ConvertKit error:", errText);
    return NextResponse.json(
      { error: "Subscription failed. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="api/subscribe" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add app/api/subscribe/route.ts __tests__/api/subscribe.test.ts
git commit -m "feat: add ConvertKit email subscription API route"
```

---

## Task 5: Wire LeadMagnetForm to Real Subscription API

**Files:**

- Modify: `components/resources/LeadMagnetForm.tsx`
- Create: `__tests__/components/LeadMagnetForm.test.tsx`

Replace the `e.preventDefault()` no-op with a real `fetch` to `/api/subscribe`. Add loading/success/error states. The existing `data-tag` attribute on the form is removed (replaced by the tag passed to the API).

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/components/LeadMagnetForm.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeadMagnetForm } from "@/components/resources/LeadMagnetForm";

const mockFetch = jest.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => { jest.resetAllMocks(); });

describe("LeadMagnetForm", () => {
  it("renders email input and submit button in idle state", () => {
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    expect(screen.getByPlaceholderText(/your email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send me the guide/i })).toBeInTheDocument();
  });

  it("uses custom buttonLabel when provided", () => {
    render(
      <LeadMagnetForm
        title="Newsletter"
        description="Subscribe"
        tag="newsletter-withdrawal-field-notes"
        buttonLabel="Subscribe free"
      />,
    );
    expect(screen.getByRole("button", { name: /subscribe free/i })).toBeInTheDocument();
  });

  it("shows success message after successful API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/you're in/i)).toBeInTheDocument();
    });
  });

  it("shows error message when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Subscription failed. Please try again." }),
    });
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/subscription failed/i)).toBeInTheDocument();
    });
  });

  it("shows generic error when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="LeadMagnetForm" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "unable to find text: you're in" (form doesn't submit yet)

- [ ] **Step 3: Implement the updated `components/resources/LeadMagnetForm.tsx`**

```tsx
"use client";

import { useState } from "react";

interface LeadMagnetFormProps {
  title: string;
  description: string;
  tag: string;
  buttonLabel?: string;
}

export function LeadMagnetForm({
  title,
  description,
  tag,
  buttonLabel = "Send me the guide",
}: LeadMagnetFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tag }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-6">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>

      {status === "success" ? (
        <p className="mt-4 text-sm font-medium text-teal-700">
          You&apos;re in. Check your inbox.
        </p>
      ) : (
        <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            required
            disabled={status === "loading"}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {status === "loading" ? "Sending…" : buttonLabel}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run new tests to verify they pass**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="LeadMagnetForm" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 5 tests

- [ ] **Step 5: Run all tests to confirm no regressions**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add components/resources/LeadMagnetForm.tsx __tests__/components/LeadMagnetForm.test.tsx
git commit -m "feat: wire LeadMagnetForm to ConvertKit subscription API"
```

---

## Task 6: Newsletter Signup Component for Footer

**Files:**

- Create: `components/nav/NewsletterSignup.tsx`
- Modify: `components/nav/Footer.tsx`
- Create: `__tests__/components/NewsletterSignup.test.tsx`

The Footer must stay a Server Component. Extract the email form into a small client component `NewsletterSignup` that calls `/api/subscribe` with tag `newsletter-withdrawal-field-notes`. Then swap the static "Subscribe free →" link in Footer with `<NewsletterSignup />`.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/components/NewsletterSignup.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsletterSignup } from "@/components/nav/NewsletterSignup";

const mockFetch = jest.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => { jest.resetAllMocks(); });

describe("NewsletterSignup", () => {
  it("renders email input and subscribe button", () => {
    render(<NewsletterSignup />);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /subscribe/i })).toBeInTheDocument();
  });

  it("shows confirmation after successful subscription", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    render(<NewsletterSignup />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => {
      expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="NewsletterSignup" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '@/components/nav/NewsletterSignup'"

- [ ] **Step 3: Create `components/nav/NewsletterSignup.tsx`**

```tsx
"use client";

import { useState } from "react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "subscribed">(
    "idle",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, tag: "newsletter-withdrawal-field-notes" }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("subscribed");
    } else {
      setStatus("idle");
    }
  };

  if (status === "subscribed") {
    return (
      <p className="mt-2 text-sm font-medium text-teal-700">Subscribed.</p>
    );
  }

  return (
    <form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        required
        disabled={status === "loading"}
        className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        Subscribe
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Update `components/nav/Footer.tsx`**

Replace the newsletter column (the third `<div>` in the grid) with `<NewsletterSignup />`:

```tsx
import Link from "next/link";
import { NewsletterSignup } from "@/components/nav/NewsletterSignup";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">Withdrawal Support</p>
            <p className="mt-2 text-sm text-slate-600">
              Non-clinical support for people navigating withdrawal and the
              people who care about them.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Services</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>
                <Link
                  href="/services#fit-check"
                  className="hover:text-teal-700"
                >
                  Free Fit Check
                </Link>
              </li>
              <li>
                <Link
                  href="/services#support-call"
                  className="hover:text-teal-700"
                >
                  Support Call
                </Link>
              </li>
              <li>
                <Link href="/consulting" className="hover:text-teal-700">
                  For Clinicians
                </Link>
              </li>
              <li>
                <Link href="/resources" className="hover:text-teal-700">
                  Resources
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Withdrawal Field Notes
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Practical notes on withdrawal, treatment, and recovery.
            </p>
            <NewsletterSignup />
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <p>
            This service provides non-clinical support only. It is not medical
            care, crisis intervention, diagnosis, or treatment. If you are
            experiencing a medical emergency, call 911 or go to your nearest
            emergency room.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Run all tests**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add components/nav/NewsletterSignup.tsx components/nav/Footer.tsx __tests__/components/NewsletterSignup.test.tsx
git commit -m "feat: add NewsletterSignup component and wire Footer newsletter form"
```

---

## Task 7: Wire B2BLeadMagnet to Email Capture

**Files:**

- Modify: `components/consulting/B2BLeadMagnet.tsx`
- Create: `__tests__/components/B2BLeadMagnet.test.tsx`

Replace the static "Download the free guide" button with an inline email form that POSTs to `/api/subscribe` with tag `lead-magnet-b2b`. The component becomes a client component.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/components/B2BLeadMagnet.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { B2BLeadMagnet } from "@/components/consulting/B2BLeadMagnet";

const mockFetch = jest.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => { jest.resetAllMocks(); });

describe("B2BLeadMagnet", () => {
  it("renders the guide title and an email input", () => {
    render(<B2BLeadMagnet />);
    expect(
      screen.getByText(/10 ways detox programs lose patient trust/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/work email/i)).toBeInTheDocument();
  });

  it("shows confirmation after successful subscription", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    render(<B2BLeadMagnet />);
    fireEvent.change(screen.getByPlaceholderText(/work email/i), {
      target: { value: "director@clinic.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="B2BLeadMagnet" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "unable to find placeholder: work email"

- [ ] **Step 3: Update `components/consulting/B2BLeadMagnet.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Section } from "@/components/ui/Section";

export function B2BLeadMagnet() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, tag: "lead-magnet-b2b" }),
    }).catch(() => null);
    setStatus(res?.ok ? "success" : "error");
  };

  return (
    <Section className="bg-teal-50">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          10 Ways Detox Programs Lose Patient Trust Before Treatment Even Starts
        </h2>
        <p className="mt-4 text-slate-600">
          A free guide — pattern recognition from hundreds of patient-side
          withdrawal experiences.
        </p>
        {status === "success" ? (
          <p className="mt-8 text-sm font-medium text-teal-700">
            Check your inbox for the guide.
          </p>
        ) : (
          <form
            className="mx-auto mt-8 flex max-w-md gap-2"
            onSubmit={handleSubmit}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your work email"
              required
              disabled={status === "loading"}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {status === "loading" ? "Sending…" : "Download free guide"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p className="mt-3 text-xs text-red-600">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/consulting/B2BLeadMagnet.tsx __tests__/components/B2BLeadMagnet.test.tsx
git commit -m "feat: wire B2BLeadMagnet to email capture API"
```

---

## Task 8: B2B Contact Form API Route (Resend)

**Files:**

- Create: `app/api/contact/route.ts`
- Create: `__tests__/api/contact.test.ts`

A POST endpoint that validates name, email, and message, then sends an email via Resend. When `RESEND_API_KEY` or `RESEND_TO_EMAIL` is not configured, it logs and returns `{ success: true }` for graceful local dev behavior.

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

Expected: `+ resend@x.y.z` added to `package.json` dependencies

- [ ] **Step 2: Write the failing tests**

```typescript
// __tests__/api/contact.test.ts
import { POST } from "@/app/api/contact/route";

// Mock Resend so tests never call the real API
jest.mock("resend", () => {
  const mockSend = jest.fn().mockResolvedValue({ id: "mock-email-id" });
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
  };
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", message: "Hello" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/name/i);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await POST(
      makeRequest({ name: "Dr Smith", email: "notvalid", message: "Hello" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({ name: "Dr Smith", email: "a@b.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/message/i);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/contact", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with success:true when Resend is not configured", async () => {
    // In test env, RESEND_API_KEY and RESEND_TO_EMAIL are undefined
    const res = await POST(
      makeRequest({
        name: "Dr Smith",
        email: "a@b.com",
        message: "Interested.",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="api/contact" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '@/app/api/contact/route'"

- [ ] **Step 4: Create `app/api/contact/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!b.email || typeof b.email !== "string" || !b.email.includes("@")) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!b.message || typeof b.message !== "string" || !b.message.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.RESEND_TO_EMAIL;

  if (!apiKey || !toEmail) {
    console.warn("[contact] Resend not configured — skipping email delivery");
    return NextResponse.json({ success: true });
  }

  const resend = new Resend(apiKey);

  const lines = [
    `Name: ${b.name}`,
    `Email: ${b.email}`,
    b.organization ? `Organization: ${b.organization}` : "",
    b.interest ? `Interest: ${b.interest}` : "",
    "",
    `Message:\n${b.message}`,
  ].filter(Boolean);

  await resend.emails.send({
    from: "Withdrawal Support <onboarding@resend.dev>",
    to: toEmail,
    replyTo: b.email as string,
    subject: `New inquiry from ${b.name}`,
    text: lines.join("\n"),
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="api/contact" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add app/api/contact/route.ts __tests__/api/contact.test.ts package.json package-lock.json
git commit -m "feat: add B2B contact form API route with Resend email delivery"
```

---

## Task 9: ContactForm Component

**Files:**

- Create: `components/contact/ContactForm.tsx`
- Create: `__tests__/components/ContactForm.test.tsx`

A controlled form with name, email, organization (optional), area of interest (select, optional), and message. Posts to `/api/contact`. Shows loading, success, and error states.

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/components/ContactForm.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "@/components/contact/ContactForm";

const mockFetch = jest.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => { jest.resetAllMocks(); });

describe("ContactForm", () => {
  it("renders name, email, organization, interest, message, and submit button", () => {
    render(<ContactForm />);
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/area of interest/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });

  it("shows all B2B interest options in the select", () => {
    render(<ContactForm />);
    const select = screen.getByLabelText(/area of interest/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain("Patient-Experience Training");
    expect(options).toContain("Digital Health Startup Advisory");
  });

  it("shows success state after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Smith" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "dr@clinic.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Interested in staff training." } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/message received/i)).toBeInTheDocument();
    });
  });

  it("shows error message when API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Something went wrong. Please try again." }),
    });
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Smith" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "dr@clinic.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hello." } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it("shows generic error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Smith" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "dr@clinic.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hello." } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test -- --testPathPattern="ContactForm" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '@/components/contact/ContactForm'"

- [ ] **Step 3: Create `components/contact/ContactForm.tsx`**

```tsx
"use client";

import { useState } from "react";

const INTERESTS = [
  "Patient-Experience Training",
  "Withdrawal Journey Mapping",
  "Communication Workshops",
  "Dropout / Friction Analysis",
  "Patient Education Review",
  "Digital Health Startup Advisory",
  "Other",
] as const;

type Interest = (typeof INTERESTS)[number];

interface Fields {
  name: string;
  email: string;
  organization: string;
  interest: Interest | "";
  message: string;
}

const INITIAL: Fields = {
  name: "",
  email: "",
  organization: "",
  interest: "",
  message: "",
};

export function ContactForm() {
  const [fields, setFields] = useState<Fields>(INITIAL);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set =
    (key: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50";

  if (status === "success") {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-8 text-center">
        <p className="text-lg font-semibold text-teal-800">Message received.</p>
        <p className="mt-2 text-sm text-slate-600">
          I&apos;ll be in touch within 2 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          Name
        </label>
        <input
          id="name"
          type="text"
          value={fields.name}
          onChange={set("name")}
          required
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={fields.email}
          onChange={set("email")}
          required
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="organization"
          className="block text-sm font-medium text-slate-700"
        >
          Organization{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="organization"
          type="text"
          value={fields.organization}
          onChange={set("organization")}
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="interest"
          className="block text-sm font-medium text-slate-700"
        >
          Area of interest{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <select
          id="interest"
          value={fields.interest}
          onChange={set("interest")}
          disabled={status === "loading"}
          className={inputClass}
        >
          <option value="">Select an area…</option>
          {INTERESTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="message"
          className="block text-sm font-medium text-slate-700"
        >
          Message
        </label>
        <textarea
          id="message"
          value={fields.message}
          onChange={set("message")}
          required
          rows={5}
          disabled={status === "loading"}
          className={inputClass}
        />
      </div>

      {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {status === "loading" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run all tests**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/contact/ContactForm.tsx __tests__/components/ContactForm.test.tsx
git commit -m "feat: add ContactForm component with loading/success/error states"
```

---

## Task 10: Contact Page + Wire B2B CTAs

**Files:**

- Create: `app/contact/page.tsx`
- Modify: `components/consulting/ConsultingHero.tsx`

Create the `/contact` route and update `ConsultingHero` so its CTA links to `/contact` instead of `#`.

- [ ] **Step 1: Create `app/contact/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — Withdrawal Support",
  description:
    "Reach out about patient-experience consulting, staff training, startup advisory, or other B2B inquiries.",
};

export default function ContactPage() {
  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Get in touch</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          For consulting, staff training, or startup advisory inquiries, use the
          form below. I respond to all B2B inquiries within 2 business days.
        </p>
      </Section>
      <Section>
        <div className="mx-auto max-w-xl">
          <ContactForm />
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 2: Update `components/consulting/ConsultingHero.tsx`**

Replace the `href="#"` on the CTA button with `href="/contact"`:

```tsx
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function ConsultingHero() {
  return (
    <Section className="bg-slate-900 py-20 text-white">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-400">
          For Treatment Programs &amp; Recovery Startups
        </p>
        <h1 className="mt-4 text-3xl font-bold leading-tight">
          Patient-Experience Consulting for Withdrawal Care
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          I help treatment teams understand the patient experience of withdrawal
          so they can improve trust, engagement, communication, and retention.
        </p>
        <p className="mt-4 text-slate-400">
          This is not clinical protocol training. The value is patient-side
          insight — what withdrawal feels like, where trust breaks, why patients
          leave, and how language and process either help or harm.
        </p>
        <div className="mt-8">
          <Button href="/contact" variant="primary">
            Get in touch
          </Button>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Write a smoke test for the contact page**

```typescript
// __tests__/pages/contact.test.tsx
import { render, screen } from "@testing-library/react";
import ContactPage from "@/app/contact/page";

describe("Contact page", () => {
  it("renders the page heading", () => {
    render(<ContactPage />);
    expect(screen.getByRole("heading", { name: /get in touch/i })).toBeInTheDocument();
  });

  it("renders the contact form", () => {
    render(<ContactPage />);
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.0 --silent && npm test --no-coverage 2>&1 | tail -30
```

Expected: all tests pass — including the new contact page smoke tests

- [ ] **Step 5: Verify no `"#"` hrefs remain in components (only acceptable in data-layer fallbacks)**

```bash
grep -rn 'href="#"' /Users/marcusklein/dev/detox-recovery/components /Users/marcusklein/dev/detox-recovery/app --include="*.tsx" | grep -v node_modules
```

Expected: no output (all `href="#"` replaced with real routes or real URLs)

- [ ] **Step 6: Commit**

```bash
git add app/contact/page.tsx components/consulting/ConsultingHero.tsx __tests__/pages/contact.test.tsx
git commit -m "feat: add contact page and wire all B2B CTAs to /contact"
```

---

## Self-Review

**1. Spec coverage against `prompts/project-init.md`:**

| Requirement                   | Task                       |
| ----------------------------- | -------------------------- |
| All `#` CTAs replaced         | Tasks 3, 7, 10             |
| Calendly scheduling links     | Task 3                     |
| Stripe Payment Links          | Task 3                     |
| Email newsletter integration  | Tasks 4, 5, 6              |
| Mobile navigation             | Task 2                     |
| B2B inquiry routing           | Tasks 8, 9, 10             |
| B2B lead magnet email capture | Task 7                     |
| ConvertKit tag segmentation   | Task 4 (tag → form ID map) |

All spec requirements are covered.

**2. Placeholder scan:** No TBD, TODO, or incomplete sections in this plan.

**3. Type consistency:**

- `SubscribeTag` union type defined in Task 4 and referenced only in `route.ts`
- `Fields` interface defined in Task 9 (ContactForm) — not referenced externally
- `Interest` type derived from `INTERESTS as const` in Task 9 — consistent usage
- `ServiceTier` and `Product` interfaces unchanged from existing `lib/` files
- `B2BOffer` interface unchanged — only `ctaHref` values changed in Task 3
