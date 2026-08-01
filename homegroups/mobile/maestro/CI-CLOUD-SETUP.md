# Homegroups Maestro — Cloud (CI) run setup

What it takes to get the full E2E suite actually **passing** on Maestro Cloud, not just running. The flows are corrected against current source (2026-07-17 audit); the remaining gates are **test infrastructure**, most of which is human/ops provisioning.

## 0. The decisive decision: which backend do the cloud runs hit?

The Android **debug** APK is wired to the **production** Firebase project `recovery-connect-cad4b` (single `android/app/google-services.json`, no debug variant). The flows **write** data — create groups, cast votes, claim groups, join, check in. Two options:

- **(Recommended) Dedicated test Firebase project.** Add a debug-variant `google-services.json` pointing at a `homegroups-e2e` project. E2E writes stay out of prod, and the committed test password (below) is harmless. Requires creating the project + wiring the debug variant.
- **Prod backend with disposable test accounts.** No new project, but: E2E writes land in prod (needs cleanup), and the test-account password **must not** be committed — move it to a GitHub secret and inject via CI (see §3).

**Nothing downstream is safe to run at full-suite scale until this is chosen** — a write-heavy suite against prod pollutes production data.

## 1. Personas to seed (with exact state)

| Persona email                              | Password           | Required state                                                                                                                                                               | Flows                                                                 |
| ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `test-admin@homegroups-e2e.com`            | `TestPassword123!` | Admin of ≥1 group; that group has ≥1 meeting on its schedule (for QR)                                                                                                        | conscience-vote, group-creation, invite-code-join, qr-meeting-checkin |
| `test-unclaimed-member@homegroups-e2e.com` | `TestPassword123!` | A **member** (not admin) of an **unclaimed** group — so `shouldShowClaimGroupButton = isGroupUnclaimed() && !isCurrentUserAdmin()` is true                                   | group-admin-claim-and-pay                                             |
| `test-treasurer@homegroups-e2e.com`        | `TestPassword123!` | Holds the **Treasurer** role on a group that is **subscribed** (an unsubscribed group redirects to SubscriptionUpgrade) and where the user is admin enough to reach Treasury | treasurer-handoff-completion                                          |

Plus, not tied to a persona:

- **A live, unused 6-character invite code** for a group the admin persona can join (invite-code-join).
- **A unique signup email per run** for registration-signup (currently hardcoded `e2e-signup-000@...` — will collide on the 2nd run; inject a timestamped email via CI env, e.g. `e2e-signup-$RUN_ID@homegroups-e2e.com`).

## 2. `MAESTRO_CLOUD_API_KEY`

Referenced by the CI job already. **Confirm it's set** in the repo's GitHub Actions secrets (your mobile.dev / Maestro Cloud account key). Without it the cloud step can't upload.

## 3. Credential hygiene

The password `TestPassword123!` is committed in the flow files. That's acceptable **only** for a throwaway test project (option A). If you go with prod (option B), I'll refactor the flows to read `PASSWORD` from a `${E2E_PASSWORD}` env var and have CI inject it from a secret so no valid prod credential lives in git.

## 4. Live-run risks to watch on the first cloud run (from the audit)

1. **Regex `id` matching** — 5 flows now select rows via `group-card-.*` / `meeting-item-.*`. If cloud Maestro's `id` matcher doesn't treat these as regex, all five fail together. First thing to confirm.
2. **Native alert buttons** ("OK", "Sign Out", "View Group", "Initiate Handoff") — depend on Maestro reaching the OS alert layer; currently `optional: true`-guarded.
3. **Google Places address** in group-creation step 2 has no testID and needs live network — the flow honestly stops at that boundary; steps 3–4 aren't reachable without a testID upstream or a Places proxy.
4. **`accessibilityLabel` text** — QR flow taps `text: "Show QR code"` which exists only as an accessibilityLabel.

## 5. CI wiring (done once §0 is decided)

Expand `homegroups-maestro-smoke` in `.github/workflows/ci.yml` from the single `flow-file` to `workspace: homegroups/mobile/maestro`, inject the persona emails / password / per-run signup email via the action's `env:` (from secrets under option B), keep `continue-on-error: true` until a run is green, then promote to a blocking gate. `config.yaml` is already set to `continueOnFailure: true` so the first run reports every flow at once.
