# Partnership Pages + Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two public marketing pages (`/for-treatment-centers`, `/for-intergroups`) with a shared lead-capture form so Marcus can email a prospect today and have them land on a credible pricing page with a working "Request information" submission.

**Architecture:** Two React pages sharing a `LeadCaptureForm` component, backed by one unauthenticated Cloud Function callable `submitPartnershipLead` that writes to a new `partnershipLeads` Firestore collection. Firestore rules block direct client writes to the collection — only the callable can write. No Stripe integration, no admin UI, no notification emails in Phase 1; leads are viewed in the Firebase console and Marcus handles outreach manually.

**Tech Stack:** React 18, react-router-dom, styled-components, framer-motion, react-intersection-observer (all already in `web/package.json`); Firebase Cloud Functions (Node 22, TypeScript); Jest with the existing mock pattern used by `getPublicGroupProfile.test.ts`.

**Spec:** `docs/superpowers/specs/2026-04-14-partnership-pages-design.md`

---

## File Map

### Create

- `functions/src/callable/submitPartnershipLead.ts` — unauthenticated callable; validates payload, writes to `partnershipLeads`
- `functions/src/__tests__/submitPartnershipLead.test.ts` — Jest unit tests
- `web/src/components/LeadCaptureForm.js` — shared form component used by both pages
- `web/src/pages/TreatmentCentersPage.js` — `/for-treatment-centers`
- `web/src/pages/IntergroupsPage.js` — `/for-intergroups`

### Modify

- `functions/src/index.ts` — export new callable
- `firestore.rules` — deny direct client writes to `partnershipLeads`
- `web/src/App.js` — add two new routes
- `web/src/components/Footer.js` — add "For treatment centers" and "For intergroups" links

---

## Task 1: `submitPartnershipLead` callable with tests

**Files:**

- Create: `functions/src/callable/submitPartnershipLead.ts`
- Create: `functions/src/__tests__/submitPartnershipLead.test.ts`
- Modify: `functions/src/index.ts`

### Step 1.1: Write the failing test

- [ ] Create `functions/src/__tests__/submitPartnershipLead.test.ts`:

```typescript
/**
 * Tests for submitPartnershipLead callable.
 * Covers validation, honeypot rejection, and successful writes.
 */

export {}; // Ensure isolated module

// ---- Mocks ----
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) => {
      if (
        typeof optsOrHandler === "object" &&
        typeof maybeHandler === "function"
      ) {
        return maybeHandler;
      }
      return optsOrHandler;
    },
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAdd = jest.fn();
const mockCollection = jest.fn(() => ({ add: mockAdd }));
jest.mock("../utils/firebase", () => ({
  db: {
    collection: mockCollection,
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  },
}));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  },
}));

import { submitPartnershipLead } from "../callable/submitPartnershipLead";

function req(data: any, rawRequest?: any) {
  return {
    data,
    auth: undefined,
    rawRequest: rawRequest || { headers: {} },
  } as any;
}

const VALID_LEAD = {
  kind: "treatment_center",
  organizationName: "Serenity Treatment Center",
  contactName: "Dr. Jane Doe",
  email: "jane@example.com",
  phone: "+1-555-123-4567",
  notes: "Interested in the Referral Partner tier",
  tier: "Referral Partner",
  website: "", // honeypot — must be empty
};

describe("submitPartnershipLead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdd.mockResolvedValue({ id: "lead-1" });
  });

  it("writes a valid treatment_center lead and returns success", async () => {
    const result = await submitPartnershipLead(req(VALID_LEAD));
    expect(result.success).toBe(true);
    expect(result.id).toBe("lead-1");
    expect(mockCollection).toHaveBeenCalledWith("partnershipLeads");
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const written = mockAdd.mock.calls[0][0];
    expect(written.kind).toBe("treatment_center");
    expect(written.organizationName).toBe("Serenity Treatment Center");
    expect(written.status).toBe("new");
  });

  it("writes a valid intergroup lead", async () => {
    const lead = { ...VALID_LEAD, kind: "intergroup", tier: undefined };
    const result = await submitPartnershipLead(req(lead));
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.kind).toBe("intergroup");
  });

  it("rejects invalid kind", async () => {
    await expect(
      submitPartnershipLead(req({ ...VALID_LEAD, kind: "bogus" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects missing organizationName", async () => {
    await expect(
      submitPartnershipLead(req({ ...VALID_LEAD, organizationName: "" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects missing contactName", async () => {
    await expect(
      submitPartnershipLead(req({ ...VALID_LEAD, contactName: "" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects malformed email", async () => {
    await expect(
      submitPartnershipLead(req({ ...VALID_LEAD, email: "not-an-email" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects honeypot field filled in (bot)", async () => {
    await expect(
      submitPartnershipLead(
        req({ ...VALID_LEAD, website: "http://spam.example.com" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("truncates overly long free-text fields to limit abuse", async () => {
    const longText = "x".repeat(10_000);
    const result = await submitPartnershipLead(
      req({ ...VALID_LEAD, notes: longText }),
    );
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.notes.length).toBeLessThanOrEqual(2000);
  });

  it("captures userAgent from rawRequest for triage", async () => {
    const result = await submitPartnershipLead(
      req(VALID_LEAD, { headers: { "user-agent": "Mozilla/5.0 test" } }),
    );
    expect(result.success).toBe(true);
    const written = mockAdd.mock.calls[0][0];
    expect(written.userAgent).toBe("Mozilla/5.0 test");
  });
});
```

