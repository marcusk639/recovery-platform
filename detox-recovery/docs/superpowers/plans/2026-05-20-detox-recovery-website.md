# Detox Recovery Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-facing website for a non-clinical withdrawal support service with a five-tier service ladder, B2B consulting page, downloadable resource products, and sitewide monetization scaffolding (Stripe, Calendly, email, analytics TODO comments).

**Architecture:** Next.js 15 App Router static site with TypeScript and Tailwind CSS v3. All pages are React Server Components by default. Client components are isolated to interactive islands (forms, modals). No backend — all CTAs wire to external services (Stripe Payment Links, Calendly, ConvertKit/Mailchimp) via TODO comments.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v3 (pinned — see Task 1 Step 1a), Jest 29, React Testing Library 14

---

## File Map

```
app/
  layout.tsx                        # Root layout: <html>, Header, Footer
  page.tsx                          # Homepage
  globals.css                       # Tailwind base + custom properties
  services/
    page.tsx                        # Services page: comparison table, referral rules
  consulting/
    page.tsx                        # B2B: Patient-Experience Consulting
  resources/
    page.tsx                        # Consumer products + lead magnets

components/
  nav/
    Header.tsx                      # Logo, nav links, primary CTA button
    Footer.tsx                      # Links, disclaimer, newsletter signup TODO
  ui/
    Button.tsx                      # Variant: primary | secondary | ghost
    Badge.tsx                       # "Beta pricing", "Coming soon" labels
    Section.tsx                     # Full-width section wrapper with max-width container
    Card.tsx                        # Service / product card shell
  home/
    HeroSection.tsx                 # Core promise headline + two CTAs
    ServiceLadderPreview.tsx        # Cards for tiers 1–3 with tier 4–5 teaser
    TrustSignals.tsx                # "What this is / isn't" two-column explainer
  services/
    ServiceComparisonTable.tsx      # Tier comparison table (all 5 tiers)
    WhatICanHelp.tsx                # Two-column: can vs. cannot
    ReferralTriggers.tsx            # "When I refer you out immediately"
    ServiceCard.tsx                 # Expanded service card with CTA
  consulting/
    ConsultingHero.tsx              # B2B headline + positioning statement
    B2BOffers.tsx                   # Six offer cards
    B2BLeadMagnet.tsx               # "10 Ways" downloadable guide CTA
  resources/
    ProductCard.tsx                 # Product card: title, description, price, CTA
    LeadMagnetForm.tsx              # Email capture form with TODO integration

lib/
  services-data.ts                  # Source of truth for all service tier data
  products-data.ts                  # Source of truth for all product data
  consulting-data.ts                # Source of truth for B2B offer data
  referral-conditions.ts            # Array of all medical referral trigger conditions

__tests__/
  pages/
    home.test.tsx
    services.test.tsx
    consulting.test.tsx
    resources.test.tsx
  components/
    ServiceComparisonTable.test.tsx
    ReferralTriggers.test.tsx
    WhatICanHelp.test.tsx
```

---

## Task 1: Project Bootstrap

**Files:**

- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `tailwind.config.ts`
- Modify: `package.json`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Create: `tsconfig.json`
- Create: `next.config.ts`

- [ ] **Step 1: Initialize Next.js 15 with TypeScript and Tailwind**

```bash
cd /Users/marcusklein/dev/detox-recovery
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --yes
```

Expected output: Next.js project scaffolded in current directory. `app/`, `components/` (empty), `public/` created.

> **Warning:** The directory already contains files (`.serena/`, `docs/`, `prompts/`). The `--yes` flag will overwrite `package.json`. Back up any needed content before running.

- [ ] **Step 1a: Pin Tailwind to v3**

`create-next-app` may install Tailwind v4, which uses CSS-based config and drops `tailwind.config.ts`. This plan uses v3 syntax (`tailwind.config.ts`, `content` array, `theme.extend`). Pin to v3 immediately after scaffolding:

```bash
npm install tailwindcss@^3 --save-dev
```

Confirm version: `npx tailwindcss --version` should print `3.x.x`.

- [ ] **Step 2: Install testing dependencies**

```bash
npm install --save-dev jest @jest/globals jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom \
  @types/jest ts-jest
```

- [ ] **Step 3: Write `jest.config.ts`**

```typescript
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};

export default createJestConfig(config);
```

- [ ] **Step 4: Write `jest.setup.ts`**

```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Add test script to `package.json`**

Open `package.json` and add to `scripts`:

```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

- [ ] **Step 6: Write the first failing smoke test**

Create `__tests__/pages/home.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

describe('Homepage', () => {
  it('renders the core promise headline', () => {
    render(<Home />)
    expect(
      screen.getByText(/help people find the next safe step/i)
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run test and confirm it fails**

```bash
npm test -- home.test.tsx
```

Expected: FAIL — `app/page.tsx` exists but doesn't contain the headline yet (default Next.js boilerplate).

- [ ] **Step 8: Commit**

> **Note:** The repo already has untracked files (`.serena/`, `docs/`, `prompts/`). Do NOT use `git add -A` here — it will bundle those into the bootstrap commit. Use explicit paths for Next.js-scaffolded files only:

```bash
git add app/ public/ components/ package.json package-lock.json \
  jest.config.ts jest.setup.ts tsconfig.json next.config.ts \
  tailwind.config.ts postcss.config.mjs .gitignore \
  __tests__/
git commit -m "chore: bootstrap Next.js 15 + Tailwind + Jest"
```

---

## Task 2: Shared UI Primitives

**Files:**

- Create: `components/ui/Button.tsx`
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Section.tsx`
- Create: `components/ui/Card.tsx`

