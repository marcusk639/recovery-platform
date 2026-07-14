# Regroup — Next Steps — 2026-07-07

**Purpose:** What's left to do on `regroup` after today's 21-commit review-and-fix pass, prioritized into actionable work items. Sourced from `docs/reviews/regroup-fresh-audit-2026-07-06.md` (the last full independent audit — 22 findings, dated the day before today's fixes), re-verified against the current codebase state below, plus decisions and gaps surfaced during today's session that were explicitly deferred rather than fixed.

**Status of the source audit:** the 2026-07-06 audit said "nothing fixed yet." Today's session fixed **Critical #1–#4 and High #5** (verified below). The remaining items were never in scope for today's pass and are still open as written, re-confirmed against the current file state where noted.

---

## Already resolved today (reference only — no action needed)

| #           | Finding                                                     | Commit                                                                                                   |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Critical #1 | 3 guest modals crash on Formik `<Field>` outside a provider | `4f6620f`                                                                                                |
| Critical #2 | Anonymous Oxford votes had no duplicate-vote protection     | `81a848d` (server-enforced `castOxfordVote` callable)                                                    |
| Critical #3 | AdminManagement's "Send Invitation" always failed           | `82e8952`                                                                                                |
| Critical #4 | HousesOverview house-switching was a no-op                  | `82e8952`                                                                                                |
| High #5     | Firestore rules let any guest tamper with vote tallies      | `81a848d` (`votes/{voteId}` update denied entirely; verified against live emulator, 212/212 rules tests) |

Also fixed today but **not** in the 2026-07-06 audit (found independently): rent-payment fake-success charge, 100x cents/dollars bug, payment webhook race condition, missing payment idempotency guard, non-atomic manual payments, `ManagerSettings` modal-dismiss inconsistency (partial — see Action Item 5 below), `DirectChat` missing `.unwrap()`, `CreateGuestForm` hardcoded houseId, `GuestInvites` crash, dead search bars in Beds/Contacts, ~28 dead files removed, `rats-checkbox`/`rats-image` fixes, and 12 follow-up tech-debt items (setup-wizard state reset, double-hook cleanup, test coverage gaps). Full detail in `git log` on `main`.

---

## Action Items — Priority 1 (High: real security/data-integrity gaps, silent failures)

### 1. Server-enforce Oxford vote-tally integrity beyond dedup (audit #5, partial)

**Summary:** Today's fix denies _all_ direct client writes to `votes/{voteId}` and moved casting to a `castOxfordVote` callable — this closes the anonymous-vote-inflation path. Not yet touched: `services/oxford/index.ts`'s `updateVote(id, updates: Partial<Vote>)` and the equivalent gap on `houses/{houseId}/business-meetings/{meetingId}` update rules. `updateVote` has zero call sites (dead code) — the risk was always the _rule_, not this function, and the rule is now closed for votes specifically. Business-meetings still has the same missing-field-scoping shape.

**Action:** Delete the now-fully-dead `updateVote` function (confirm zero callers first). Apply the same "deny direct client update, route through a callable" treatment to `business-meetings` if meeting-minutes tampering is judged worth the same rigor as vote tampering (lower stakes — not a governance mechanism — so this could reasonably be deprioritized to Priority 2).

**Effort:** Small (dead code delete) + Medium (business-meetings callable, if pursued).

---

### 2. Discharging a resident never revokes Firebase custom claims (audit #8)

**Summary:** `dischargeGuest()` (`regroup/mobile/src/services/guest.tsx:297`) only calls `.update()` on the guest doc — confirmed still true as of today. The only claims-revocation trigger (`onGuestWrite`) fires on _delete_, not _update_. Firestore rules gate house access purely on custom claims, not a live guest-doc status check. **A discharged resident keeps full house-level read/write access indefinitely.** Contrast: `deleteGuest` (used by "Remove from home") does delete the doc and correctly triggers revocation — this gap is specific to the discharge flow only.

**Action:** Have `dischargeGuest` call `removePrivilegesForGuests` with `role: "guest"` (the backend already supports this role value — confirm no client currently calls it that way, per the audit). Also filter discharged guests out of `GuestList`'s active-resident query, since nothing currently does.

**Effort:** Small–Medium. Single function change plus one query filter.

---

### 3. DirectChat has no real-time listener (audit #9)

**Summary:** Confirmed still true — `DirectChat.tsx` has zero references to `subscribeToDirectChat` anywhere. It fetches once on mount; real-time delivery today is an accidental side effect of `ContactScreen.tsx` staying mounted underneath it and subscribing to every conversation. `chat/:userId` is a registered deep link — opening a DM via push notification or deep link mounts `DirectChat` with nothing else in the stack, so the conversation is frozen at whatever loaded on open.

**Action:** Give `DirectChat.tsx` its own `subscribeToDirectChat` subscription, mirroring `HouseChat.tsx`'s existing `subscribeToHouseChat` pattern (already proven correct, same file family already touched today for the `.unwrap()` fix).

**Effort:** Small–Medium. Pattern already exists in the codebase to copy from.

---

### 4. Assigning a new Oxford officer never deactivates the incumbent (audit #6)

**Summary:** Confirmed still true — `services/oxford/officers.ts`'s `setOfficer()` (correct: batches deactivate-then-create) has **zero callers anywhere** in the codebase. The live path (`OfficerManagement.tsx` → `useCreateOfficer` → `services/oxford/index.ts`'s `createOfficer`) just creates a new doc with `isActive: true`, never touching the existing active officer for that role. Two people can simultaneously hold `isActive: true` for the same office.