### Step 1.2: Run the test to verify it fails

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm test -- --testPathPattern=submitPartnershipLead
```

Expected: FAIL with `Cannot find module '../callable/submitPartnershipLead'`.

### Step 1.3: Implement the callable

- [ ] Create `functions/src/callable/submitPartnershipLead.ts`:

```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";

interface SubmitPartnershipLeadData {
  kind: "treatment_center" | "intergroup";
  organizationName: string;
  contactName: string;
  email: string;
  phone?: string;
  tier?: string;
  notes?: string;
  website?: string; // honeypot — must be empty/undefined
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT_LEN = 2000;
const MAX_SHORT_LEN = 200;

function trunc(s: string | undefined, max: number): string | undefined {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

async function handler(
  request: CallableRequest<SubmitPartnershipLeadData>,
): Promise<{ success: true; id: string }> {
  const data = request.data || ({} as SubmitPartnershipLeadData);

  // Honeypot: real users never fill this in.
  if (data.website && data.website.trim() !== "") {
    throw new HttpsError("invalid-argument", "Invalid submission.");
  }

  if (data.kind !== "treatment_center" && data.kind !== "intergroup") {
    throw new HttpsError("invalid-argument", "Invalid partnership kind.");
  }

  const orgName = (data.organizationName || "").trim();
  const contactName = (data.contactName || "").trim();
  const email = (data.email || "").trim();

  if (!orgName) {
    throw new HttpsError("invalid-argument", "Organization name is required.");
  }
  if (!contactName) {
    throw new HttpsError("invalid-argument", "Contact name is required.");
  }
  if (!EMAIL_RE.test(email)) {
    throw new HttpsError("invalid-argument", "Valid email is required.");
  }

  const userAgent: string | undefined = request.rawRequest?.headers?.[
    "user-agent"
  ] as string | undefined;

  const doc: Record<string, unknown> = {
    kind: data.kind,
    organizationName: trunc(orgName, MAX_SHORT_LEN),
    contactName: trunc(contactName, MAX_SHORT_LEN),
    email: trunc(email, MAX_SHORT_LEN),
    phone: trunc(data.phone?.trim(), MAX_SHORT_LEN),
    tier: trunc(data.tier?.trim(), MAX_SHORT_LEN),
    notes: trunc(data.notes?.trim(), MAX_TEXT_LEN),
    userAgent: trunc(userAgent, MAX_SHORT_LEN),
    status: "new",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await db.collection("partnershipLeads").add(doc);
    return { success: true as const, id: ref.id };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      "Unable to submit lead. Please try again.",
    );
  }
}

export const submitPartnershipLead = functions.https.onCall(handler);
```

### Step 1.4: Run tests to verify they pass

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm test -- --testPathPattern=submitPartnershipLead
```

Expected: all 9 tests PASS.

### Step 1.5: Export from `index.ts`

- [ ] Open `functions/src/index.ts`. Find the alphabetically-sorted block of `export { ... } from "./callable/...";` lines and add:

```typescript
export { submitPartnershipLead } from "./callable/submitPartnershipLead";
```

Place it alphabetically (between existing `submitX` and `syncX` exports, or wherever alphabetical order dictates).

### Step 1.6: Type-check the functions project

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build
```

Expected: clean TypeScript compile, no errors.

### Step 1.7: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add functions/src/callable/submitPartnershipLead.ts \
  functions/src/__tests__/submitPartnershipLead.test.ts \
  functions/src/index.ts
git commit -m "feat(functions): submitPartnershipLead callable with validation and honeypot"
```

---

## Task 2: Firestore rules — deny direct writes to `partnershipLeads`

**Why:** Unauthenticated clients should never be able to write to `partnershipLeads` directly. Only the callable (running with admin credentials) can write.

**Files:**

- Modify: `firestore.rules`

### Step 2.1: Locate the rules file and add the collection rule

- [ ] Open `firestore.rules`. Inside the `match /databases/{database}/documents { ... }` block, add a new match that denies all client reads and writes. Place it with the other collection-level rules (near `match /groups/{groupId}` or similar):

```
match /partnershipLeads/{leadId} {
  // Leads are only written by the submitPartnershipLead callable, which
  // runs with admin credentials and bypasses security rules. Reads are
  // handled via the Firebase console for now (no client-side viewer).
  allow read: if false;
  allow write: if false;
}
```

### Step 2.2: Run the rules tests if they exist

- [ ] Check for existing rules tests:

```bash
ls /Users/marcusklein/dev/RecoveryConnect/functions/src/tests/security-rules.test.ts 2>/dev/null && echo "exists" || echo "no rules tests"
```

- [ ] If tests exist, add a test asserting reads and writes to `partnershipLeads` are denied for both authenticated and unauthenticated users. If no tests exist, skip (rules tests require Firestore emulator).

### Step 2.3: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add firestore.rules
git commit -m "feat(rules): deny direct client access to partnershipLeads"
```

---

## Task 3: Shared `LeadCaptureForm` component

**Files:**

- Create: `web/src/components/LeadCaptureForm.js`

### Step 3.1: Implement the component

- [ ] Create `web/src/components/LeadCaptureForm.js`:

```jsx
import React, { useState } from "react";
import styled from "styled-components";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

const FormContainer = styled.form`
  max-width: 560px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;

const FormTitle = styled.h3`
  margin: 0 0 0.5rem;
`;

const FormSubtitle = styled.p`
  color: var(--text-secondary);
  margin: 0 0 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin: 0.75rem 0 0.35rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  box-sizing: border-box;
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 0.9rem;
  margin-top: 1.25rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--primary-dark);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Honeypot = styled.input`
  position: absolute;
  left: -9999px;
  opacity: 0;
  pointer-events: none;
`;

