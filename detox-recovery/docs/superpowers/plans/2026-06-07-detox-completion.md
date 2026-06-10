# Detox-Recovery End-to-End Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement **Part A** task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Part B is a human-only manual checklist** — agents cannot execute it (external dashboards, DNS, payment providers, `firebase deploy`).

**Goal:** Take nextsteprecovery.io from "code-complete but not launched" to "publicly launched and monetizing" — by applying the researched pricing changes in code, optionally generating product PDFs, and then executing the remaining external setup that only a human with dashboard access can do.

**Architecture:** The launch-blockers code work (Resend `from` fix, Lemon Squeezy code migration, product ungating) is **already done** in the working tree. What remains splits cleanly in two: **Part A** is the small amount of agent-executable code work left (pricing single-source-of-truth refactor + price update, optional PDF generation, a verification gate). **Part B** is the manual external work (Resend domain, MailerLite automations, Lemon Squeezy store + buy links, live deploy, Stripe archival) — documented as an accurate checklist pointing at the existing runbooks.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, Jest + Testing Library, Resend, MailerLite, Lemon Squeezy, Firebase App Hosting (Cloud Run).

---

## Current state (verified 2026-06-07)

| Launch-blocker item                                                                                             | Status                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Resend `from` double-wrap fix (`app/api/contact/route.ts:146`)                                                  | ✅ Already fixed                                                       |
| Lemon Squeezy code migration (`products-data.ts`, `apphosting.yaml`, `env.example`, `.github/workflows/ci.yml`) | ✅ Already on `LEMONSQUEEZY_*` vars                                    |
| Paid products ungated (no `availability: "coming-soon"`)                                                        | ✅ Already ungated                                                     |
| Product PDF **source** content (`docs/product/products/01-05`)                                                  | ✅ Markdown exists                                                     |
| Lead-magnet **source** content (`docs/operations/lead-magnets/01-03`)                                           | ✅ Markdown exists                                                     |
| Product **PDFs** (the actual files to upload)                                                                   | ❌ Not generated                                                       |
| Pricing reflects market research                                                                                | ❌ Support call still `$50`; hero hardcodes `$50`                      |
| Resend sending domain verified                                                                                  | ⏳ Manual / unknown                                                    |
| MailerLite delivery automations                                                                                 | ❌ Manual (runbook exists)                                             |
| Lemon Squeezy store + real buy links                                                                            | ❌ Manual (apphosting.yaml has placeholders)                           |
| recovery-api referral relay                                                                                     | 🔒 Intentionally disabled pending partner agreement — **out of scope** |

**Runbooks (authoritative for Part B):**

- `docs/operations/manual-tasks/2026-05-21-external-service-setup.md`
- `docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md`
- `docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md`

---

## Pricing research summary (grounds Task 1)

Source: market-researcher comps captured 2026-06-07 (memory obs 422–431).

| Offering                  | Current price             | Market comps                                                                              | Verdict                                                        |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 30-min support call       | `$50` (beta)              | 30-min sessions $75–$210; entry peer coach $75–$140/hr; $50 ≈ $100/hr equiv (below entry) | **Raise** to $65–$85 band                                      |
| 60-min family/nav call    | `$125–$175` (coming-soon) | Medicare PIN floor $77.95/60min; established coach $150–$250/hr                           | **Keep** — defensible mid-band                                 |
| 2-week navigation package | `$300–$600` (coming-soon) | Starter packages (3–4 sessions) $420–$560                                                 | **Keep** — value-positioned (model targets $450, inside range) |
| Paid PDFs                 | `$9.99`–`$19.99`          | Digital recovery workbooks $1.50–$15 (Gumroad/Etsy)                                       | **Keep** — sound                                               |
| B2B consulting            | contact-for-quote         | Healthcare advisory $175–$400/hr; engagements $1,500–$7,500                               | **Keep** — no published price needed                           |