**Action:** Either delete `officers.ts` (dead) and port its deactivation logic into `index.ts`'s `createOfficer`, or repoint `useCreateOfficer` at `setOfficer` directly. The correct implementation already exists — this is a wiring fix, not new logic.

**Effort:** Small. Confirmed dead-parallel-implementation shape (same class of bug already fixed elsewhere today).

---

### 5. Officer names entered during onboarding are never displayed (audit #7)

**Summary:** Confirmed still true — `OxfordDashboard.tsx`'s `getGuestName(userId)` (and the equivalent in `OfficerManagement.tsx`) key exclusively off `officer.userId`, falling through to the literal string `"Unknown"` when absent. `oxfordOnboardingMutations.ts` writes onboarding officers with `{ role, name, ... }` and **no** `userId` — the name is captured and stored, then never shown.

**Action:** `getGuestName` at both call sites should fall back to `officer.name` when `userId` is absent.

**Effort:** Small. Two-site, well-scoped change.

---

### 6. ManagerSettings' admin-removal Redux cache never dispatches (audit #11, adjacent to today's fix)

**Summary:** Today's session fixed the _modal-dismiss inconsistency_ in this same function (real-admin removal no longer force-closes the whole screen) and added the missing `dispatch(updateHouseData(_house))` call. **Not fixed:** confirmed today — the function still clones `allAdmins` into `_admins`, splices the removed admin's `houseIds` on that clone, and **never dispatches it** (`grep` for `setAdmins` in this file returns zero matches). The removed admin keeps showing in the list until a full remount.

**Action:** Add `dispatch(setAdmins(_admins))` after the backend call succeeds — the action already exists (used by the sibling guest-admin branch a few lines above, which does this correctly).

**Effort:** Small — one line, in a file already touched today, same function already understood from this session's fix.

---

## Action Items — Priority 2 (Medium: real bugs, lower urgency)

These were not independently re-verified in this pass (time-boxed) — treat as open per the 2026-07-06 audit unless contradicted by direct inspection.