const ErrorBanner = styled.div`
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
`;

const SuccessBanner = styled.div`
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
`;

/**
 * Shared lead-capture form used by partnership landing pages.
 *
 * Props:
 *   kind       - "treatment_center" | "intergroup"
 *   title      - form heading
 *   subtitle   - form subheading
 *   tiers      - optional array of strings for the tier selector; if omitted,
 *                no tier dropdown is rendered
 */
export default function LeadCaptureForm({ kind, title, subtitle, tiers }) {
  const [organizationName, setOrg] = useState("");
  const [contactName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState(tiers ? tiers[0] : "");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "submitPartnershipLead");
      await fn({
        kind,
        organizationName,
        contactName,
        email,
        phone,
        tier: tiers ? tier : undefined,
        notes,
        website, // honeypot — empty in normal flow
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err?.message ||
          "Could not submit your request. Please try again or email us directly.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <FormContainer as="div">
        <SuccessBanner>
          <strong>Thanks — we've got your request.</strong>
          <br />
          We'll reach out within one business day at {email}.
        </SuccessBanner>
      </FormContainer>
    );
  }

  return (
    <FormContainer onSubmit={handleSubmit}>
      <FormTitle>{title}</FormTitle>
      <FormSubtitle>{subtitle}</FormSubtitle>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Label htmlFor="organizationName">Organization name</Label>
      <Input
        id="organizationName"
        type="text"
        required
        value={organizationName}
        onChange={(e) => setOrg(e.target.value)}
        autoComplete="organization"
      />

      <Label htmlFor="contactName">Your name</Label>
      <Input
        id="contactName"
        type="text"
        required
        value={contactName}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <Label htmlFor="phone">Phone (optional)</Label>
      <Input
        id="phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
      />

      {tiers && (
        <>
          <Label htmlFor="tier">Interested tier</Label>
          <Select
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </>
      )}

      <Label htmlFor="notes">Anything we should know? (optional)</Label>
      <Textarea
        id="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* Honeypot — real users never see or fill this */}
      <Honeypot
        type="text"
        name="website"
        tabIndex="-1"
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <SubmitButton type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Request information"}
      </SubmitButton>
    </FormContainer>
  );
}
```

### Step 3.2: Verify build

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web && npm run build
```

