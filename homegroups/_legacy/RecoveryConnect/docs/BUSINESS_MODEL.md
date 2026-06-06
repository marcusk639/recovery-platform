> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Business Model

**Last updated:** April 2026
**Products:** Homegroups (RecoveryConnect) · RATS (Sober Living) · Aftercare System (planned)

---

## Revenue Streams

### Homegroups — Consumer SaaS

| Tier                  | Price     | Who Pays                           | What They Get                                                                                  |
| --------------------- | --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Free                  | $0        | Members                            | Meeting search, group chat, sobriety tracker, join groups                                      |
| Group admin           | $12/year  | Group admin                        | Treasury, meeting management, announcements, service positions, member management              |
| Additional groups     | $8/year   | Same admin                         | Each group beyond the first (multi-group discount)                                             |
| Intergroup / facility | Undefined | Intergroup orgs, treatment centers | Multi-group dashboard, bulk export, compliance reporting (V4.4 — code exists, pricing not set) |

7-day free trial with no payment method required at trial start.

### RATS — Sober Living SaaS

Sold to house operators. Tiers gate base operations, Oxford House governance, and multi-house enterprise. Stripe Connect handles rent collection from residents.

### Aftercare System — B2B Enterprise (planned)

$800–$3,000/facility/month + $3–$8/active alumni/month. Sold to addiction treatment centers that need post-discharge outcome data for accreditation and value-based care contracts. See `MARKET_INTELLIGENCE.md` §6 for the business case.

---

## Why $12/Year

- **Accessible.** Groups can split the cost among members ($0.60/person for a 20-member group).
- **Fair.** Flat rate avoids penalizing larger groups.
- **Low friction.** One billing event per year; annual Stripe fee is 5.4% vs. 33% overhead on monthly billing.
- **Positioned correctly.** A group operating expense, like literature — not a personal subscription.

$12/year is the wedge. Treatment center and intergroup revenue is the business. The subscription ceiling at 5,000 groups is $60K ARR; that requires B2B revenue to build a sustainable company.

---

## Revenue Projections (3-Year, Moderate Scenario)

| Stream                   | Year 1 ARR   | Year 2 ARR     | Year 3 ARR     |
| ------------------------ | ------------ | -------------- | -------------- |
| Homegroups subscriptions | $52,800      | $294,000       | $960,000       |
| RATS (sober living)      | $57,600      | $245,280       | $676,800       |
| Aftercare system         | $180,000     | $892,800       | $2,748,000     |
| **Combined**             | **$290,400** | **$1,432,080** | **$4,384,800** |

Source: `MARKET_INTELLIGENCE.md` §7.

---

## Break-Even — Homegroups Alone

| Groups | ARR     | Monthly Infra | Status              |
| ------ | ------- | ------------- | ------------------- |
| 50     | $600    | $100          | Pre-revenue         |
| 500    | $6,000  | $300          | Break-even          |
| 2,000  | $24,000 | $800          | Sustainable solo    |
| 5,000  | $60,000 | $1,000        | Ceiling without B2B |

Infrastructure: Firebase + Stripe + SendGrid.

---

## Key Metrics

| Metric                   | Target                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Trial-to-paid conversion | > 15%                                                      |
| Annual churn             | < 10%                                                      |
| DAU/MAU                  | > 20%                                                      |
| K-factor (referrals)     | > 0.3                                                      |
| Multi-group admin %      | Monitor closely (each additional group at $8 reduces ARPU) |

---

## Risk Factors

| Risk                                 | Mitigation                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Revenue ceiling at $12/group         | Treatment center and intergroup tiers are the path beyond $60K ARR                         |
| iOS App Store IAP compliance         | WebView Stripe checkout bypasses 30% cut; requires explicit legal review before submission |
| No price-increase path documented    | Add ToS clause now; grandfather early adopters explicitly                                  |
| Multi-group discount erodes ARPU     | Intentional growth lever; acceptable at current scale                                      |
| Trial abandonment (no card required) | Day 5 push notification — see `REVENUE_OPPORTUNITIES.md`                                   |
