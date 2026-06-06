> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Regroup / RATS — Market Opportunity Analysis

**Date:** May 2026 | **Stage:** Pre-launch / MVP | **Geography:** United States

---

## Section 1: Executive Summary

The US recovery housing software market is a nascent, underserved niche sitting at the intersection of a $1.3B+ (and growing) sober living industry and a near-total absence of purpose-built, affordable management software. An estimated **17,000–18,000 sober living and recovery homes** operate in the United States today, the vast majority managing residents with spreadsheets, paper, and manual payment collection. The two incumbent software players — Sobriety Hub and One Step — price on a per-staff-user model that makes costs unpredictable and opaque for small operators.

Regroup's tiered per-house subscription model, combined with a resident-facing directory and application layer, positions it as both an operator SaaS tool and a marketplace connecting residents to available homes — a structural advantage incumbents don't have.

| Metric                              | Value                        |
| ----------------------------------- | ---------------------------- |
| **TAM** (US operator subscriptions) | ~$22–25M ARR                 |
| **SAM** (reachable in 3–5 years)    | ~$9–10M ARR                  |
| **SOM** Year 3                      | ~$300–400K ARR (~240 houses) |
| **SOM** Year 5                      | ~$600–800K ARR (~500 houses) |
| **Market CAGR**                     | 5–10% annually through 2032  |

---

## Section 2: Market Definition

**Problem being solved:** Sober living operators manage residents, rent collection, house rules, meetings, applications, and compliance with paper or cobbled-together generic tools. The two purpose-built software options are per-user priced, opaque, and offer no resident-facing features. Residents seeking housing have no centralized, structured directory with application workflows.

**Target customer — primary:** Sober living home operators in the United States (both traditional operator-owned homes and Oxford House chapters).

**Target customer — secondary (future):** Outpatient and residential treatment centers seeking step-down housing coordination.

**Resident layer:** People in recovery use the app to browse a directory of homes, view availability and requirements, and submit applications — free to them, valuable to operators who get pre-qualified leads.

**Geography:** United States, all 50 states. Recovery housing exists in all states with high concentration in California, Florida, Texas, Ohio, and New England.

**Time horizon:** 5-year buildout (2026–2031).

---

## Section 3: Bottom-Up Analysis

### 3a. Market Inventory

| Segment                                                         | Count   | Source                            |
| --------------------------------------------------------------- | ------- | --------------------------------- |
| Total US recovery homes (broad estimate)                        | ~17,943 | PMC / Substance Use Research 2021 |
| Distinct recovery residences (NSTARR registry cross-referenced) | ~10,358 | NSTARR Project, PMC 2022          |
| Oxford Houses specifically                                      | ~3,500  | 1011Now, July 2025                |
| NARR-certified recovery residences                              | ~2,500  | NARR                              |
| SUD + mental health treatment facilities (SAMHSA)               | 21,205  | SAMHSA N-SUMHSS 2024              |

**Working assumption:** 17,000 total sober living and recovery homes in the US, of which ~3,500 are Oxford Houses and ~13,500 are traditional operator-owned or nonprofit homes.

### 3b. Pricing Model Assumptions

Regroup's tiered model (to be validated with customer discovery):

| Tier               | House Size | Monthly Price | Annual ACV |
| ------------------ | ---------- | ------------- | ---------- |
| Oxford / Small     | 1–8 beds   | $49           | $588       |
| Traditional Small  | 1–10 beds  | $89           | $1,068     |
| Traditional Medium | 11–20 beds | $149          | $1,788     |
| Traditional Large  | 20+ beds   | $229          | $2,748     |

**Blended average ACV — traditional homes:** ~$1,300/year (assuming ~70% small, ~25% medium, ~5% large)
**Blended average ACV — Oxford Houses:** ~$588/year (standardized small tier for self-governed homes)

### 3c. TAM Calculation

