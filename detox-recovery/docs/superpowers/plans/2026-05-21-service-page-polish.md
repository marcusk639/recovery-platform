# Service Page Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Calendly scheduling link into ServiceCard, fix accessibility gaps in LeadMagnetForm and NewsletterSignup, add URL-parameter pre-fill to the contact form (so consulting CTAs land on the right interest), and cover the two untested components.

**Architecture:** Five independent tasks with no inter-task dependencies. Each task is a self-contained component edit + matching test update. The contact-form task is the most complex: the contact page becomes async (Next.js 15 pattern), `ContactForm` gains a `defaultInterest` prop, and consulting data hrefs gain `?interest=` query params so clicking any B2B CTA lands with the right dropdown pre-selected.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v3, Jest 29 + ts-jest + React Testing Library. Run tests with `npm test`. PostToolUse Prettier hook auto-formats after every edit — re-read files before subsequent edits to the same region.

---

## File Map

| File                                                   | Change                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `components/services/ServiceCard.tsx`                  | Add secondary Calendly "Check availability" link                                  |
| `components/resources/LeadMagnetForm.tsx`              | Add `useId`, `sr-only` label, persistent `role="alert"`, clear error on keystroke |
| `components/nav/NewsletterSignup.tsx`                  | Add `useId`, `sr-only` label, `"error"` state, persistent `role="alert"`          |
| `components/contact/ContactForm.tsx`                   | Accept `defaultInterest` prop, initialise state from it                           |
| `app/contact/page.tsx`                                 | Make async, read `searchParams`, pass `defaultInterest` to `ContactForm`          |
| `lib/consulting-data.ts`                               | Update every `ctaHref` to include `?interest=…`                                   |
| `components/consulting/ConsultingHero.tsx`             | Update two hero CTA hrefs to include `?interest=…`                                |
| `__tests__/pages/services.test.tsx`                    | Add Calendly-link test                                                            |
| `__tests__/components/LeadMagnetForm.test.tsx`         | Add label + live-region tests                                                     |
| `__tests__/components/NewsletterSignup.test.tsx`       | Add label + error-state tests                                                     |
| `__tests__/components/ContactForm.test.tsx`            | Add `defaultInterest` pre-fill tests                                              |
| `__tests__/pages/contact.test.tsx`                     | Update to async component call pattern; add pre-fill + guard tests                |
| `__tests__/pages/consulting.test.tsx`                  | Add test that CTA hrefs contain `interest=`                                       |
| `__tests__/components/ServiceComparisonTable.test.tsx` | Create — new file                                                                 |
| `__tests__/components/WhatICanHelp.test.tsx`           | Create — new file                                                                 |

---

### Task 1: ServiceCard — Calendly scheduling link

**Files:**

- Modify: `components/services/ServiceCard.tsx`
- Modify: `__tests__/pages/services.test.tsx`

The `ServiceTier` data model already has `calendarHref` for the `support-call` tier (set from `NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL ?? "#"`). `ServiceCard` currently ignores it. This task renders a secondary "Check availability →" link below the primary CTA whenever `calendarHref` is present.

- [ ] **Step 1: Write the failing test**

Add one test to `__tests__/pages/services.test.tsx`:

```tsx
it("shows a scheduling link for tiers that have a calendarHref", () => {
  render(<ServicesPage />);
  expect(screen.getAllByText(/check availability/i).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="services" --no-coverage
```

Expected: FAIL — `Unable to find an accessible element with the text: /check availability/i`

- [ ] **Step 3: Update ServiceCard**

Replace the full contents of `components/services/ServiceCard.tsx`:

```tsx
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ServiceTier } from "@/lib/services-data";

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
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          href={tier.ctaHref}
          variant={tier.status === "available" ? "primary" : "secondary"}
        >
          {tier.cta}
        </Button>
        {tier.calendarHref && (
          <a
            href={tier.calendarHref}
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            Check availability →
          </a>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="services" --no-coverage
```

Expected: PASS — all services tests green including the new one.

- [ ] **Step 5: Commit**

```bash
git add components/services/ServiceCard.tsx __tests__/pages/services.test.tsx
git commit -m "feat: show Calendly scheduling link on ServiceCard when calendarHref present"
```

---

### Task 2: LeadMagnetForm — accessibility

**Files:**

- Modify: `components/resources/LeadMagnetForm.tsx`
- Modify: `__tests__/components/LeadMagnetForm.test.tsx`