These four primitives are used everywhere. Define them once so every task after this can import them without changes.

- [ ] **Step 1: Create `components/ui/Button.tsx`**

```tsx
type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  href: string;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 focus:ring-teal-500",
  secondary:
    "border-2 border-teal-700 text-teal-700 hover:bg-teal-50 focus:ring-teal-500",
  ghost: "text-teal-700 underline hover:text-teal-900 focus:ring-teal-500",
};

export function Button({
  variant = "primary",
  href,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <a
      href={href}
      className={`inline-block rounded-md px-6 py-3 text-sm font-semibold transition-colors
        focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </a>
  );
}
```

- [ ] **Step 2: Create `components/ui/Badge.tsx`**

```tsx
type BadgeColor = "teal" | "amber" | "slate";

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
}

const colorClasses: Record<BadgeColor, string> = {
  teal: "bg-teal-100 text-teal-800",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-700",
};

export function Badge({ children, color = "teal" }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${colorClasses[color]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Create `components/ui/Section.tsx`**

```tsx
interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = "", id }: SectionProps) {
  return (
    <section id={id} className={`py-16 px-4 ${className}`}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Create `components/ui/Card.tsx`**

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/
git commit -m "feat: add shared UI primitives (Button, Badge, Section, Card)"
```

---

## Task 3: Data Layer (Source-of-Truth Files)

**Files:**

- Create: `lib/services-data.ts`
- Create: `lib/products-data.ts`
- Create: `lib/consulting-data.ts`
- Create: `lib/referral-conditions.ts`

These files are the single source of truth for all content. Tests will import from here to confirm data completeness, not hardcode strings.

- [ ] **Step 1: Write the failing referral conditions test (RED)**

This is safety-critical content — write the test before the implementation. Create `__tests__/components/ReferralTriggers.test.tsx`:

```typescript
import { REFERRAL_CONDITIONS } from "@/lib/referral-conditions";

describe("REFERRAL_CONDITIONS", () => {
  const required = [
    "alcohol withdrawal",
    "benzodiazepine withdrawal",
    "barbiturate withdrawal",
    "GHB or GBL withdrawal",
    "phenibut withdrawal",
    "history of seizures",
    "hallucinations",
    "delirium or acute confusion",
    "pregnancy",
    "suicidal ideation",
    "chest pain",
    "fainting or loss of consciousness",
    "severe dehydration",
    "unstable vital signs",
    "severe psychiatric symptoms",
    "complex polysubstance withdrawal",
  ];

  required.forEach((condition) => {
    it(`includes "${condition}"`, () => {
      expect(REFERRAL_CONDITIONS).toContain(condition);
    });
  });
});
```

- [ ] **Step 2: Run and confirm it fails (module not found)**

```bash
npm test -- ReferralTriggers.test.tsx
```

Expected: FAIL — `Cannot find module '@/lib/referral-conditions'`.

- [ ] **Step 3: Write `lib/referral-conditions.ts` (GREEN)**

```typescript
export const REFERRAL_CONDITIONS = [
  "alcohol withdrawal",
  "benzodiazepine withdrawal",
  "barbiturate withdrawal",
  "GHB or GBL withdrawal",
  "phenibut withdrawal",
  "history of seizures",
  "hallucinations",
  "delirium or acute confusion",
  "pregnancy",
  "suicidal ideation",
  "chest pain",
  "fainting or loss of consciousness",
  "severe dehydration",
  "unstable vital signs",
  "severe psychiatric symptoms",
  "complex polysubstance withdrawal",
] as const;

export type ReferralCondition = (typeof REFERRAL_CONDITIONS)[number];
```

- [ ] **Step 3a: Run and confirm it passes**

```bash
npm test -- ReferralTriggers.test.tsx
```

Expected: PASS — all 16 conditions are present.

- [ ] **Step 4: Write `lib/services-data.ts`**

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
    ctaHref: "#", // TODO: Replace with Calendly link for fit check scheduling
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
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for $50 support call
    calendarHref: "#", // TODO: Replace with Calendly booking link
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
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for family call
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
    ctaHref: "#", // TODO: Replace with contact form or email link
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
    ctaHref: "#", // TODO: Replace with contact form or email link
  },
];
```

- [ ] **Step 5: Write `lib/products-data.ts`**

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
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for family survival guide PDF
  },
  {
    id: "appointment-prep",
    name: "Appointment Preparation Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "Step-by-step worksheet to prepare for a medical or treatment appointment — questions to ask, history to gather, goals to set.",
    cta: "Download the worksheet",
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for appointment prep PDF
  },
  {
    id: "withdrawal-safety-checklist",
    name: "Withdrawal Safety Checklist",
    type: "worksheet",
    price: "paid",
    description:
      "A structured checklist for assessing withdrawal severity and identifying when professional medical care is needed.",
    cta: "Download the checklist",
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for safety checklist PDF
  },
  {
    id: "treatment-comparison",
    name: "Detox/Treatment Center Comparison Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "Evaluate treatment options side-by-side across key criteria: medical supervision, insurance, availability, and approach.",
    cta: "Download the worksheet",
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for comparison worksheet PDF
  },
  {
    id: "relapse-prevention-plan",
    name: "Post-Withdrawal Relapse-Prevention Planning Worksheet",
    type: "worksheet",
    price: "paid",
    description:
      "A structured planning tool for the first 30–90 days after acute withdrawal — triggers, support, contingency plans.",
    cta: "Download the worksheet",
    ctaHref: "#", // TODO: Replace with Stripe Payment Link for relapse prevention worksheet PDF
  },
  {
    id: "family-workshop",
    name: "Low-Cost Group Workshop for Families",
    type: "workshop",
    price: "paid",
    description:
      "A live group session for family members — practical support, community, and actionable next steps.",
    cta: "Join the waitlist",
    ctaHref: "#", // TODO: Replace with email waitlist signup (ConvertKit/Mailchimp tag: family-workshop)
  },
  {
    id: "withdrawal-field-notes",
    name: "Withdrawal Field Notes",
    type: "newsletter",
    price: "free",
    description:
      "A practical newsletter on withdrawal, treatment navigation, and recovery — written from lived experience.",
    cta: "Subscribe free",
    ctaHref: "#", // TODO: Replace with email newsletter signup (ConvertKit/Mailchimp form)
  },
  {
    id: "lead-magnet-unsafe",
    name: "What to Do When Withdrawal Starts Feeling Unsafe",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide on recognizing danger signs during withdrawal and what to do — for the person going through it.",
    cta: "Get the free guide",
    ctaHref: "#", // TODO: Replace with email capture form (ConvertKit/Mailchimp tag: lead-magnet-unsafe)
  },
  {
    id: "lead-magnet-family",
    name: "How to Help Someone in Withdrawal Without Making It Worse",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide for family and friends — how to support without shaming, enabling, or escalating crisis.",
    cta: "Get the free guide",
    ctaHref: "#", // TODO: Replace with email capture form (ConvertKit/Mailchimp tag: lead-magnet-family)
  },
  {
    id: "donation",
    name: "Support a Low-Cost Call",
    type: "donation",
    price: "free",
    description:
      "Donate to fund sliding-scale support calls for people who cannot afford full-price sessions.",
    cta: "Make a donation",
    ctaHref: "#", // TODO: Replace with Stripe Donation Link
  },
];
```