```
Traditional sober living homes:    13,500 × $1,300/yr  = $17.6M
Oxford Houses:                      3,500 × $588/yr    =  $2.1M
─────────────────────────────────────────────────────────────────
Core TAM (operator subscriptions):                      = $19.7M

Future segment — treatment centers:
  ~6,000 facilities × $2,400/yr (clinical tier)         = $14.4M
─────────────────────────────────────────────────────────────────
Expanded TAM (with clinical):                           = $34.1M
```

**Core TAM used for this analysis: ~$20–25M ARR** (rounded up to account for multi-house operators paying per-location and new home formation at ~5% annual growth rate).

---

## Section 4: Top-Down Validation

The assisted living software market (closest comparable SaaS category) was valued at **$337.9M in 2024** in the US. Sober living homes represent a structural subset of the broader assisted/recovery housing market.

| Filter                               | Rationale                                     | Applied % |
| ------------------------------------ | --------------------------------------------- | --------- |
| Sober living vs. all assisted living | Sober living is ~5–7% of assisted living beds | 6%        |
| US-only (already filtered)           | —                                             | 100%      |

**Top-down TAM estimate:** $337.9M × 6% = **~$20M** ✅ Validates bottom-up within 2%.

---

## Section 5: SAM Calculation

Not all 17,000 homes are immediately reachable. Apply realistic filters:

| Filter                                | % Applied | Rationale                                                                                                     |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| Tech adoption readiness               | 60%       | Many small operators are smartphone-capable; excludes the lowest-tech, highest-churn operators                |
| Not locked into existing software     | 75%       | One Step losing market share; Sobriety Hub growing fast but still <20% penetration; most still on no software |
| English-speaking, US-based operations | 100%      | Already filtered                                                                                              |

```
SAM = $22M × 60% × 75% = ~$9.9M ARR
```

**SAM: ~$9–10M ARR**

---

## Section 6: SOM Projection

### Assumptions

- Pre-launch in 2026; initial growth via direct outreach, Oxford House chapters, NARR network, and word-of-mouth
- No paid marketing budget assumed in Year 1–2
- Realistic conversion from free directory listing (resident-side) → operator sign-up (two-sided flywheel)
- Competitive intensity: moderate (2 main incumbents, neither dominant)

| Year          | SOM % of SAM | ARR    | Est. Houses |
| ------------- | ------------ | ------ | ----------- |
| Year 1 (2027) | 0.5%         | ~$50K  | ~40         |
| Year 2 (2028) | 1.5%         | ~$150K | ~115        |
| Year 3 (2029) | 3.5%         | ~$350K | ~270        |
| Year 5 (2031) | 7%           | ~$700K | ~540        |

### Oxford House Enterprise Upside

Oxford House Inc. is a single nonprofit governing ~3,500 homes. A single enterprise partnership agreement with Oxford House headquarters would represent:

- 3,500 homes × $49/month = **$171K ARR instantly**
- This is a swing factor that could compress Year 3 targets into Year 1.

---

## Section 7: Market Growth

| Metric                          | Value      | Source                        |
| ------------------------------- | ---------- | ----------------------------- |
| US sober living market CAGR     | 5.2%       | Credence Research             |
| Global recovery housing CAGR    | 9.4–9.7%   | The Business Research Company |
| Americans with SUD (unmet need) | 48.4M / yr | SAMHSA NSDUH 2024             |
| % receiving no treatment        | ~80%       | SAMHSA 2024                   |

**Key growth drivers:**

1. Opioid epidemic creating sustained demand for recovery housing
2. Medicaid expansion and state-level recovery housing funding increasing operator capacity
3. NARR certification requirements pushing operators toward formal management systems
4. HUD Recovery Housing Program funding tied to outcome reporting (creates software need)
5. ~5% new home formation rate annually expanding the addressable market each year

---

## Section 8: Competitive Landscape & Validation

