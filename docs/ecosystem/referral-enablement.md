# Enabling detox → recovery-api Cross-App Referrals (End-to-End)

**Status:** ⏸️ Code wired on both sides; intentionally inactive in production (env vars commented out pending the partner agreement). Not yet verified end-to-end — needs deploy + secret parity.
**Scope:** detox-recovery's contact form firing a cross-app referral into `recovery-api` — the platform's first real consumer of the integration bus.
**Last reconciled against code:** 2026-06-07.

> The contract mismatches below are now **resolved in code**. Enabling the feature requires only: deploy recovery-api, set `RECOVERY_API_URL` to the `createReferral` callable URL, ensure secret parity, and uncomment the env block in `apphosting.yaml`. Do not activate without explicit instruction (partner agreement).

---

## Canonical naming model (decided)

Referrals flow through **three** namespaces. The frontend speaks **display names**; recovery-api translates to the canonical **app-id** at the boundary; **project ids** are an internal detail of that translation.

| Display name (wire value) | Firebase project id                                           | Canonical app-id (stored)                                      |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `Homegroups`              | `recovery-connect-cad4b`                                      | `homegroups`                                                   |
| `Regroup`                 | `phoenix-cleanhouse`                                          | `phoenix-cleanhouse` (legacy alias `sober-living` resolves in) |
| `Next Step Recovery`      | `nextsteprecovery-1d5c2`                                      | `nextstep-recovery`                                            |
| `treatment-center`        | `recovery-connect-cad4b` (homegroups intergroup, provisional) | `treatment-center` (target-only; no credentials of its own)    |

**Translation lives in `recovery-api/src/config/apps.ts`** — a registry of `{ appId, displayName, projectId, aliases?, canOriginate, canReceive }` plus `resolveApp` / `resolveAppId` / `isOriginatorAppId` / `isTargetAppId` helpers. The frontend sends `toApp: <display name>`; recovery-api resolves display/alias → app-id, validates it's a target, and stores the **app-id** form. Rule: **`toApp`/`fromApp`/`referredByApp`/`{appId}:{uid}` doc keys are always the app-id form — never the display name or project id.**

> The "validate the Firebase app exists" check should validate against this **static registry**, not a live Firebase Admin call. recovery-api runs only in the `recovery-platform` project and has no credentials to introspect the other projects' apps.

---

## Contract reconciliation (resolved in code)

All five mismatches are now fixed on both sides. The feature stays inert only because `apphosting.yaml` keeps the env vars commented out.

| #   | Was                                | Now                                                                                                  | Where                              |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | `POST ${url}/api/referrals` (REST) | POST the `createReferral` callable URL directly                                                      | detox `route.ts` `fireReferral`    |
| 2   | bare body                          | body wrapped as `{ data: { … } }`                                                                    | detox `route.ts` `fireReferral`    |
| 3   | only `X-Service-Key`               | adds `X-App-Id: nextstep-recovery` + `X-User-Uid: detox-anon`                                        | detox `route.ts` `fireReferral`    |
| 4   | display name vs. raw Zod enum      | `toApp` is `z.string()`, resolved via `apps.ts` (`resolveAppId` + `isTargetAppId`), stored as app-id | `referrals.ts` + `config/apps.ts`  |
| 5   | anonymous submitter                | fixed system uid `detox-anon` sent as `X-User-Uid`                                                   | detox `route.ts` (OPEN-4 resolved) |

---

## Decisions (resolved 2026-06-07)