Three issues: the email input has no `id`/label (screen readers can't identify the field), the error paragraph is conditional (screen readers miss late-arriving announcements), and typing after an error doesn't clear it. This matches the pattern already fixed in `B2BLeadMagnet` and `ContactForm`.

Multiple `LeadMagnetForm` instances can exist on the resources page (two lead magnets + newsletter section), so labels use `React.useId()` to generate unique IDs.

- [ ] **Step 1: Write failing tests**

Add two tests to `__tests__/components/LeadMagnetForm.test.tsx`:

```tsx
it("has an accessible label for the email input", () => {
  render(
    <LeadMagnetForm
      title="Test Guide"
      description="A description"
      tag="lead-magnet-unsafe"
    />,
  );
  expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
});

it("has a persistent error region that becomes visible on failure", async () => {
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
  fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
    target: { value: "user@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(/subscription failed/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="LeadMagnetForm" --no-coverage
```

Expected: FAIL on both new tests — no accessible label found, no alert role found.

- [ ] **Step 3: Update LeadMagnetForm**

Replace the full contents of `components/resources/LeadMagnetForm.tsx`:

```tsx
"use client";

import { useId, useState } from "react";

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
  const uid = useId();
  const inputId = `lead-magnet-email-${uid}`;
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
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <input
            id={inputId}
            type="email"
            value={email}
            onChange={(e) => {
              if (status === "error") {
                setStatus("idle");
                setErrorMsg("");
              }
              setEmail(e.target.value);
            }}
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

      <p role="alert" className="mt-2 min-h-[1rem] text-xs text-red-600">
        {status === "error" ? errorMsg : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="LeadMagnetForm" --no-coverage
```

Expected: PASS — all LeadMagnetForm tests green.

- [ ] **Step 5: Commit**

```bash
git add components/resources/LeadMagnetForm.tsx __tests__/components/LeadMagnetForm.test.tsx
git commit -m "fix: add accessible label and role=alert error region to LeadMagnetForm"
```

---

### Task 3: NewsletterSignup — accessibility + error handling

**Files:**

- Modify: `components/nav/NewsletterSignup.tsx`
- Modify: `__tests__/components/NewsletterSignup.test.tsx`

Two issues: no label for the email input (screen reader gap), and network/API errors silently reset to idle with no user feedback. Add `useId`, `sr-only` label, an `"error"` status state, and a persistent `role="alert"` error region.

- [ ] **Step 1: Write failing tests**

Add two tests to `__tests__/components/NewsletterSignup.test.tsx`:

```tsx
it("has an accessible label for the email input", () => {
  render(<NewsletterSignup />);
  expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
});

it("shows an error message when the subscription request fails", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "Subscription failed." }),
  });
  render(<NewsletterSignup />);
  fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
    target: { value: "user@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(
      /something went wrong/i,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="NewsletterSignup" --no-coverage
```

Expected: FAIL on both new tests.

- [ ] **Step 3: Update NewsletterSignup**

Replace the full contents of `components/nav/NewsletterSignup.tsx`:

```tsx
"use client";

import { useId, useState } from "react";

export function NewsletterSignup() {
  const uid = useId();
  const inputId = `newsletter-email-${uid}`;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "subscribed" | "error"
  >("idle");

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
      setStatus("error");
    }
  };

  if (status === "subscribed") {
    return (
      <p className="mt-2 text-sm font-medium text-teal-700">Subscribed.</p>
    );
  }

  return (
    <form className="mt-3 flex flex-col gap-1" onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(e) => {
            if (status === "error") setStatus("idle");
            setEmail(e.target.value);
          }}
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
          {status === "loading" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <p role="alert" className="min-h-[1rem] text-xs text-red-600">
        {status === "error" ? "Something went wrong. Please try again." : ""}
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="NewsletterSignup" --no-coverage
```

Expected: PASS — all NewsletterSignup tests green.

- [ ] **Step 5: Commit**

```bash
git add components/nav/NewsletterSignup.tsx __tests__/components/NewsletterSignup.test.tsx
git commit -m "fix: add accessible label and error feedback to NewsletterSignup"
```

---

### Task 4: Contact form URL-parameter pre-fill

**Files:**

- Modify: `components/contact/ContactForm.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `lib/consulting-data.ts`
- Modify: `components/consulting/ConsultingHero.tsx`
- Modify: `__tests__/components/ContactForm.test.tsx`
- Modify: `__tests__/pages/contact.test.tsx`
- Modify: `__tests__/pages/consulting.test.tsx`

Clicking "Discuss staff training" or any B2B CTA currently lands on the contact form with a blank interest dropdown. This task wires the consulting CTA hrefs to include `?interest=…` query params, makes the contact page pass the decoded interest to `ContactForm`, and `ContactForm` pre-selects the matching dropdown option.

The contact page becomes `async` following the Next.js 15 pattern for `searchParams`. The existing tests are updated to call the page function directly with a `Promise` argument — this is how RSC unit tests work with async Server Components.

- [ ] **Step 1: Write failing tests for ContactForm**

Add two tests to `__tests__/components/ContactForm.test.tsx`:

```tsx
it("pre-selects interest when defaultInterest matches a known option", () => {
  render(<ContactForm defaultInterest="Patient-Experience Training" />);
  const select = screen.getByLabelText(
    /area of interest/i,
  ) as HTMLSelectElement;
  expect(select.value).toBe("Patient-Experience Training");
});

it("leaves interest blank when defaultInterest does not match any option", () => {
  render(<ContactForm defaultInterest="Unknown Service" />);
  const select = screen.getByLabelText(
    /area of interest/i,
  ) as HTMLSelectElement;
  expect(select.value).toBe("");
});
```

- [ ] **Step 2: Run ContactForm tests to verify they fail**

```bash
npm test -- --testPathPattern="ContactForm" --no-coverage
```

Expected: FAIL on both new tests — `ContactForm` does not accept `defaultInterest` prop yet.

- [ ] **Step 3: Update ContactForm to accept defaultInterest prop**

At the top of `components/contact/ContactForm.tsx`, add the interface and update the function signature. Change only the interface + function signature + initial state — the rest of the component is unchanged.

Current opening:

```tsx
export function ContactForm() {
  const [fields, setFields] = useState<Fields>(INITIAL);
```

Replace with:

```tsx
interface ContactFormProps {
  defaultInterest?: string;
}

export function ContactForm({ defaultInterest = "" }: ContactFormProps) {
  const resolvedInterest = INTERESTS.includes(defaultInterest as Interest)
    ? (defaultInterest as Interest)
    : "";
  const [fields, setFields] = useState<Fields>({
    ...INITIAL,
    interest: resolvedInterest,
  });
```

- [ ] **Step 4: Run ContactForm tests to verify they pass**

```bash
npm test -- --testPathPattern="ContactForm" --no-coverage
```

Expected: PASS — all ContactForm tests green including the two new ones.

- [ ] **Step 5: Write failing contact page tests**

Replace the full contents of `__tests__/pages/contact.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import ContactPage from "@/app/contact/page";

describe("Contact page", () => {
  it("renders the page heading", async () => {
    render(await ContactPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { name: /get in touch/i }),
    ).toBeInTheDocument();
  });

  it("renders the contact form", async () => {
    render(await ContactPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("button", { name: /send message/i }),
    ).toBeInTheDocument();
  });

  it("pre-selects interest when passed as query param", async () => {
    render(
      await ContactPage({
        searchParams: Promise.resolve({
          interest: "Patient-Experience Training",
        }),
      }),
    );
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("Patient-Experience Training");
  });

  it("leaves interest blank for an unrecognised query param value", async () => {
    render(
      await ContactPage({
        searchParams: Promise.resolve({ interest: "Unknown Service" }),
      }),
    );
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
  });
});
```

- [ ] **Step 6: Run contact page tests to verify they fail**

```bash
npm test -- --testPathPattern="pages/contact" --no-coverage
```

Expected: FAIL — `ContactPage` is not async and does not accept `searchParams` yet.

- [ ] **Step 7: Make contact page async**

Replace the full contents of `app/contact/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — Withdrawal Support",
  description:
    "Reach out about patient-experience consulting, staff training, startup advisory, or other B2B inquiries.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ interest?: string }>;
}) {
  const { interest = "" } = await searchParams;

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
          <ContactForm defaultInterest={interest} />
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 8: Run contact page tests to verify they pass**

```bash
npm test -- --testPathPattern="pages/contact" --no-coverage
```

Expected: PASS — all four contact page tests green.

- [ ] **Step 9: Update consulting data hrefs**

Replace the full contents of `lib/consulting-data.ts`. The only changes are the six `ctaHref` values — every other field stays the same:

```ts
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
    ctaHref: "/contact?interest=Patient-Experience%20Training",
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
    ctaHref: "/contact?interest=Withdrawal%20Journey%20Mapping",
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
    ctaHref: "/contact?interest=Communication%20Workshops",
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
    ctaHref: "/contact?interest=Dropout%20%2F%20Friction%20Analysis",
  },
  {
    id: "patient-education-review",
    name: "Patient Education Review",
    description: "Evaluate materials for clarity, empathy, and usefulness.",
    bullets: [
      "Review handouts, website copy, onboarding materials, and discharge instructions for clarity, empathy, and usefulness",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "/contact?interest=Patient%20Education%20Review",
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
    ctaHref: "/contact?interest=Digital%20Health%20Startup%20Advisory",
  },
];
```

- [ ] **Step 10: Update ConsultingHero CTAs**

In `components/consulting/ConsultingHero.tsx`, update the two `Button` hrefs in the `div.mt-10` block. Only these two lines change:

```tsx
<Button href="/contact?interest=Patient-Experience%20Training">
  Discuss staff training
</Button>
<Button
  href="/contact?interest=Withdrawal%20Journey%20Mapping"
  variant="ghost"
  className="border-slate-400 text-white hover:text-teal-300"
>
  Request a patient-experience review
</Button>
```

- [ ] **Step 11: Write failing consulting CTA test**

Add one test to `__tests__/pages/consulting.test.tsx`:

```tsx
it("consulting CTA links include interest query params", () => {
  render(<ConsultingPage />);
  const trainingLinks = screen.getAllByRole("link", {
    name: /discuss staff training/i,
  });
  expect(trainingLinks[0].getAttribute("href")).toContain("interest=");
});
```

- [ ] **Step 12: Run consulting tests to verify the new test passes**

```bash
npm test -- --testPathPattern="consulting" --no-coverage
```

Expected: PASS — all consulting tests green including the new one.

- [ ] **Step 13: Run full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 14: Commit**

```bash
git add components/contact/ContactForm.tsx \
        app/contact/page.tsx \
        lib/consulting-data.ts \
        components/consulting/ConsultingHero.tsx \
        __tests__/components/ContactForm.test.tsx \
        __tests__/pages/contact.test.tsx \
        __tests__/pages/consulting.test.tsx
git commit -m "feat: pre-fill contact form interest from consulting CTA query params"
```

---

### Task 5: Unit tests for ServiceComparisonTable and WhatICanHelp

**Files:**

- Create: `__tests__/components/ServiceComparisonTable.test.tsx`
- Create: `__tests__/components/WhatICanHelp.test.tsx`

These components are rendered by `ServicesPage` and covered indirectly by the services page tests, but they have no isolated unit tests. This task adds focused component-level tests.

- [ ] **Step 1: Create ServiceComparisonTable tests**

Create `__tests__/components/ServiceComparisonTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ServiceComparisonTable } from "@/components/services/ServiceComparisonTable";
import { SERVICE_TIERS } from "@/lib/services-data";

describe("ServiceComparisonTable", () => {
  it("renders a table element", () => {
    render(<ServiceComparisonTable />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders every service tier name in the table", () => {
    render(<ServiceComparisonTable />);
    SERVICE_TIERS.forEach((tier) => {
      expect(screen.getAllByText(tier.name).length).toBeGreaterThan(0);
    });
  });

  it("renders the correct number of Coming soon badges", () => {
    render(<ServiceComparisonTable />);
    const comingSoonCount = SERVICE_TIERS.filter(
      (t) => t.status === "coming-soon",
    ).length;
    expect(screen.getAllByText("Coming soon")).toHaveLength(comingSoonCount);
  });

  it("renders CTA links for each tier", () => {
    render(<ServiceComparisonTable />);
    SERVICE_TIERS.forEach((tier) => {
      expect(
        screen.getAllByRole("link", { name: tier.cta }).length,
      ).toBeGreaterThan(0);
    });
  });

  it("renders column headers: Service, Duration, Price, Status, CTA", () => {
    render(<ServiceComparisonTable />);
    expect(
      screen.getByRole("columnheader", { name: /service/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /duration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /price/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /status/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it passes immediately (no failing step needed — this is a new test file for existing code)**

```bash
npm test -- --testPathPattern="ServiceComparisonTable" --no-coverage
```

Expected: PASS — all tests pass.

- [ ] **Step 3: Create WhatICanHelp tests**

Create `__tests__/components/WhatICanHelp.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { WhatICanHelp } from "@/components/services/WhatICanHelp";

describe("WhatICanHelp", () => {
  it('renders "What I can help with" heading', () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/what I can help with/i)).toBeInTheDocument();
  });

  it('renders "What I cannot help with" heading', () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/what I cannot help with/i)).toBeInTheDocument();
  });

  it("lists treatment navigation as something it can help with", () => {
    render(<WhatICanHelp />);
    expect(
      screen.getByText(/navigating treatment options/i),
    ).toBeInTheDocument();
  });

  it("lists medical detox supervision as something it cannot help with", () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/medical detox supervision/i)).toBeInTheDocument();
  });

  it("does not claim to diagnose or prescribe", () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/prescribing/i)).toBeInTheDocument();
    expect(screen.getByText(/diagnosing/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="WhatICanHelp" --no-coverage
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test -- --no-coverage
```

Expected: all 67+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add __tests__/components/ServiceComparisonTable.test.tsx \
        __tests__/components/WhatICanHelp.test.tsx
git commit -m "test: add unit tests for ServiceComparisonTable and WhatICanHelp"
```