> **DECISION POINT 1 (support-call price):** Recommended new value is **`$75`** (clean number, inside the $65–$85 verdict band, ≈ $150/hr — sits at the established-coach floor while staying entry-level). Keep the `betaLabel` so the raise reads as introductory repricing, not a permanent ceiling. If you prefer a different number ($65, $79, $85), substitute it everywhere `$75` appears in Task 1. **Only the support call is "available" today; the family/package tiers stay `coming-soon`, so no other live price changes.**

---

## Files to create or modify (Part A)

| Action                      | File                                        | What changes                                                                                   |
| --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Modify                      | `lib/services-data.ts`                      | Support-call `price` `$50` → `$75`                                                             |
| Modify                      | `components/home/HeroSection.tsx`           | Stop hardcoding `$50 beta`; derive price + label from `SERVICE_TIERS` (single source of truth) |
| Create                      | `__tests__/components/HeroSection.test.tsx` | Assert hero CTA shows the support-call tier's price from data (drift guard)                    |
| Create _(optional, Task 2)_ | `scripts/generate-pdfs.mjs`                 | Convert the 8 source markdown files → PDFs in `build/pdfs/`                                    |
| Modify _(optional, Task 2)_ | `package.json`                              | Add `md-to-pdf` devDep + `pdfs` script                                                         |

---

# PART A — Agent-executable code work

## Task 1: Single-source-of-truth pricing + support-call price raise

**Background:** `lib/services-data.ts` is the source of truth for service prices, BUT `components/home/HeroSection.tsx:25` hardcodes the string `"Book a support call — $50 beta"`. Raising the price in the data file alone would leave the hero showing a stale `$50` — a real drift bug. This task first removes the hardcode (deriving the value from `SERVICE_TIERS`), proves it with a test, then changes the price in one place.

**Files:**

- Modify: `lib/services-data.ts:33`
- Modify: `components/home/HeroSection.tsx`
- Test: `__tests__/components/HeroSection.test.tsx` (new)

- [ ] **Step 1.1: Read the current HeroSection to find the exact CTA markup**

Run: `sed -n '1,60p' components/home/HeroSection.tsx`
Note the import section and the literal line `Book a support call — $50 beta` (around line 25). You will replace that literal.

- [ ] **Step 1.2: Write the failing drift-guard test**

Create `__tests__/components/HeroSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import HeroSection from "@/components/home/HeroSection";
import { SERVICE_TIERS } from "@/lib/services-data";

describe("HeroSection support-call CTA", () => {
  it("shows the support-call price from SERVICE_TIERS (no hardcoded drift)", () => {
    const supportCall = SERVICE_TIERS.find((t) => t.id === "support-call");
    expect(supportCall).toBeDefined();

    render(<HeroSection />);

    // The hero CTA must render the same price string the data file defines.
    expect(
      screen.getByText(new RegExp(supportCall!.price.replace("$", "\\$"))),
    ).toBeInTheDocument();
  });
});
```

> **Note on import style:** if `HeroSection` is a named export (`export function HeroSection`), change the import to `import { HeroSection } from "@/components/home/HeroSection";`. Check Step 1.1 output. If the component reads no props and uses `"use client"`, the render above still works under jsdom.

- [ ] **Step 1.3: Run the test to verify it fails**

Run: `npx jest __tests__/components/HeroSection.test.tsx --no-coverage`
Expected: FAIL — the hero currently hardcodes `$50` while this test will still pass at `$50`... so to make it a genuine RED, the failure appears in Step 1.6 after the price changes. For now expect: PASS at the current `$50` (the test asserts data/UI agreement, which is currently true by coincidence of the hardcode). This is acceptable — the test's value is locking the invariant before we change the price.

> If you prefer a strict RED first: temporarily set the support-call price to `$75` in `lib/services-data.ts` BEFORE editing the hero, run the test (it FAILS because the hero still says `$50`), then proceed to Step 1.4. Either order is fine; the end state is identical.

- [ ] **Step 1.4: Refactor HeroSection to derive the price from data**

In `components/home/HeroSection.tsx`, add the import near the other imports:

```tsx
import { SERVICE_TIERS } from "@/lib/services-data";
```

Immediately inside the component function body (before the returned JSX), add:

```tsx
const supportCall = SERVICE_TIERS.find((t) => t.id === "support-call");
const supportCallLabel = supportCall
  ? `Book a support call — ${supportCall.price}${
      supportCall.betaLabel ? " beta" : ""
    }`
  : "Book a support call";
```

Then replace the hardcoded CTA text literal `Book a support call — $50 beta` with `{supportCallLabel}`.

> If the literal sits inside a `Button`/`Link` child, replace only the text node: `>{supportCallLabel}<`. Keep the surrounding element and its `href` unchanged.

- [ ] **Step 1.5: Change the support-call price (DECISION POINT 1 value)**

In `lib/services-data.ts`, the `support-call` tier (line ~33):

```ts
    price: "$75",
```

(Was `"$50"`. Use your chosen value from Decision Point 1 if not `$75`.) Leave `betaLabel: "Introductory beta pricing"` in place.

- [ ] **Step 1.6: Run the drift-guard test — verify it passes at the new price**

Run: `npx jest __tests__/components/HeroSection.test.tsx --no-coverage`
Expected: PASS — hero now renders `$75` because it reads from `SERVICE_TIERS`.

- [ ] **Step 1.7: Run the full suite to confirm no regression**

Run: `npm run test -- --no-coverage --ci`
Expected: all suites pass (one new suite added). If any `services`/`home` page test asserted on `$50` literally, update that literal to `$75` — re-run until green.

- [ ] **Step 1.8: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 1.9: Commit**

```bash
git add lib/services-data.ts components/home/HeroSection.tsx __tests__/components/HeroSection.test.tsx
git commit -m "feat: raise support-call price to \$75 and derive hero price from SERVICE_TIERS"
```

---

## Task 2 (OPTIONAL): Generate product + lead-magnet PDFs from markdown

**Background:** Part B's Lemon Squeezy and MailerLite steps need actual PDF/email content. The 8 source markdown files exist; no PDF tooling is installed (`pandoc`/`weasyprint` absent). This task adds a self-contained Node script so PDFs can be regenerated reproducibly. **Skip this task if you intend to author the PDFs by hand or in a design tool** (Canva, Google Docs) for better visual polish — peer-support PDFs are a brand artifact and hand-design is a legitimate choice.

> **DECISION POINT 2:** Generate PDFs programmatically (this task), or author them manually in a design tool (skip this task, do it in Part B Step B3.1)? Programmatic is fast and reproducible but plain-looking; manual is prettier but slower. Recommended: **generate now** to unblock launch, polish later.

**Files:**

- Create: `scripts/generate-pdfs.mjs`
- Modify: `package.json` (devDependency + script)

- [ ] **Step 2.1: Add the `md-to-pdf` devDependency**

Run: `npm install --save-dev md-to-pdf`
Expected: `md-to-pdf` appears under `devDependencies` in `package.json`. (It bundles Puppeteer/Chromium for rendering.)

- [ ] **Step 2.2: Create the generation script**

Create `scripts/generate-pdfs.mjs`:

```js
// Generates PDFs from the canonical markdown sources for paid products and
// free lead magnets. Output is written to build/pdfs/ (gitignored build dir).
// Run: npm run pdfs
import { mdToPdf } from "md-to-pdf";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT_DIR = "build/pdfs";

// [source markdown, output pdf filename]
const JOBS = [
  [
    "docs/product/products/01-family-survival-guide.md",
    "family-survival-guide.pdf",
  ],
  [
    "docs/product/products/02-appointment-prep-worksheet.md",
    "appointment-prep-worksheet.pdf",
  ],
  [
    "docs/product/products/03-withdrawal-safety-checklist.md",
    "withdrawal-safety-checklist.pdf",
  ],
  [
    "docs/product/products/04-treatment-comparison-worksheet.md",
    "treatment-comparison-worksheet.pdf",
  ],
  [
    "docs/product/products/05-relapse-prevention-plan.md",
    "relapse-prevention-plan.pdf",
  ],
  [
    "docs/operations/lead-magnets/01-unsafe-withdrawal.md",
    "lead-magnet-unsafe-withdrawal.pdf",
  ],
  [
    "docs/operations/lead-magnets/02-helping-someone-in-withdrawal.md",
    "lead-magnet-helping-someone.pdf",
  ],
  [
    "docs/operations/lead-magnets/03-detox-programs-lose-trust.md",
    "lead-magnet-detox-programs.pdf",
  ],
];

await mkdir(OUT_DIR, { recursive: true });

for (const [src, out] of JOBS) {
  const dest = join(OUT_DIR, out);
  await mkdir(dirname(dest), { recursive: true });
  const pdf = await mdToPdf({ path: src }, { dest });
  if (!pdf) throw new Error(`Failed to generate PDF for ${src}`);
  console.log(`✓ ${src} → ${dest}`);
}

console.log(`\nDone. ${JOBS.length} PDFs in ${OUT_DIR}/`);
```

- [ ] **Step 2.3: Add the npm script**

In `package.json` `"scripts"`, add:

```json
    "pdfs": "node scripts/generate-pdfs.mjs",
```

- [ ] **Step 2.4: Confirm `build/` is gitignored**

Run: `grep -n "build" .gitignore`
Expected: a line matching `build` or `/build`. If absent, add `build/` to `.gitignore` (generated PDFs are build artifacts, not source). Commit the .gitignore change if you edited it.

- [ ] **Step 2.5: Generate the PDFs**

Run: `npm run pdfs`
Expected: 8 lines of `✓ ... → build/pdfs/*.pdf` and a final `Done. 8 PDFs`. If Chromium download was blocked, see md-to-pdf docs for `PUPPETEER_SKIP_DOWNLOAD` / system-Chrome config, or fall back to manual authoring (Decision Point 2).

- [ ] **Step 2.6: Spot-check one PDF**

Run: `ls -la build/pdfs/` and open `build/pdfs/family-survival-guide.pdf` to confirm it renders headings/body correctly.

- [ ] **Step 2.7: Commit the tooling (not the artifacts)**

```bash
git add package.json package-lock.json scripts/generate-pdfs.mjs .gitignore
git commit -m "chore: add md-to-pdf script to generate product + lead-magnet PDFs"
```

---

## Task 3: Pre-launch verification gate

**Background:** Before handing off to the manual launch steps, prove the build is green so a human isn't debugging code mid-deploy.

- [ ] **Step 3.1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3.2: Full test suite**

Run: `npm run test -- --no-coverage --ci`
Expected: all suites pass.

- [ ] **Step 3.3: Production build with placeholder env (mirrors CI)**

Run: `npm run build`
Expected: `✓ Compiled successfully` and route table printed. Missing `NEXT_PUBLIC_*` vars fall back to `"#"` by design — build must still succeed.

- [ ] **Step 3.4: Report green status**

Confirm all three commands passed. Part A is complete. Hand off to Part B.

---

# PART B — Manual / external checklist (human-only)

> Agents cannot do any of this: it requires logins to Resend, MailerLite, Lemon Squeezy, Stripe, your DNS provider, and running `firebase deploy` from your own terminal. Each group references the authoritative runbook. Check boxes as you go.

## B1: Resend sending domain

- [ ] **B1.1** Decide sender domain. Recommended: `nextsteprecovery.io` (matches the site). Current `apphosting.yaml` `RESEND_FROM_EMAIL` = `"Withdrawal Support <admin@regroup-app.com>"`.
- [ ] **B1.2** In Resend → Domains → Add domain → add SPF + DKIM DNS records at your DNS provider → Verify. (See `docs/operations/manual-tasks/2026-05-21-external-service-setup.md`.)
- [ ] **B1.3** _(If switching to nextsteprecovery.io)_ update `apphosting.yaml` `RESEND_FROM_EMAIL` to `"Withdrawal Support <support@nextsteprecovery.io>"`, commit, redeploy.
- [ ] **B1.4** Smoke test: submit `/contact` with your own email; confirm inquiry arrives, From header is not double-wrapped, not in spam.

