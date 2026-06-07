# Recovery Platform

A flat monorepo consolidating four recovery-focused products and one shared API service. Each product operates independently today; recovery-api is the intended cross-app integration layer for the future.

## Platform Overview

The recovery platform serves individuals and organizations in the addiction recovery ecosystem — from people seeking detox guidance, to sober living house operators, to 12-step group administrators. Products share a common referral concept via the shared API but otherwise maintain separate Firebase projects, auth systems, and data stores.

## Products

| Directory         | Marketed Name             | Stack                                                         | Firebase Project         | Target User                                 |
| ----------------- | ------------------------- | ------------------------------------------------------------- | ------------------------ | ------------------------------------------- |
| `recovery-api/`   | (internal service)        | Firebase Functions v2 (TypeScript)                            | `recovery-platform`      | Cross-app API layer                         |
| `homegroups/`     | Homegroups                | React Native (TypeScript) + Firebase + Redux Toolkit + Stripe | `recovery-connect-cad4b` | 12-step group admins and members            |
| `regroup/`        | Regroup (Tentative Title) | React Native 0.72 + Firebase Cloud Functions + Angular web    | `phoenix-cleanhouse`     | Sober living house operators and residents  |
| `detox-recovery/` | NextStep Recovery         | Next.js 15                                                    | `nextstep-recovery`      | Individuals/families seeking detox guidance |
| `shared/`         | (reserved)                | TypeScript                                                    | n/a                      | Future shared types/utilities               |

## Directory Map

Each product has its own CLAUDE.md with product-specific context:

- [homegroups/CLAUDE.md](homegroups/CLAUDE.md)
- [regroup/CLAUDE.md](regroup/CLAUDE.md)
- [detox-recovery/CLAUDE.md](detox-recovery/CLAUDE.md)
- [recovery-api/CLAUDE.md](recovery-api/CLAUDE.md)

`homegroups/` and `regroup/` share the same three-subproject layout, each with its own CLAUDE.md:

- `web/` — the website / web app (homegroups: React; regroup: Angular)
- `mobile/` — the React Native mobile app (iOS + Android)
- `functions/` — the Firebase Cloud Functions backend

## Integration Map

**Current state:** All four products are independent. Each has its own Firebase project, its own Auth instance, and its own Firestore database. There is no cross-product data access.

**recovery-api callable functions (Phase 1 — service-key auth):**

- `createReferral` — create a cross-app referral
- `getReferrals` — list referrals submitted by the calling service on behalf of a user
- `getReferral` — fetch a single referral by ID (ownership enforced)
- `getUserProfile` — fetch a user profile by UID
- `updateUserProfile` — update a user profile

**Auth model (Phase 1):** `X-Service-Key` header + `X-App-Id` + `X-User-Uid` for service-to-service requests. Phase 2 will add Firebase custom token auth (`request.auth` with `appId` claim). See `recovery-api/CLAUDE.md` for full auth details.

**Intended future state:** recovery-api becomes the integration bus. Products that need to refer users to other products (e.g., homegroups referring a member to a sober living house) do so via `POST /api/referrals` rather than direct Firestore cross-queries. Cross-app user identity reconciliation will route through recovery-api.

## Shared Domain Vocabulary

These terms appear across multiple products with different meanings. Use the product-prefixed form when context is ambiguous.

| Term          | homegroups meaning                                                                                                                                               | regroup meaning                                                    | Notes                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **meeting**   | A 12-step AA/NA meeting                                                                                                                                          | A house staff or resident meeting                                  | Use `homegroups:meeting` or `regroup:meeting` in cross-product contexts |
| **group**     | A homegroup — an autonomous 12-step unit                                                                                                                         | Not a primary concept                                              |                                                                         |
| **member**    | A member of a homegroup                                                                                                                                          | A resident/guest in a sober living house                           |                                                                         |
| **house**     | Not used                                                                                                                                                         | A sober living house (primary entity)                              |                                                                         |
| **guest**     | Not used                                                                                                                                                         | A resident in a sober living house; Firestore collection: `guests` | Synonym: resident                                                       |
| **resident**  | Not used                                                                                                                                                         | Synonym for guest in regroup                                       |                                                                         |
| **homegroup** | homegroups product only: a self-governing 12-step group                                                                                                          | Not used                                                           |                                                                         |
| **referral**  | Cross-product: a user referred from one app to another via `recovery-api /api/referrals`. `toApp` values: `treatment-center`, `phoenix-cleanhouse`, `homegroups` | Same                                                               | Managed exclusively through recovery-api                                |

## Cross-Cutting Rules

These rules apply to all products in the monorepo without exception.

**Privacy**

- Never log PII (names, contact info, health data, recovery status) to Cloud Functions logs, server logs, or client console in any product.
- Error messages surfaced to API consumers must be sanitized — never propagate raw internal error details.

**Error logging**

- Log full error objects server-side for debugging.
- Log sanitized, user-safe messages client-side and in API responses.

**Secrets**

- No `.env` files or secret values committed to source control.
- All products use environment variables or Firebase Secret Manager exclusively.

**Firebase emulator port conventions**

- Firestore: `8080`
- Functions: `5001`
- Auth: `9099`
- Do not run two products' emulators simultaneously — port conflicts will occur.

**Data isolation**

- Each product has its own Firebase project and independent Firestore.
- Never cross-query Firestore across products.
- Cross-product data flows must go through recovery-api.

## Gotchas

- Ignore minified bundles and build artifacts (`**/public/`, `*.min.js`, `*-es5.js`, `*-es2015.js`, `lib/`, `dist/`, `build/`, `.next/`) when counting, searching, or reading source — they are regenerated on rebuild. `regroup/web/public/` alone holds ~1.15M lines of vendor bundles; real hand-written source platform-wide is ~380K lines.
