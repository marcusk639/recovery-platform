# Partnership Landing Pages + Lead Capture — Design Spec

**Date:** 2026-04-14
**Status:** Approved (agreed in chat)
**Related:** `docs/STRATEGIC_ASSESSMENT_2026_02.md` (Part 2 — revenue expansion opportunities)

## Goal

Ship monetizable sales infrastructure so Marcus can close treatment center and intergroup partnerships without any further engineering work. A treatment center receiving a link today should arrive at a credible pricing + value-prop page with a working "Request information" form.

## Non-Goals

- Stripe billing automation for partnership tiers — first 10 customers are manual invoices; automating now is premature
- Feature-flag flipping or account provisioning — that happens manually after a sales conversation
- Sober living integration — requires cross-app work (Regroup) beyond this scope
- In-app multi-group upsell UI — separate future session

## Design Decisions

### Two public landing pages, one lead-capture form

- `/for-treatment-centers` — three tiers, ASAM continuum value prop, decision-maker: clinical/admin staff
- `/for-intergroups` — single tier, service-body value prop, decision-maker: GSRs and district officers

Both pages use the same `LeadCaptureForm` component to keep the backend contract consistent.

### Pricing tiers (copy only; no billing integration)

**Treatment centers:**

| Tier                    | Price   | What they get                                                                                        |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Basic Listing           | $99/mo  | Facility appears in an in-app "Resources" directory; post-discharge users can find them              |
| Referral Partner        | $299/mo | Everything in Basic, plus direct patient-to-group referrals on the platform and engagement analytics |
| White-Label Integration | $999/mo | Branded app instance for their alumni program, SSO, compliance dashboards                            |

**Intergroups:**

| Tier                    | Price    | What they get                                                                                          |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| Intergroup Subscription | $99/year | Multi-group dashboard, cross-group announcements, aggregate financial reporting, bulk group onboarding |

### Lead capture

New Firestore collection `partnershipLeads` with documents shaped like:

```typescript
{
  kind: "treatment_center" | "intergroup";
  tier?: string;              // optional: which tier they clicked
  organizationName: string;
  contactName: string;
  email: string;
  phone?: string;
  notes?: string;             // free-text field on the form
  createdAt: Timestamp;
  userAgent?: string;         // for spam triage
  status: "new";              // human-managed lifecycle; values can grow later
}
```

### Unauthenticated callable

New callable `submitPartnershipLead` that:

- Accepts the lead payload
- Validates required fields and rejects obvious bots (empty honeypot, email regex)
- Writes the doc to `partnershipLeads`
- Sends an email notification to an admin address (use existing email infrastructure if present; otherwise log for now and add Sendgrid later)

Unauthenticated because the form lives on a public marketing page. Risks: bots submitting junk, scrapers hammering the endpoint. Mitigation: honeypot field, basic client-side throttling, server-side minimum-time check. Real rate limiting deferred to a follow-up.

### Footer links

Add two links to the shared `Footer.js`:

- "For treatment centers"
- "For intergroups"

Under a new "Partnerships" column or inline with existing links, whichever matches the current footer structure.

## Page Structure

Both landing pages share the same section skeleton:

1. **Hero** — headline, one-sentence subhead, primary CTA anchors to the form below
2. **Problem statement** — one paragraph naming the pain the partner feels today
3. **Solution** — three to four bullets describing what they get
4. **Pricing** — table or cards with tier names, prices, inclusions
5. **Lead form** — name, org, email, phone (optional), tier selector (treatment-center page only), notes
6. **Trust signals** — short section on privacy posture (anonymity-first, compliance mindset)
7. **FAQ** — 4–6 common objections answered

Copy is concrete and plainspoken. No jargon. Numbers with sources where possible (relapse rates from ASAM, number of 12-step groups, etc. — pulled from the Strategic Assessment doc).

## Out of Scope (Phase 1)

- Stripe integration for partnership tiers
- Admin dashboard for reading leads — leads are viewed in the Firebase console for now
- Automated feature-flag provisioning after a deal closes
- Custom domain migration (still on `recovery-connect-cad4b.web.app`)
- A/B testing infrastructure

## Follow-Ups Worth Tracking

- Send notification emails (Sendgrid, Resend, or the existing Firebase email extension if installed). For Phase 1 the lead just lands in Firestore; Marcus polls manually.
- Once ~10 leads accrue, add a lightweight internal-only leads page for triage
- Add Stripe Checkout for self-serve treatment center signup once conversion patterns are visible

## Risks

- **Form spam.** Unauthenticated public endpoint. Honeypot + min-submit-time mitigations are minimal. Acceptable pre-launch; revisit when traffic justifies.
- **Pricing credibility.** If the page lists $999/mo and the product can't deliver white-label in a reasonable timeframe, early customers will churn or chargeback. V4.4 features exist in the codebase but are hidden — ensure we can turn them on for a real customer within 2 weeks of signing.
- **Legal.** No claims about treatment outcomes, HIPAA, or clinical efficacy — the product is operational, not clinical. Copy must stay on that side of the line.