- [ ] **Step 6: Write `lib/consulting-data.ts`**

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
    ctaHref: "#", // TODO: Replace with contact form or email link for B2B inquiries
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
    ctaHref: "#", // TODO: Replace with contact form or email link for B2B inquiries
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
    ctaHref: "#", // TODO: Replace with contact form or email link for B2B inquiries
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
    ctaHref: "#", // TODO: Replace with contact form or email link for B2B inquiries
  },
  {
    id: "patient-education-review",
    name: "Patient Education Review",
    description: "Evaluate materials for clarity, empathy, and usefulness.",
    bullets: [
      "Review handouts, website copy, onboarding materials, and discharge instructions for clarity, empathy, and usefulness",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "#", // TODO: Replace with contact form or email link for B2B inquiries
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
    ctaHref: "#", // TODO: Replace with contact form or email link for startup advisory inquiries
  },
];
```

- [ ] **Step 7: Commit**

```bash
git add lib/
git commit -m "feat: add data layer (services, products, consulting, referral conditions)"
```

---

## Task 4: Header and Footer

**Files:**

- Create: `components/nav/Header.tsx`
- Create: `components/nav/Footer.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write the failing layout test**

Create `__tests__/pages/home.test.tsx` (add to existing file or create):

```typescript
import { render, screen } from '@testing-library/react'
import RootLayout from '@/app/layout'

describe('RootLayout', () => {
  it('renders site name in header', () => {
    render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    )
    expect(screen.getByRole('link', { name: /withdrawal support/i })).toBeInTheDocument()
  })

  it('renders primary CTA in header', () => {
    render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    )
    expect(screen.getByRole('link', { name: /request a fit check/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

```bash
npm test -- home.test.tsx
```

Expected: FAIL — layout doesn't have these elements yet.

- [ ] **Step 3: Write `components/nav/Header.tsx`**

```tsx
import { Button } from "@/components/ui/Button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <a
          href="/"
          className="text-lg font-semibold text-slate-900 hover:text-teal-700"
        >
          Withdrawal Support
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <a href="/services" className="hover:text-teal-700">
            Services
          </a>
          <a href="/consulting" className="hover:text-teal-700">
            For Clinicians
          </a>
          <a href="/resources" className="hover:text-teal-700">
            Resources
          </a>
        </nav>
        {/* TODO: Add mobile menu (hamburger + slide-out drawer) for viewports below md.
            The nav is hidden on mobile with no fallback — a significant UX gap for
            a public site where many visitors will be on phones in distress. */}
        <Button href="/services#fit-check" variant="primary">
          Request a fit check
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write `components/nav/Footer.tsx`**