| Competitor           | Pricing Model                           | Est. Market Share | Notes                                                   |
| -------------------- | --------------------------------------- | ----------------- | ------------------------------------------------------- |
| Sobriety Hub         | $75/user/month (full) + $250 onboarding | Growing fast      | 5.0★ on Capterra; operators switching from One Step 3:1 |
| One Step Software    | Custom/enterprise                       | Declining         | Losing market share; higher cost perception             |
| Spreadsheets / paper | Free                                    | ~75–80% of market | Largest "competitor" is inertia                         |

**Regroup's differentiation:**

- **Per-house pricing** (vs. per-user): more predictable, operator-friendly
- **Resident-facing directory + application layer**: no incumbent has this; creates organic acquisition channel
- **Oxford House-specific tier**: purpose-built for the self-governed democratic model
- **Meeting attendance, recovery-specific features**: deeper than generic property management tools

**Competitive pricing sanity check:** Sobriety Hub charges ~$75/user × 2 average staff = $150/month = $1,800/year. Regroup's $89–149/month flat pricing is competitive on cost while being simpler and more predictable.

---

## Section 9: Investment Thesis

### Market Opportunity Assessment

The sober living operator software market is **real, growing, and underserved**. The TAM of ~$20–25M is not venture-scale on its own — but it's the beachhead, not the ceiling.

**The path to a larger market:**

```
Phase 1 (2026–2028): Sober living operators
  → $20–25M TAM

Phase 2 (2028–2030): Treatment center integration
  → +$14M TAM (21,000 SUD facilities, ~30% needing housing coordination)

Phase 3 (2030+): Insurance/outcome reporting, alumni networks
  → Marketplace + data layer on top of managed recovery housing
```

### Key Positives

- Fragmented, underserved niche with only 2 real competitors
- Market in active transition (One Step losing customers)
- Network effects available via resident directory (harder to replicate)
- Oxford House enterprise partnership = asymmetric upside
- Regulatory tailwinds (HUD, NARR, SAMHSA outcome reporting)

### Key Risks

- Operator price sensitivity (many homes run on thin margins)
- Sales cycle: small operators are slow to change tools
- Sobriety Hub has head start and strong reviews
- Oxford House is a non-profit with limited software budget

### Near-Term Milestones

1. **10 paying houses by Month 6** — proves willingness to pay
2. **Oxford House chapter pilot** — 5–10 houses in one state
3. **Resident directory traffic** — proves two-sided network is viable
4. **$50K ARR by Month 12** — validates pricing and retention

---

## Sources

- [PMC: Estimating the Number of Substance Use Disorder Recovery Homes in the US](https://pmc.ncbi.nlm.nih.gov/articles/PMC7901811/)
- [PMC: NSTARR Project — Recovery Residence Registry](https://pmc.ncbi.nlm.nih.gov/articles/PMC8714706/)
- [SAMHSA N-SUMHSS 2024 Annual Report](https://www.samhsa.gov/data/report/2024-n-sumhss-annual-report)
- [SAMHSA NSDUH 2024 National Report](https://www.samhsa.gov/data/sites/default/files/reports/rpt56287/2024-nsduh-annual-national-report.pdf)
- [Credence Research: US Sober Living Homes Market](https://www.credenceresearch.com/report/united-states-sober-living-homes-market)
- [The Business Research Company: Sober Living Homes Global Market 2025](https://www.thebusinessresearchcompany.com/report/sober-living-homes-global-market-report)
- [Sobriety Hub Pricing](https://www.sobrietyhub.com/pricing)
- [Sobriety Hub 2026 Buyer's Guide](https://www.sobrietyhub.com/our-blog/2026-buyers-guide-the-big-3-of-sober-living-software)
- [Oxford House count — 1011Now July 2025](https://www.1011now.com/2025/07/23/oxford-house-expansion-request-faces-pushback-neighbors-city-councilman/)
- [Future Market Insights: Assisted Living Software Market](https://www.futuremarketinsights.com/reports/assisted-living-software-market)