- **OPEN-1 — Regroup's canonical app-id → `phoenix-cleanhouse`.** `sober-living` is now a legacy alias the registry resolves in. Entities (`User.ts`, `Referral.ts`) and `auth.ts` normalized to the canonical id.
- **OPEN-2 — detox app-id → `nextstep-recovery`.** Registered as an originator in `apps.ts` and accepted by `auth.ts`. `Next Step Recovery` is also a valid target (it's its own receive entry).
- **OPEN-3 — `treatment-center` kept as its own app-id.** Target-only (`canReceive: true`, `canOriginate: false`), provisionally backed by the homegroups project until a dedicated treatment-center platform exists.
- **OPEN-4 — Anonymous referrer uid → fixed `detox-anon`.** detox sends `X-User-Uid: detox-anon`. Acceptable because detox never reads referrals back via `getReferrals`.

---

## Remaining work (to actually enable — requires deploy + business sign-off)

### recovery-api (project `recovery-platform`) — code complete

- ✅ `src/config/apps.ts` registry + resolvers; `createReferral` resolves/validates `toApp`; `auth.ts` accepts `nextstep-recovery` and normalizes aliases; entities updated. Tests green (`apps.test.ts`, updated `auth.test.ts`).
- ⬜ **Secret parity** — ensure `RECOVERY_PLATFORM_API_KEY` byte-matches detox's `recovery-api-key`. Verify: `firebase functions:secrets:access RECOVERY_PLATFORM_API_KEY`.
- ⬜ **Deploy** and capture the `createReferral` callable URL.

### detox (project `nextsteprecovery-1d5c2`) — code complete

- ✅ `fireReferral` rewritten to the callable contract (body `{ data: … }`, headers `X-App-Id`/`X-User-Uid`, posts the callable URL); keeps `Promise.allSettled` + `AbortSignal.timeout(5000)` (no `void`). `ReferralApp` display names match the registry. `apphosting.yaml` `RECOVERY_API_KEY` de-duplicated (single declaration, in the commented enable-block).
- ⬜ **Contact-form UI** — add `"Withdrawal Coaching Support"` as a selectable interest option (it's in `KNOWN_INTERESTS` + `INTEREST_TO_APP` but the form must offer it to ever fire).
- ⬜ **Enable** — uncomment the `RECOVERY_API_URL` + `RECOVERY_API_KEY` block in `apphosting.yaml`, set the URL to the deployed callable, redeploy. **Do not do this without explicit instruction.**
- ⬜ **Update docs** — `docs/technical/{architecture,api,development}.md` referral sections to the callable transport.

### partner / business

- ⬜ Confirm the **partner agreement** (firing is deferred pending it — `detox-recovery/CLAUDE.md` "Disabled integrations").

---

## Verification (end-to-end, once enabled)

1. Submit the contact form with interest `"Sober Living / Housing"` (→ `Regroup`) or `"12-Step / Homegroup Support"` (→ `Homegroups`).
2. Confirm a `referrals` doc in the `recovery-platform` Firestore: `{ toApp: <resolved app-id>, fromApp: <detox app-id>, referredBy: <synthetic uid>, status: "pending", createdAt }`.
3. Confirm the contact email still delivered (referral failure must never block the user response).
4. Negative: with `RECOVERY_API_URL` unset, the form works and `fireReferral` no-ops (`if (!url || !key) return;`).

## Rollback

Re-comment `RECOVERY_API_URL` in `apphosting.yaml` and redeploy detox — `fireReferral` no-ops, contact form unaffected. recovery-api changes are inert without a caller.

---

## ▶ Resume next session

**Done this session (2026-06-07, code wiring):**

- Settled OPEN-1/2/3/4 (see Decisions above).
- Built `recovery-api/src/config/apps.ts` (registry + `resolveApp`/`resolveAppId`/`isOriginatorAppId`/`isTargetAppId`) with tests.
- Wired the resolver into `createReferral` (`toApp` now `z.string()` → resolved/validated → stored as canonical app-id) and `auth.ts` (accepts `nextstep-recovery`, normalizes the `sober-living` alias → `phoenix-cleanhouse`).
- Normalized entities (`Referral.ts`, `User.ts`) to canonical app-ids.
- Rewrote detox `fireReferral` to the callable contract (still inert — env vars commented).
- De-duplicated `RECOVERY_API_KEY` in `apphosting.yaml` (single declaration in the commented enable-block).
- recovery-api: typecheck clean, 25/25 tests. detox: typecheck clean, 18/18 API tests.

**Start here next time (to enable — needs explicit go-ahead + partner agreement):**

1. Add the `"Withdrawal Coaching Support"` interest option to the contact-form UI.
2. Verify secret parity (`RECOVERY_PLATFORM_API_KEY` ↔ detox `recovery-api-key`).
3. Deploy recovery-api; capture the `createReferral` callable URL.
4. Uncomment + set the `apphosting.yaml` env block to that URL; redeploy detox.
5. Run the E2E verification below; update `docs/technical/{architecture,api,development}.md` to the callable transport.

---

## Source references

- detox client: `detox-recovery/app/api/contact/route.ts` (`fireReferral`, `INTEREST_TO_APP`, `ReferralApp`, `KNOWN_INTERESTS`)
- recovery-api callable: `recovery-api/src/callable/referrals.ts` (`CreateReferralSchema`, `handleCreateReferral`, `createReferral`)
- recovery-api auth: `recovery-api/src/middleware/auth.ts` (`requireServiceAuth`, `VALID_APP_IDS`, `ServiceAuthContext`)
- secret: `recovery-api/src/config.ts` (`RECOVERY_PLATFORM_API_KEY`)
- registry (to create): `recovery-api/src/config/apps.ts`
- deferral note: `detox-recovery/CLAUDE.md` "Disabled integrations"