## B2: MailerLite lead-magnet automations (zero code)

- [ ] **B2.1** Follow `docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md` end to end.
- [ ] **B2.2** Create 3 automations triggered on "subscriber added to group":
  - Group `188194958591657681` → email `docs/operations/lead-magnets/01-unsafe-withdrawal.md`
  - Group `188194958890501182` → email `docs/operations/lead-magnets/02-helping-someone-in-withdrawal.md`
  - Group `188194959207171446` → email `docs/operations/lead-magnets/03-detox-programs-lose-trust.md`
- [ ] **B2.3** Test each: subscribe a test address via `/resources` form; confirm guide email arrives within 5 min.

## B3: Lemon Squeezy store + products

- [ ] **B3.1** Ensure 8 PDFs exist (from Task 2 `build/pdfs/`, or author manually). The 5 **paid** product PDFs are required; lead-magnet PDFs are for B2 emails.
- [ ] **B3.2** Follow `docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md` steps 1–6: create account → store → verify merchant → enable **Test Mode** → create 5 products (upload PDFs) → test one purchase.
- [ ] **B3.3** Copy the 5 **test-mode** buy links into `.env.local` and verify locally: `npm run dev` → `/resources` shows real CTA buttons (not "Available soon"), each opens Lemon Squeezy test checkout.
- [ ] **B3.4** Switch Lemon Squeezy to **Live Mode**, copy the 5 **live** buy links.
- [ ] **B3.5** Replace the 5 placeholder values in `apphosting.yaml` (lines ~18–46, the `NEXT_PUBLIC_LEMONSQUEEZY_*` entries) with the live links. Commit:
  ```bash
  git add apphosting.yaml
  git commit -m "config: activate live-mode Lemon Squeezy buy links"
  ```

## B4: Deploy + live smoke test

- [ ] **B4.1** `git push`
- [ ] **B4.2** In your terminal: `firebase deploy` (Claude cannot run this). Wait for `✔ Deploy complete!`
- [ ] **B4.3** On https://nextsteprecovery.io/resources: all 5 paid products show real CTAs; each opens Lemon Squeezy live checkout (NO orange Test Mode banner) with correct name + price.
- [ ] **B4.4** On https://nextsteprecovery.io: hero CTA shows the new `$75` support-call price.
- [ ] **B4.5** Submit `/contact` and one `/resources` lead-magnet form on the live site; confirm both deliver.

## B5: Decommission old Stripe PDF links

- [ ] **B5.1** Stripe Dashboard → Payment Links → archive the 5 old PDF links (Family Survival Guide, Appointment Prep, Withdrawal Safety Checklist, Treatment Comparison, Relapse Prevention). **Leave the support-call and donation links active.**

---

## Verification checklist (launch done when all true)

- [ ] Support-call price reads `$75` everywhere (data, hero, services page) — no `$50` drift
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test -- --no-coverage --ci` all suites pass
- [ ] `npm run build` succeeds
- [ ] CI green on `main` (GitHub Actions)
- [ ] Contact form emails arrive with correct sender, not spam, not double-wrapped
- [ ] Each of 3 lead magnets delivers its guide email within 5 min of signup
- [ ] All 5 paid product CTAs open Lemon Squeezy **live** checkout
- [ ] 5 old Stripe PDF payment links archived
- [ ] recovery-api referral relay remains disabled (unchanged — partner agreement pending)

---

## Out of scope (explicitly not in this plan)

- **recovery-api referral relay** — code is complete but intentionally disabled pending partner agreement; do not enable.
- **Tier 3/4 launch** (family call, navigation package) — stay `coming-soon` per the monetization roadmap (Q3 2026 / Q2 2027). No pricing/status change here.
- **Medicaid billing** — deferred to Year 2.
- **B2B consulting published pricing** — stays contact-for-quote.