Expected: `Compiled successfully`. (No callers yet; just checks JSX/import correctness.)

### Step 3.3: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add web/src/components/LeadCaptureForm.js
git commit -m "feat(web): shared LeadCaptureForm component with honeypot and callable submission"
```

---

## Task 4: Treatment centers landing page

**Files:**

- Create: `web/src/pages/TreatmentCentersPage.js`

### Step 4.1: Implement the page

- [ ] Create `web/src/pages/TreatmentCentersPage.js`:

```jsx
import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import LeadCaptureForm from "../components/LeadCaptureForm";

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 5rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 2.75rem;
  margin: 0 0 1rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.2rem;
  opacity: 0.95;
  margin: 0 0 1.5rem;
`;

const SectionContainer = styled.section`
  padding: 4rem 1rem;
  background: ${(p) =>
    p.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const SectionHeading = styled.h2`
  text-align: center;
  margin: 0 0 2rem;
`;

const BulletGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const BulletCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
`;

const BulletTitle = styled.h3`
  margin: 0 0 0.5rem;
  color: var(--primary-color);
`;

const PricingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 2rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const PricingCard = styled.div`
  background: white;
  border-radius: 10px;
  padding: 2rem 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
`;

const TierName = styled.h3`
  margin: 0 0 0.25rem;
  color: var(--primary-color);
`;

const TierPrice = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0.5rem 0 1rem;
`;

const TierList = styled.ul`
  margin: 0 0 1.5rem;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  line-height: 1.55;
  flex: 1;
`;

const TierAnchor = styled.a`
  display: inline-block;
  padding: 0.75rem 1rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  text-align: center;
`;

const FaqItem = styled.div`
  margin-bottom: 1.25rem;
`;

const FaqQuestion = styled.h4`
  margin: 0 0 0.35rem;
`;

const FaqAnswer = styled.p`
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
`;

const TIERS = [
  {
    name: "Basic Listing",
    price: "$99/mo",
    bullets: [
      "Listing in the in-app Resources directory",
      "Visible to users searching for post-discharge support",
      "Contact details displayed to interested members",
    ],
  },
  {
    name: "Referral Partner",
    price: "$299/mo",
    bullets: [
      "Everything in Basic Listing",
      "Direct patient-to-group referrals",
      "Engagement analytics (group joins, meeting attendance)",
      "Alumni check-in dashboard",
    ],
  },
  {
    name: "White-Label Integration",
    price: "$999/mo",
    bullets: [
      "Everything in Referral Partner",
      "Branded app instance for your alumni program",
      "SSO for your clinical staff",
      "Compliance reporting exports",
    ],
  },
];

const TreatmentCentersPage = () => {
  const { ref: refA, inView: inViewA } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Bridge the aftercare gap.</PageTitle>
          <PageSubtitle>
            Connect discharged patients to verified 12-step groups, track
            engagement, and close the loop on outcomes — on operational software
            built for the long arc of recovery.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <SectionContainer>
        <Container>
          <SectionHeading>What's broken today</SectionHeading>
          <p
            style={{
              textAlign: "center",
              maxWidth: 720,
              margin: "0 auto",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            Most treatment software ends at discharge. Meanwhile, relapse rates
            in the first year post-discharge approach 85%, and the majority of
            clinicians never see follow-up data on the patients they discharged.
            Homegroups fills that gap as the operational layer between your
            facility and the 12-step community.
          </p>
        </Container>
      </SectionContainer>

      <SectionContainer
        alternate
        as={motion.section}
        ref={refA}
        initial={{ opacity: 0, y: 24 }}
        animate={inViewA ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: 0.5 }}
      >
        <Container>
          <SectionHeading>What you get</SectionHeading>
          <BulletGrid>
            <BulletCard>
              <BulletTitle>Verified group referrals</BulletTitle>
              <p>
                Refer patients directly to real, active homegroups with verified
                meeting schedules — not stale directory links.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Post-discharge engagement data</BulletTitle>
              <p>
                See which alumni joined a group, which ones are attending
                meetings, and where engagement is falling off.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Outcome reporting</BulletTitle>
              <p>
                Exportable reports for accreditation, grants, and value-based
                care contracts that increasingly require follow-up data.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Branded alumni experience</BulletTitle>
              <p>
                At the White-Label tier, give alumni a branded app experience
                that keeps your facility in the continuum of care long after
                discharge.
              </p>
            </BulletCard>
          </BulletGrid>
        </Container>
      </SectionContainer>

      <SectionContainer id="pricing">
        <Container>
          <SectionHeading>Pricing</SectionHeading>
          <PricingGrid>
            {TIERS.map((t) => (
              <PricingCard key={t.name}>
                <TierName>{t.name}</TierName>
                <TierPrice>{t.price}</TierPrice>
                <TierList>
                  {t.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </TierList>
                <TierAnchor href="#contact">Request information</TierAnchor>
              </PricingCard>
            ))}
          </PricingGrid>
        </Container>
      </SectionContainer>

      <SectionContainer alternate id="contact">
        <Container>
          <SectionHeading>Request information</SectionHeading>
          <LeadCaptureForm
            kind="treatment_center"
            title="Tell us about your facility"
            subtitle="We'll reach out within one business day to schedule a walkthrough."
            tiers={TIERS.map((t) => t.name)}
          />
        </Container>
      </SectionContainer>

      <SectionContainer>
        <Container>
          <SectionHeading>Common questions</SectionHeading>
          <FaqItem>
            <FaqQuestion>Is this HIPAA compliant?</FaqQuestion>
            <FaqAnswer>
              Homegroups is operational software for recovery groups, not a
              clinical record system. We do not store PHI. White-Label customers
              handling PHI-adjacent data will receive a Business Associate
              Agreement on request.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>How do patients sign up?</FaqQuestion>
            <FaqAnswer>
              Discharging staff can generate a personalized invite link or QR
              code. The patient installs the Homegroups app, connects to their
              first meeting, and your facility sees engagement data through a
              dashboard.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>Can we start with the Basic Listing tier?</FaqQuestion>
            <FaqAnswer>
              Yes. Most facilities start at Basic, confirm the value with a
              subset of alumni, then upgrade to Referral Partner within 30–60
              days.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>What's the minimum commitment?</FaqQuestion>
            <FaqAnswer>
              Month-to-month at Basic and Referral Partner tiers. White-Label
              integrations are custom contracts typically 12 months.
            </FaqAnswer>
          </FaqItem>
        </Container>
      </SectionContainer>
    </PageContainer>
  );
};

export default TreatmentCentersPage;
```

### Step 4.2: Verify build

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web && npm run build
```

Expected: `Compiled successfully`.

### Step 4.3: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add web/src/pages/TreatmentCentersPage.js
git commit -m "feat(web): treatment centers landing page with tiered pricing"
```

---

## Task 5: Intergroups landing page

**Files:**

- Create: `web/src/pages/IntergroupsPage.js`

### Step 5.1: Implement the page

- [ ] Create `web/src/pages/IntergroupsPage.js`:

```jsx
import React from "react";
import styled from "styled-components";
import LeadCaptureForm from "../components/LeadCaptureForm";

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 5rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 2.5rem;
  margin: 0 0 1rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.15rem;
  opacity: 0.95;
  margin: 0;
`;

const SectionContainer = styled.section`
  padding: 4rem 1rem;
  background: ${(p) =>
    p.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const SectionHeading = styled.h2`
  text-align: center;
  margin: 0 0 2rem;
`;

const BulletList = styled.ul`
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
  color: var(--text-secondary);
`;

const PricingCard = styled.div`
  max-width: 420px;
  margin: 0 auto;
  background: white;
  border-radius: 10px;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;

const TierName = styled.h3`
  margin: 0 0 0.25rem;
  color: var(--primary-color);
`;

const TierPrice = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0 1rem;
`;

const TierAnchor = styled.a`
  display: inline-block;
  padding: 0.75rem 1.75rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
`;

const IntergroupsPage = () => (
  <PageContainer>
    <HeroSection>
      <HeroContent>
        <PageTitle>One dashboard for your whole intergroup.</PageTitle>
        <PageSubtitle>
          Coordinate 20–100 groups, aggregate financial reporting, broadcast
          announcements, and onboard new groups in bulk — without the
          spreadsheet sprawl.
        </PageSubtitle>
      </HeroContent>
    </HeroSection>

    <SectionContainer>
      <Container>
        <SectionHeading>Built for district-level service</SectionHeading>
        <BulletList>
          <li>
            <strong>Multi-group dashboard.</strong> See every affiliated group's
            claimed status, meeting schedule, and rough activity level at a
            glance.
          </li>
          <li>
            <strong>Aggregate financial reporting.</strong> Roll up treasury
            contributions across groups for your own reporting needs without
            asking each treasurer for a spreadsheet.
          </li>
          <li>
            <strong>Cross-group announcements.</strong> Broadcast events and
            notices to members across all affiliated groups with one post.
          </li>
          <li>
            <strong>Bulk group onboarding.</strong> Invite all your district's
            groups at once with a pre-filled claim link.
          </li>
          <li>
            <strong>Institutional memory.</strong> Officer rotations, meeting
            changes, and service-position history preserved across the whole
            intergroup, not just individual groups.
          </li>
        </BulletList>
      </Container>
    </SectionContainer>

    <SectionContainer alternate id="pricing">
      <Container>
        <SectionHeading>Pricing</SectionHeading>
        <PricingCard>
          <TierName>Intergroup Subscription</TierName>
          <TierPrice>$99 / year</TierPrice>
          <p
            style={{
              color: "var(--text-secondary)",
              margin: "0 0 1.5rem",
            }}
          >
            Covers the whole intergroup regardless of how many groups you
            coordinate. Individual groups still subscribe at $12/year for their
            own admin tools.
          </p>
          <TierAnchor href="#contact">Request information</TierAnchor>
        </PricingCard>
      </Container>
    </SectionContainer>

    <SectionContainer id="contact">
      <Container>
        <SectionHeading>Request information</SectionHeading>
        <LeadCaptureForm
          kind="intergroup"
          title="Tell us about your intergroup"
          subtitle="We'll reach out within one business day to walk through the dashboard with you."
        />
      </Container>
    </SectionContainer>
  </PageContainer>
);

export default IntergroupsPage;
```

### Step 5.2: Verify build

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web && npm run build
```

Expected: `Compiled successfully`.

### Step 5.3: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add web/src/pages/IntergroupsPage.js
git commit -m "feat(web): intergroups landing page with single-tier pricing"
```

---

## Task 6: Wire routes + footer links

**Files:**

- Modify: `web/src/App.js`
- Modify: `web/src/components/Footer.js`

### Step 6.1: Add routes to `App.js`

- [ ] Open `web/src/App.js`. Add imports near the other page imports:

```jsx
import TreatmentCentersPage from "./pages/TreatmentCentersPage";
import IntergroupsPage from "./pages/IntergroupsPage";
```

- [ ] Add two new `<Route>` entries inside the inner `<Routes>` block (near `/pricing`):

```jsx
<Route path="/for-treatment-centers" element={<TreatmentCentersPage />} />
<Route path="/for-intergroups" element={<IntergroupsPage />} />
```

### Step 6.2: Add footer links

- [ ] Open `web/src/components/Footer.js`. Find the column that currently contains `/features`, `/pricing`, `/download`, `/updates` (it's the "Product" column). Add two new `<FooterLink>` entries at the bottom of that column:

```jsx
<FooterLink to="/for-treatment-centers">For treatment centers</FooterLink>
<FooterLink to="/for-intergroups">For intergroups</FooterLink>
```

Keep the existing column header (likely "Product"). If a more appropriate column exists (e.g. "Partnerships"), use that, but DO NOT add a new column unless asked — follow the existing 4-column structure.

### Step 6.3: Verify build

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web && npm run build
```

Expected: `Compiled successfully`.

### Step 6.4: Smoke-test locally

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect/web && npm start
```

- [ ] In a browser, visit:
  - `http://localhost:3000/for-treatment-centers` — hero, bullet grid, 3 pricing cards, FAQ, form
  - `http://localhost:3000/for-intergroups` — hero, bullet list, single pricing card, form
  - Click a pricing card's "Request information" — page should scroll to `#contact`
  - Scroll to footer — both links should be visible and navigate correctly

Stop the dev server (`Ctrl+C`) when done.

### Step 6.5: Commit

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add web/src/App.js web/src/components/Footer.js
git commit -m "feat(web): wire partnership page routes and footer links"
```

---

## Task 7: Deploy callable + hosting, manual lead-submission test

**Files:** None. Deploy + verification.

### Step 7.1: Deploy the callable

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
npx firebase-tools@13 deploy --only functions:submitPartnershipLead --project recovery-connect-cad4b
```

Expected: `Deploy complete!` with a line like `functions[submitPartnershipLead(us-central1)] Successful create operation.`

### Step 7.2: Deploy hosting + rules

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
npx firebase-tools@13 deploy --only hosting,firestore:rules --project recovery-connect-cad4b
```

Expected: hosting release + rules release, both clean.

### Step 7.3: Submit a real lead on each page

- [ ] Open `https://recovery-connect-cad4b.web.app/for-treatment-centers` in an incognito window. Submit the form with a real-looking lead (you can use your own email). Expect the green success banner.

- [ ] Open `https://recovery-connect-cad4b.web.app/for-intergroups`. Submit a lead with `kind=intergroup`.

- [ ] Open the Firebase console → Firestore → `partnershipLeads`. Verify both documents are present with the correct `kind`, all fields populated, `status: "new"`, `createdAt` set.

### Step 7.4: Honeypot spot-check

- [ ] Open DevTools on the treatment centers page. In the console:

```javascript
document.querySelector('input[name="website"]').value =
  "http://spam.example.com";
```

- [ ] Fill the rest of the form normally and submit. Expected: the form shows an error banner; no new document appears in `partnershipLeads`.

### Step 7.5: Commit the build artifacts

- [ ] Run:

```bash
cd /Users/marcusklein/dev/RecoveryConnect
git add web/build/
git commit -m "build(web): rebuild with partnership pages"
```

### Task 7 follow-up: optional fields and Firestore (2026-04-15)

The plan was implemented in a Claude Code session following this document task-by-task (Tasks 1–7). After first deploy, **valid** submissions sometimes returned `INTERNAL` (“Unable to submit lead…”) while the honeypot path still returned `invalid-argument` as expected.

**Cause:** Firestore does not allow `undefined` as a field value. Optional fields (`phone`, `tier`, `notes`, `userAgent`) were included on the write payload as `undefined` when omitted (e.g. curl smoke tests without `phone`, or intergroup without `tier`).

**Fix:** In `functions/src/callable/submitPartnershipLead.ts`, strip undefined keys with `omitUndefinedFields()` before `collection("partnershipLeads").add(...)`, and log write failures with `functions.logger.error` so Cloud Logging shows the real error. Jest includes a test that minimal payloads do not pass `undefined` into `add`.

**Re-verify:** Redeploy `submitPartnershipLead`, then repeat Step 7.3 (browser) and/or a callable POST with only required fields + empty honeypot — expect success, not `INTERNAL`.

---

## Self-Review

**Spec coverage:**

- Two public landing pages → Tasks 4 (treatment), 5 (intergroups) ✅
- Shared `LeadCaptureForm` → Task 3 ✅
- `/for-treatment-centers` route → Task 6.1 ✅
- `/for-intergroups` route → Task 6.1 ✅
- Three-tier pricing (TC) → Task 4 (TIERS const) ✅
- Single-tier pricing (IG) → Task 5 ✅
- Firestore `partnershipLeads` collection with specified shape → Task 1.3 ✅
- `submitPartnershipLead` callable with validation + honeypot + email regex + truncation + user-agent capture + **omit undefined fields before Firestore write** → Tasks 1.1–1.4 + Task 7 follow-up ✅
- Firestore rules denying direct client access → Task 2 ✅
- Footer links → Task 6.2 ✅
- Deploy + manual verification → Task 7 ✅

**Out-of-scope items per spec (correctly omitted):**

- Stripe integration ✅ (not in plan)
- Admin leads dashboard ✅ (not in plan)
- Notification emails ✅ (not in plan — Marcus polls Firestore)
- Custom domain ✅ (not in plan)

**Placeholder scan:** no "TBD", no "add validation later", no "similar to Task N without code" — every code block has real content.

**Type consistency:** `kind` is `"treatment_center" | "intergroup"` everywhere (callable validation, test fixtures, form prop). `tier` is an optional string in all call sites. `status: "new"` is consistent. `partnershipLeads` is the collection name in the callable, rules, and manual verification.