| #   | Finding                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 10  | Resubmitting a rejected Treasury report reassigns it to the current week instead of preserving the original period                                                                                                                                                                                                 | Track original `period` in state on load; submit that instead of `getCurrentWeekPeriod()` when editing an existing record |
| 12  | `HouseSummary.tsx` gates house-edit UI to `superAdmin` only, but Firestore rules allow any plain `admin` to write the same financial/ownership fields server-side                                                                                                                                                  | Reconcile the two layers — tighten the rule or relax the UI gate, whichever is actually intended                          |
| 13  | `sendInviteEmails` callable has no house-scoping — any admin can send arbitrary invite-flavored emails via SendGrid (spam/phishing vector, not privilege escalation). Zero production callers; already flagged DELETE in the 2026-07-04 dead-code audit                                                            | Delete the callable                                                                                                       |
| 14  | PII (guest names) logged via `console.log` in `migrateGuestWeeks.ts` (local/CI-only script, not deployed)                                                                                                                                                                                                          | Log guest doc IDs instead of names                                                                                        |
| 15  | EES per-resident amount preview (`EESTracker.tsx`) divides by bed capacity; actual billing (`handleCreateRecords`) divides by current resident count — mismatch whenever occupancy < capacity                                                                                                                      | Use the same divisor in both places                                                                                       |
| 16  | Guest list health icon always shows worst status — `GuestList.tsx` calls `getOverallPercentage` with the old 3-arg signature (now stale after today's functions-side signature change removed the unused date param — **worth rechecking this specific call site against the new 2-arg signature as a quick win**) | Update call site; verify against today's `getOverallPercentage(guest, house)` signature                                   |
| 17  | `EditUserInfoForm.tsx` silently drops errors on profile-update failure (missing `.unwrap()`, no try/catch)                                                                                                                                                                                                         | Same `.unwrap()` pattern already fixed elsewhere today — mechanical fix                                                   |
| 18  | Balance Aging view rounds to whole dollars while the balance shown above it uses cents — inconsistent within the same screen                                                                                                                                                                                       | Match precision                                                                                                           |
| 19  | FCM permission request result is never checked/handled (`Splash.tsx`)                                                                                                                                                                                                                                              | Add try/catch + handle denial, matching `rentReminder.ts`'s correct pattern                                               |
| 20  | `StripeSettingsScreen` doesn't refresh after the Stripe Connect onboarding redirect (no `useFocusEffect`)                                                                                                                                                                                                          | Add `useFocusEffect`, matching sibling screens                                                                            |
| 21  | Recording a manual payment doesn't invalidate the query backing "Overdue Residents"                                                                                                                                                                                                                                | Add `guestKeys.list(houseId)` to the invalidation list in `handleRecord`                                                  |
| 22  | "Any" gender filter on house search returns zero results (maps to literal `'any'` instead of the no-filter sentinel)                                                                                                                                                                                               | Map to empty-string sentinel                                                                                              |

**Note on #16:** today's `house.ts` cleanup (functions-side) changed `getOverallPercentage`'s signature from `(guest, house, date)` to `(guest, house)` — that was the **Cloud Functions** version. The mobile-side bug in `GuestList.tsx` may reference a _different_, mobile-local `getOverallPercentage` — verify which one before assuming today's functions fix touched this.

---

## Action Items — Priority 3 (Low / cleanup, schedule as routine hygiene)

Not re-verified — full list preserved from the 2026-07-06 audit for reference:

- `HouseConfigFormView`'s "Rent" field writes to a nonexistent `house.rent` property (screen already unreachable — landmine if reconnected)
- `HouseSearchScreen` silently returns zero results with no location set
- House search results hardcode "12 Step" as the displayed type regardless of actual data
- Chore rotation auto-advance uses device-local time instead of house timezone
- "Rotation Order" in `HouseChoreInfo` is disconnected from the real rotation feature (alphabetizes instead)
- `deleteClaim` silently resets `potentialSuperAdmin` to `false` on every caller omitting its 4th argument
- `sendDirectMessage.fulfilled` reducer skips a dedup check its sibling reducer has
- Two competing, unused FCM token-registration code paths (cleanup candidate, not a bug)
- `ProfileUpdate.tsx` is dead code, zero non-test importers
- `GuestUpdateFormView.tsx` renders cents fields as unlabeled plain numbers (100x-error risk if this unreachable screen is ever reconnected)
- `PhaseCustomization.tsx`'s `renderButtons` callback is defined but never called (dead code in a live file)
- `ChoreRotationSetupScreen`'s resident list never populates for a house with no rotation (unreachable screen)
- `HouseConfigForm`'s commented-out validation + rekey-by-name can silently collide (unreachable screen)
- `updateHouseAdmins`'s `arrayRemove()` call has zero arguments (no-op, no current UI caller)
- Correction on file record: `util/admin.ts` was wrongly flagged dead in the 2026-07-04 audit — it has 4 real production imports. **Keep**, don't archive.

---

## Decisions Needed From You (carried over from today, not yet actioned)

### A. Demo account Firestore scoping

`demo_user@appdemo.net`'s credentials are hardcoded client-side and — as of today's `InitialLandingForm` fix — reachable via a real, working UI path in production builds. Its `isDemo()`/`isDemoHouse` restrictions are **client-side only**; `firestore.rules` has zero enforcement tied to this account. Need a decision: which house(s) should this account be scoped to server-side, and should the credential be rotated? No enforcement work has been done pending this decision.

### B. `withHouseSetupWizard` HOC/hook duality

The setup wizard has two parallel state-reading mechanisms: the legacy `withHouseSetupWizard` HOC (still used by `PhaseConfig`/`PhaseConfigSetup`) and the newer `useHouseSetupWizard` hook (used everywhere else). Not currently broken (verified — the double-injection is a working coincidence, not a bug), but flagged by the architect reviewer as tech debt that will make the _next_ wizard screen harder to add correctly. Deferred as its own dedicated refactor pass, per your explicit choice today.

### C. Confirm the "homegroups wave1 P0" commits at the top of `git log`

A separate body of work — `fix(homegroups-functions): stop logging PII`, a merge commit `Merge branch 'worktree-homegroups-wave1-p0-fixes'`, new CI jobs — landed on `main` during this session but **was not done by this session's work**. Worth confirming this is expected/already-reviewed before treating it as trusted, especially since it touches PII logging and Firestore indexes on the homegroups product.

### D. Uncommitted `docs/*.md` files

Several documentation files remain modified/untracked in the working tree, deliberately left alone all session (never reviewed, span unrelated products): `docs/reviews/dead-code-audit-2026-07-04.md`, `regroup-launch-blockers-2026-07-04.md`, `regroup-manual-qa-plan-2026-07-04.md`, `regroup-usability-audit-2026-07-05.md`, plus homegroups/detox-recovery docs. Decide whether these should be committed, reviewed first, or discarded.

---

## Suggested Sequencing

1. **Priority 1, items 1–6** — small-to-medium, well-scoped, each independently shippable. Items 4–6 (officer deactivation, officer names, ManagerSettings dispatch) are all "wire up an already-correct implementation" or "add one dispatch call" — the fastest wins in this list. Item 2 (discharge claims) is the most safety-relevant of the remaining Priority 1 items — a discharged resident retaining house access is the kind of gap worth prioritizing.
2. **Decisions A–D** — none of these block Priority 1/2 code work, but A (demo account) is the only one with live security exposure; worth a quick decision even if the fix is deferred.
3. **Priority 2** — batch as routine cleanup; several are the exact same `.unwrap()`/query-invalidation bug shape already fixed multiple times today, so a single focused session could clear most of them mechanically.
4. **Priority 3** — schedule opportunistically; none are live-user-facing except the two unreachable-screen landmines, which only matter if those screens are ever reconnected.
