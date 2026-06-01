# Code → Doc Audit Report

**Date:** 2026-05-31
**Project:** recovery-api
**Mode:** report-only
**Code files scanned:** 5 (routes/health.ts, routes/referrals.ts, routes/users.ts, middleware/auth.ts, lib/firebase.ts)
**Doc files cross-referenced:** 2 (CLAUDE.md, docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md)

---

## Summary

| Category                             | Count |
| ------------------------------------ | ----- |
| 🔴 Wrong descriptions                | 0     |
| 🟡 Stale (code removed/restructured) | 1     |
| 📄 Undocumented code                 | 3     |
| ✅ Accurate                          | 5     |

---

## Findings

### 🟡 Stale Documentation

**`toApp: "sober-living"` in referral schema**
Doc describes: `docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md:122` lists `"sober-living"` as a valid `toApp` value
Code truth: `TARGET_APPS` in `src/routes/referrals.ts:8` = `["treatment-center", "phoenix-cleanhouse", "homegroups"]` — `"sober-living"` is absent
Doc file: `docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md:122`
Code file: `src/routes/referrals.ts:8`
Recommendation: Either add `"sober-living"` to `TARGET_APPS` (if the spec intended it) or update the spec to reflect it was not implemented
Action taken: Flagged in artifact only (manual action required)

---

### 📄 Undocumented Code

**`POST /api/referrals` — body schema**
Code: Zod-validates `{ toApp: "treatment-center"|"phoenix-cleanhouse"|"homegroups" (required), clientName: string 1–100 (required), clientEmail: email (required), condition?: string max 200, notes?: string max 500 }`. Returns `201 { id, status: "pending" }`
Doc file: Route listed in `CLAUDE.md:36` and root CLAUDE.md — neither documents required body fields
Recommendation: Add request body schema to `recovery-api/CLAUDE.md` under a new `## API Reference` section
Action taken: Flagged, no changes made

**`PUT /api/users/me` — body schema**
Code: Accepts `{ displayName?: string 1–100, sobrietyDate?: ISO date string, homeApp?: "detox-recovery"|"sober-living"|"homegroups"|"treatment-center" }`. Merges into Firestore. Returns `{ uid, updated: true }` 200
Doc file: Route listed in CLAUDE.md — accepted fields not documented
Recommendation: Add body schema to `recovery-api/CLAUDE.md` API Reference section
Action taken: Flagged, no changes made

**`POST /api/referrals` — `fromApp` hardcoded to `"detox-recovery"`**
Code: `src/routes/referrals.ts:31` always writes `fromApp: "detox-recovery"` regardless of which app calls the endpoint
Doc file: No documentation mentions this value
Recommendation: Document this behaviour — or investigate whether it should be dynamic. recovery-api is designed as a cross-app integration layer, so hardcoding `detox-recovery` may be a bug when other products call this endpoint
Action taken: Flagged, no changes made

---

### ✅ Accurate (logged for completeness)

- `GET /health` — `CLAUDE.md:35` ("liveness probe") matches `health.ts:5` (`{ ok: true, ts }` 200, no auth required)
- `GET /api/referrals` — root CLAUDE.md ("filtered by referredBy == uid") matches `referrals.ts:36` (Firestore `.where("referredBy", "==", uid)`)
- `GET /api/referrals/:id` — root CLAUDE.md ("ownership enforced") matches `referrals.ts:52` (403 when `data.referredBy !== uid`)
- `GET /api/users/me` — root CLAUDE.md ("fetch authenticated user profile") matches `users.ts:13`
- Auth model — `CLAUDE.md` auth section accurately describes Firebase JWT + X-Service-Key dual paths in `middleware/auth.ts`

---

## Next Steps

1. **Possible bug** — `fromApp: "detox-recovery"` hardcoded in `POST /api/referrals`. Verify if intentional or an oversight from when detox-recovery was the only caller.
2. **Spec alignment** — Decide whether `"sober-living"` should be added to `TARGET_APPS` or removed from the spec.
3. **API docs** — Add `## API Reference` to `recovery-api/CLAUDE.md` covering `POST /api/referrals` and `PUT /api/users/me` body schemas.