```tsx
export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-12 px-4">
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
                <a href="/services#fit-check" className="hover:text-teal-700">
                  Free Fit Check
                </a>
              </li>
              <li>
                <a
                  href="/services#support-call"
                  className="hover:text-teal-700"
                >
                  Support Call
                </a>
              </li>
              <li>
                <a href="/consulting" className="hover:text-teal-700">
                  For Clinicians
                </a>
              </li>
              <li>
                <a href="/resources" className="hover:text-teal-700">
                  Resources
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Newsletter</p>
            {/* TODO: Replace with ConvertKit/Mailchimp email signup form */}
            <p className="mt-2 text-sm text-slate-600">
              Subscribe to <em>Withdrawal Field Notes</em> — practical notes on
              withdrawal, treatment, and recovery.
            </p>
            <a
              href="#"
              className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline"
            >
              Subscribe free →
            </a>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <p>
            This service provides non-clinical support only. It is not medical
            care, crisis intervention, diagnosis, or treatment. If you are
            experiencing a medical emergency, call 911 or go to your nearest
            emergency room.
          </p>
          {/* TODO: Add analytics script tag (Plausible or Fathom recommended for privacy) */}
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Update `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
npm test -- home.test.tsx
```

Expected: PASS

- [ ] **Step 7: Create `app/not-found.tsx`**

Every public site needs a custom 404. Create this now so it's available before any page tasks:

```tsx
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export default function NotFound() {
  return (
    <Section className="py-32 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        404
      </p>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-4 text-slate-600">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <div className="mt-8">
        <Button href="/" variant="primary">
          Go back home
        </Button>
      </div>
    </Section>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add components/nav/ app/layout.tsx app/not-found.tsx
git commit -m "feat: add Header, Footer, and 404 page"
```

---

## Task 5: Homepage

**Files:**

- Create: `components/home/HeroSection.tsx`
- Create: `components/home/ServiceLadderPreview.tsx`
- Create: `components/home/TrustSignals.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the failing homepage test**

**IMPORTANT:** `__tests__/pages/home.test.tsx` already contains the `RootLayout` tests from Task 4. **Add** the `Homepage` describe block below the existing `RootLayout` block — do not replace the file. The final file should have two `describe` blocks.

Append to `__tests__/pages/home.test.tsx`:

```typescript
import Home from '@/app/page'

describe('Homepage', () => {
  it('renders the core promise headline', () => {
    render(<Home />)
    expect(
      screen.getByText(/help people find the next safe step/i)
    ).toBeInTheDocument()
  })

  it('has a "Request a fit check" CTA', () => {
    render(<Home />)
    expect(screen.getAllByRole('link', { name: /request a fit check/i }).length).toBeGreaterThan(0)
  })

  it('has a "Book a support call" CTA', () => {
    render(<Home />)
    expect(screen.getByRole('link', { name: /book a support call/i })).toBeInTheDocument()
  })

  it('shows the non-clinical disclaimer', () => {
    render(<Home />)
    expect(screen.getByText(/not medical care/i)).toBeInTheDocument()
  })
})
```

The `import { render, screen }` is already at the top of the file from Task 4 — do not duplicate it.

- [ ] **Step 2: Run and confirm it fails**

```bash
npm test -- home.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Write `components/home/HeroSection.tsx`**

```tsx
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function HeroSection() {
  return (
    <Section className="bg-gradient-to-b from-teal-50 to-white py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-teal-700">
          Non-clinical withdrawal support
        </p>
        <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
          I help people find the next safe step when withdrawal makes everything
          feel impossible.
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          This is not medical care. It is support for what comes next —
          navigating treatment options, preparing for appointments, and making
          sense of what is happening.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button href="/services#fit-check" variant="primary">
            Request a free fit check
          </Button>
          <Button href="/services#support-call" variant="secondary">
            Book a support call — $50 beta
          </Button>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Write `components/home/TrustSignals.tsx`**

```tsx
import { Section } from '@/components/ui/Section'
import { Card } from '@/components/ui/Card'

const canHelp = [
  'Understanding what withdrawal typically involves for your substance',
  'Finding the right level of care (outpatient, inpatient, detox, MAT)',
  'Preparing questions before a medical or treatment appointment',
  'Navigating treatment options when you don't know where to start',
  'Helping a family member understand what their loved one is going through',
  'Planning practical next steps when acute withdrawal is winding down',
]

const cannotHelp = [
  'Medical detox supervision or management',
  'Crisis intervention or emergency care',
  'Diagnosing withdrawal severity',
  'Prescribing or recommending medications',
  'Providing clinical treatment of any kind',
  'Replacing a licensed counselor, nurse, or physician',
]

export function TrustSignals() {
  return (
    <Section>
      <h2 className="mb-8 text-2xl font-bold text-slate-900">What this is — and what it isn&apos;t</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-semibold text-teal-700">What I can help with</h3>
          <ul className="space-y-2">
            {canHelp.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-teal-600">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-4 font-semibold text-slate-700">What I cannot help with</h3>
          <ul className="space-y-2">
            {cannotHelp.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-600">
                <span className="mt-0.5 text-slate-400">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>
  )
}
```

- [ ] **Step 5: Write `components/home/ServiceLadderPreview.tsx`**

```tsx
import { SERVICE_TIERS } from "@/lib/services-data";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export function ServiceLadderPreview() {
  const featured = SERVICE_TIERS.slice(0, 3);

  return (
    <Section className="bg-slate-50">
      <h2 className="mb-2 text-2xl font-bold text-slate-900">
        How we can work together
      </h2>
      <p className="mb-8 text-slate-600">
        Start with a free fit check — no commitment required.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        {featured.map((tier) => (
          <Card key={tier.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">
                Tier {tier.tier}
              </span>
              {tier.betaLabel && <Badge color="amber">{tier.betaLabel}</Badge>}
              {tier.status === "coming-soon" && (
                <Badge color="slate">Coming soon</Badge>
              )}
            </div>
            <h3 className="mt-3 font-semibold text-slate-900">{tier.name}</h3>
            <p className="mt-2 flex-1 text-sm text-slate-600">{tier.purpose}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-lg font-bold text-slate-900">
                {tier.price}
              </span>
              <Button
                href={tier.ctaHref}
                variant={tier.status === "available" ? "primary" : "ghost"}
              >
                {tier.cta}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <a
          href="/services"
          className="font-medium text-teal-700 hover:underline"
        >
          See all services including family calls, navigation packages, and
          sliding-scale slots →
        </a>
      </p>
    </Section>
  );
}
```

- [ ] **Step 6: Write `app/page.tsx`**

```tsx
import { HeroSection } from "@/components/home/HeroSection";
import { TrustSignals } from "@/components/home/TrustSignals";
import { ServiceLadderPreview } from "@/components/home/ServiceLadderPreview";

export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustSignals />
      <ServiceLadderPreview />
    </>
  );
}
```

- [ ] **Step 7: Run tests and confirm they pass**

```bash
npm test -- home.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx components/home/
git commit -m "feat: build homepage with hero, trust signals, and service ladder preview"
```

---

## Task 6: Services Page

**Files:**

- Create: `components/services/ServiceComparisonTable.tsx`
- Create: `components/services/WhatICanHelp.tsx`
- Create: `components/services/ReferralTriggers.tsx`
- Create: `components/services/ServiceCard.tsx`
- Create: `app/services/page.tsx`
- Create: `__tests__/pages/services.test.tsx`
- Create: `__tests__/components/ServiceComparisonTable.test.tsx`

- [ ] **Step 1: Write the failing services page tests**

Create `__tests__/pages/services.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import ServicesPage from '@/app/services/page'
import { REFERRAL_CONDITIONS } from '@/lib/referral-conditions'
import { SERVICE_TIERS } from '@/lib/services-data'

describe('Services Page', () => {
  it('renders a heading for each service tier', () => {
    render(<ServicesPage />)
    SERVICE_TIERS.forEach((tier) => {
      expect(screen.getByText(tier.name)).toBeInTheDocument()
    })
  })

  it('renders the comparison table', () => {
    render(<ServicesPage />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders "When I refer you out immediately" section', () => {
    render(<ServicesPage />)
    expect(screen.getByText(/when I will refer you out immediately/i)).toBeInTheDocument()
  })

  it('renders all referral conditions on the page', () => {
    render(<ServicesPage />)
    REFERRAL_CONDITIONS.forEach((condition) => {
      expect(screen.getByText(new RegExp(condition, 'i'))).toBeInTheDocument()
    })
  })

  it('uses "medical evaluation" or "emergency care" language — never "clear you"', () => {
    render(<ServicesPage />)
    expect(screen.queryByText(/I will clear you/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/determine whether you are safe/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

```bash
npm test -- services.test.tsx
```

Expected: FAIL — page doesn't exist yet.

- [ ] **Step 3: Write `components/services/ServiceComparisonTable.tsx`**

```tsx
import { SERVICE_TIERS } from "@/lib/services-data";

export function ServiceComparisonTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Service
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Duration
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Price
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              Status
            </th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">
              CTA
            </th>
          </tr>
        </thead>
        <tbody>
          {SERVICE_TIERS.map((tier) => (
            <tr
              key={tier.id}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-medium text-slate-900">
                {tier.name}
              </td>
              <td className="px-4 py-3 text-slate-600">{tier.duration}</td>
              <td className="px-4 py-3 text-slate-600">{tier.price}</td>
              <td className="px-4 py-3">
                {tier.status === "available" ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                    Available
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Coming soon
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <a
                  href={tier.ctaHref}
                  className="font-medium text-teal-700 hover:underline"
                >
                  {tier.cta}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write `components/services/WhatICanHelp.tsx`**

```tsx
const canHelp = [
  "Understanding what withdrawal typically involves for your specific substance",
  "Finding the right level of care — outpatient, inpatient, medical detox, or MAT",
  "Preparing questions and history before a medical or treatment appointment",
  "Navigating treatment options when you don't know where to start",
  "Helping a family member understand what their loved one is going through",
  "Planning practical next steps when acute withdrawal is winding down",
  "Understanding what to expect from the post-acute recovery period",
];

const cannotHelp = [
  "Medical detox supervision, monitoring, or management",
  "Crisis intervention or emergency mental health care",
  "Diagnosing withdrawal severity or predicting medical risk",
  "Prescribing, recommending, adjusting, or advising on medications",
  "Providing clinical treatment of any kind",
  "Replacing a licensed counselor, therapist, nurse, or physician",
  "Determining whether someone is medically safe to detox at home",
];

export function WhatICanHelp() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-teal-700">
          What I can help with
        </h3>
        <ul className="space-y-3">
          {canHelp.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-slate-700">
              <span className="mt-0.5 shrink-0 text-teal-500">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-700">
          What I cannot help with
        </h3>
        <ul className="space-y-3">
          {cannotHelp.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-slate-600">
              <span className="mt-0.5 shrink-0 text-slate-400">✕</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `components/services/ReferralTriggers.tsx`**

```tsx
import { REFERRAL_CONDITIONS } from "@/lib/referral-conditions";

export function ReferralTriggers() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-2 text-lg font-bold text-amber-900">
        When I will refer you out immediately
      </h2>
      <p className="mb-4 text-sm text-amber-800">
        If any of the following are present, I will direct you to seek medical
        evaluation, licensed care, urgent care, or emergency care right away.
        These require professional medical attention — not a support call.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {REFERRAL_CONDITIONS.map((condition) => (
          <li
            key={condition}
            className="flex items-start gap-2 text-sm text-amber-900"
          >
            <span className="mt-0.5 shrink-0 font-bold text-amber-600">→</span>
            <span className="capitalize">{condition}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-amber-700">
        If you are in crisis now, call 988 (Suicide & Crisis Lifeline), 911, or
        go to your nearest emergency room.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/services/ServiceCard.tsx`**

```tsx
import { ServiceTier } from "@/lib/services-data";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface ServiceCardProps {
  tier: ServiceTier;
}

export function ServiceCard({ tier }: ServiceCardProps) {
  return (
    <Card id={tier.id} className="scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">
          Tier {tier.tier}
        </span>
        <div className="flex gap-2">
          {tier.betaLabel && <Badge color="amber">{tier.betaLabel}</Badge>}
          {tier.status === "coming-soon" && (
            <Badge color="slate">Coming soon</Badge>
          )}
        </div>
      </div>
      <h2 className="mt-2 text-xl font-bold text-slate-900">{tier.name}</h2>
      <div className="mt-1 text-2xl font-semibold text-teal-700">
        {tier.price}
      </div>
      <p className="mt-3 text-slate-600">{tier.purpose}</p>
      <div className="mt-6">
        <Button
          href={tier.ctaHref}
          variant={tier.status === "available" ? "primary" : "secondary"}
        >
          {tier.cta}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 7: Write `app/services/page.tsx`**

```tsx
import type { Metadata } from "next";
import { SERVICE_TIERS } from "@/lib/services-data";
import { Section } from "@/components/ui/Section";
import { ServiceCard } from "@/components/services/ServiceCard";
import { ServiceComparisonTable } from "@/components/services/ServiceComparisonTable";
import { WhatICanHelp } from "@/components/services/WhatICanHelp";
import { ReferralTriggers } from "@/components/services/ReferralTriggers";

export const metadata: Metadata = {
  title: "Services — Withdrawal Support",
  description:
    "Non-clinical withdrawal support services: free fit check, 30-minute support calls, family navigation, and more.",
};

export default function ServicesPage() {
  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Services</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Non-clinical support for people navigating withdrawal and the people
          who care about them. Start with a free 10-minute fit check to find the
          right level of support.
        </p>
      </Section>

      <Section>
        <h2 className="mb-6 text-2xl font-bold text-slate-900">
          Compare all services
        </h2>
        <ServiceComparisonTable />
      </Section>

      <Section className="bg-slate-50">
        <div className="space-y-6">
          {SERVICE_TIERS.map((tier) => (
            <ServiceCard key={tier.id} tier={tier} />
          ))}
        </div>
        {/* TODO: Add Stripe Payment Links for each available service tier */}
        {/* TODO: Add Calendly scheduling links to each service card */}
      </Section>

      <Section>
        <h2 className="mb-8 text-2xl font-bold text-slate-900">
          What I can help with
        </h2>
        <WhatICanHelp />
      </Section>

      <Section className="bg-amber-50">
        <ReferralTriggers />
      </Section>

      {/* TODO: Add testimonials section when real consented testimonials are available */}
    </>
  );
}
```

- [ ] **Step 8: Run tests and confirm they pass**

```bash
npm test -- services.test.tsx ReferralTriggers.test.tsx
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/services/ components/services/ __tests__/pages/services.test.tsx
git commit -m "feat: build Services page with comparison table, referral triggers, and service cards"
```

---

## Task 7: B2B Consulting Page

**Files:**

- Create: `components/consulting/ConsultingHero.tsx`
- Create: `components/consulting/B2BOffers.tsx`
- Create: `components/consulting/B2BLeadMagnet.tsx`
- Create: `app/consulting/page.tsx`
- Create: `__tests__/pages/consulting.test.tsx`

- [ ] **Step 1: Write the failing consulting page tests**

Create `__tests__/pages/consulting.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import ConsultingPage from '@/app/consulting/page'
import { B2B_OFFERS } from '@/lib/consulting-data'

describe('Consulting Page', () => {
  it('renders the page title', () => {
    render(<ConsultingPage />)
    expect(
      screen.getByText(/patient-experience consulting for withdrawal care/i)
    ).toBeInTheDocument()
  })

  it('renders the positioning statement', () => {
    render(<ConsultingPage />)
    expect(
      screen.getByText(/patient experience of withdrawal/i)
    ).toBeInTheDocument()
  })

  it('renders a heading for each B2B offer', () => {
    render(<ConsultingPage />)
    B2B_OFFERS.forEach((offer) => {
      expect(screen.getByText(offer.name)).toBeInTheDocument()
    })
  })

  it('renders the lead magnet CTA', () => {
    render(<ConsultingPage />)
    expect(
      screen.getByText(/10 ways detox programs lose patient trust/i)
    ).toBeInTheDocument()
  })

  it('does NOT claim to teach clinical protocols', () => {
    render(<ConsultingPage />)
    expect(screen.queryByText(/teach doctors/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/clinical authority/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

```bash
npm test -- consulting.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Write `components/consulting/ConsultingHero.tsx`**

```tsx
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function ConsultingHero() {
  return (
    <Section className="bg-gradient-to-b from-slate-900 to-slate-800 py-24 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-teal-400">
          For treatment programs &amp; healthcare teams
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Patient-Experience Consulting for Withdrawal Care
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          I help treatment teams understand the patient experience of withdrawal
          so they can improve trust, engagement, communication, and retention.
        </p>
        <p className="mt-4 text-slate-400">
          This is patient-side insight and lived-experience pattern recognition
          — not clinical protocol instruction. The value is in the communication
          improvement, workflow friction reduction, and patient education review
          that only someone who has been on the patient side can provide.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Button href="#" variant="primary">
            Discuss staff training
          </Button>
          {/* TODO: Replace # with contact form or email link for B2B inquiries */}
          <Button
            href="#"
            variant="ghost"
            className="text-white hover:text-teal-300 border-slate-400"
          >
            Request a patient-experience review
          </Button>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Write `components/consulting/B2BOffers.tsx`**

```tsx
import { B2B_OFFERS } from "@/lib/consulting-data";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export function B2BOffers() {
  return (
    <Section>
      <h2 className="mb-8 text-2xl font-bold text-slate-900">
        How I can help your program
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {B2B_OFFERS.map((offer) => (
          <Card key={offer.id} className="flex flex-col">
            <h3 className="font-semibold text-slate-900">{offer.name}</h3>
            <p className="mt-2 text-sm text-slate-600">{offer.description}</p>
            <ul className="mt-3 flex-1 space-y-1">
              {offer.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-xs text-slate-600">
                  <span className="mt-0.5 text-teal-500">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button href={offer.ctaHref} variant="ghost">
                {offer.cta} →
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Write `components/consulting/B2BLeadMagnet.tsx`**

```tsx
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function B2BLeadMagnet() {
  return (
    <Section className="bg-teal-50">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          10 Ways Detox Programs Lose Patient Trust Before Treatment Even Starts
        </h2>
        <p className="mt-4 text-slate-600">
          A free downloadable guide — pattern recognition from hundreds of
          patient-side withdrawal experiences.
        </p>
        <div className="mt-8">
          <Button href="#">Download the free guide</Button>
          {/* TODO: Replace # with email capture form or direct PDF download link */}
          {/* TODO: Tag subscribers as "lead-magnet-b2b" in ConvertKit/Mailchimp for segmented follow-up */}
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 6: Write `app/consulting/page.tsx`**

```tsx
import type { Metadata } from "next";
import { ConsultingHero } from "@/components/consulting/ConsultingHero";
import { B2BOffers } from "@/components/consulting/B2BOffers";
import { B2BLeadMagnet } from "@/components/consulting/B2BLeadMagnet";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Patient-Experience Consulting — Withdrawal Support",
  description:
    "Lived-experience consulting for treatment programs and healthcare teams — improve patient trust, communication, and retention in withdrawal care.",
};

export default function ConsultingPage() {
  return (
    <>
      <ConsultingHero />
      <B2BOffers />
      <B2BLeadMagnet />

      <Section className="bg-slate-50">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold text-slate-900">
            Bring lived-experience insight to your program
          </h2>
          <p className="mt-3 text-slate-600">
            Whether you&apos;re a detox center, MOUD clinic, residential
            program, or behavioral health startup, patient-experience consulting
            can improve the parts of care that clinical training alone
            doesn&apos;t address.
          </p>
          <div className="mt-6">
            {/* TODO: Replace # with contact form or email link for B2B inquiries */}
            <a href="#" className="text-teal-700 font-medium hover:underline">
              Get in touch to discuss how this could work for your program →
            </a>
          </div>
          {/* TODO: Add testimonials from treatment programs when real consented testimonials exist */}
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 7: Run tests and confirm they pass**

```bash
npm test -- consulting.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/consulting/ components/consulting/ __tests__/pages/consulting.test.tsx
git commit -m "feat: build B2B consulting page with offer cards and lead magnet"
```

---

## Task 8: Resources / Products Page

**Files:**

- Create: `components/resources/ProductCard.tsx`
- Create: `components/resources/LeadMagnetForm.tsx`
- Create: `app/resources/page.tsx`
- Create: `__tests__/pages/resources.test.tsx`

- [ ] **Step 1: Write the failing resources page tests**

Create `__tests__/pages/resources.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import ResourcesPage from '@/app/resources/page'
import { PRODUCTS } from '@/lib/products-data'

describe('Resources Page', () => {
  it('renders a card for each product', () => {
    render(<ResourcesPage />)
    PRODUCTS.forEach((product) => {
      expect(screen.getByText(product.name)).toBeInTheDocument()
    })
  })

  it('renders the free lead magnets with "Get the free guide" CTA', () => {
    render(<ResourcesPage />)
    const freeCtas = screen.getAllByRole('link', { name: /get the free guide/i })
    expect(freeCtas.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the newsletter section', () => {
    render(<ResourcesPage />)
    expect(screen.getByText(/withdrawal field notes/i)).toBeInTheDocument()
  })

  it('renders a donation option', () => {
    render(<ResourcesPage />)
    expect(screen.getByRole('link', { name: /make a donation/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

```bash
npm test -- resources.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Write `components/resources/ProductCard.tsx`**

```tsx
import { Product } from "@/lib/products-data";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <Badge color={product.price === "free" ? "teal" : "slate"}>
          {product.price === "free" ? "Free" : product.price}
        </Badge>
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{product.name}</h3>
      <p className="mt-2 flex-1 text-sm text-slate-600">
        {product.description}
      </p>
      <div className="mt-4">
        <Button
          href={product.ctaHref}
          variant={product.price === "free" ? "primary" : "secondary"}
        >
          {product.cta}
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Write `components/resources/LeadMagnetForm.tsx`**

```tsx
"use client";

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
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-6">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {/* TODO: Replace this placeholder form with a real ConvertKit or Mailchimp embedded form */}
      {/* TODO: Tag subscribers with "{tag}" in your email platform for segmented follow-up */}
      <form
        data-tag={tag}
        className="mt-4 flex gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="email"
          placeholder="Your email address"
          required
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          type="submit"
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {buttonLabel}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Write `app/resources/page.tsx`**

```tsx
import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products-data";
import { ProductCard } from "@/components/resources/ProductCard";
import { LeadMagnetForm } from "@/components/resources/LeadMagnetForm";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Resources — Withdrawal Support",
  description:
    "Free guides, practical worksheets, and tools for navigating withdrawal, treatment, and early recovery.",
};

const paidProducts = PRODUCTS.filter(
  (p) => p.price !== "free" && p.type !== "newsletter" && p.type !== "donation",
);
const freeProducts = PRODUCTS.filter(
  (p) => p.price === "free" && p.type === "lead-magnet",
);
const newsletter = PRODUCTS.find((p) => p.type === "newsletter")!;
const donation = PRODUCTS.find((p) => p.id === "donation")!;

export default function ResourcesPage() {
  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Resources</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Guides, worksheets, and tools to help you navigate withdrawal,
          treatment, and early recovery — whether you&apos;re going through it
          or supporting someone who is.
        </p>
      </Section>

      <Section>
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Free guides</h2>
        <p className="mb-8 text-slate-600">Download and share freely.</p>
        <div className="grid gap-6 md:grid-cols-2">
          {freeProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {/* TODO: Replace ProductCard ctaHref for lead magnets with email capture forms or direct PDF links */}
      </Section>

      <Section className="bg-teal-50">
        <h2 className="mb-8 text-2xl font-bold text-slate-900">
          Get free guides in your inbox
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <LeadMagnetForm
            title="What to Do When Withdrawal Starts Feeling Unsafe"
            description="A guide for recognizing danger signs during withdrawal and what to do about them."
            tag="lead-magnet-unsafe"
          />
          <LeadMagnetForm
            title="How to Help Someone in Withdrawal Without Making It Worse"
            description="For family and friends — how to support without shaming, enabling, or escalating crisis."
            tag="lead-magnet-family"
          />
        </div>
      </Section>

      <Section>
        <h2 className="mb-2 text-2xl font-bold text-slate-900">
          Worksheets &amp; paid tools
        </h2>
        <p className="mb-8 text-slate-600">
          Practical tools for navigating treatment and early recovery.
        </p>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paidProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {/* TODO: Replace each ctaHref with a Stripe Payment Link for the corresponding PDF product */}
      </Section>

      <Section className="bg-slate-50">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              {newsletter.name}
            </h2>
            <p className="mb-6 text-slate-600">{newsletter.description}</p>
            <LeadMagnetForm
              title={newsletter.name}
              description="Practical notes on withdrawal, treatment navigation, and recovery — from lived experience."
              tag="newsletter-withdrawal-field-notes"
              buttonLabel="Subscribe free"
            />
          </div>
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              {donation.name}
            </h2>
            <p className="mb-4 text-slate-600">{donation.description}</p>
            <a
              href={donation.ctaHref}
              className="inline-block rounded-md border border-teal-600 px-6 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
            >
              {donation.cta}
            </a>
            {/* TODO: Replace # above with Stripe Donation Link */}
          </div>
        </div>
      </Section>

      {/* TODO: Add group workshop signup section when workshop is scheduled */}
      {/* TODO: Add testimonials section when real consented testimonials are available */}
      {/* TODO: Add analytics events for PDF downloads and lead magnet conversions */}
    </>
  );
}
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
npm test -- resources.test.tsx
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/resources/ components/resources/ __tests__/pages/resources.test.tsx
git commit -m "feat: build Resources page with product cards, lead magnet forms, and newsletter signup"
```

---

## Task 9: Full Test Suite + Coverage Check

**Files:**

- No new files — confirm all tests pass and check coverage.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: All tests pass across `home.test.tsx`, `services.test.tsx`, `consulting.test.tsx`, `resources.test.tsx`, `ReferralTriggers.test.tsx`.

- [ ] **Step 2: Run coverage report**

```bash
npm run test:coverage
```

Review the output. The critical files to hit:

- `lib/referral-conditions.ts` — must be 100%
- `lib/services-data.ts` — must be 100%
- `components/services/ReferralTriggers.tsx` — must be 100%

- [ ] **Step 3: Fix any failing tests**

If a test fails, read the error message carefully. Most failures at this stage are:

- Import path errors (`@/` alias not resolving) — check `tsconfig.json` has `"paths": { "@/*": ["./*"] }`
- Missing `'use client'` on `LeadMagnetForm` — confirm it has the directive
- RSC rendering issues — wrap server components in a test provider if needed

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: confirm full test suite passes with coverage"
```

---

## Task 10: Dev Server Smoke Check

**No files.** Visual verification only.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:

- [ ] Homepage renders with the core promise headline, two CTAs, trust signals, and three service cards
- [ ] `/services` renders all five service tiers, comparison table, referral triggers amber box (all 16 conditions present), and "What I can help with" two columns
- [ ] `/consulting` renders dark hero, six offer cards, and "10 Ways" lead magnet
- [ ] `/resources` renders free guide cards, two lead magnet forms, paid worksheets, newsletter form, and donation CTA
- [ ] Header nav links work for all four pages
- [ ] Footer has newsletter signup area and legal disclaimer

- [ ] **Step 2: Check TODO comments are present**

```bash
grep -r "TODO" app/ components/ lib/ --include="*.tsx" --include="*.ts" | grep -v ".git"
```

Confirm TODOs exist for: Stripe, Calendly, ConvertKit/Mailchimp, PDF downloads, analytics, testimonials.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: visual smoke check complete — all pages render correctly"
```

---

## Monetization Integration Checklist (Post-Launch)

These are the TODO items scaffolded throughout the codebase. Work through them in this order when ready:

1. **Analytics** — Add Plausible or Fathom script in `app/layout.tsx` footer
2. **Email platform** — Set up ConvertKit or Mailchimp; replace `LeadMagnetForm` placeholder with real embedded forms
3. **Calendly** — Create booking pages for Tier 1 (fit check) and Tier 2 (support call); replace `#` hrefs in `lib/services-data.ts`
4. **Stripe Payment Links** — Create links for: $50 support call, each paid PDF product, donation link; replace `#` hrefs
5. **PDF products** — Design and export PDFs; host on S3/Cloudflare R2 or deliver via Stripe
6. **Testimonials** — When real consented testimonials are collected, add a `TestimonialsSection` component
7. **Workshop** — When a group workshop is scheduled, add signup form to `/resources`
