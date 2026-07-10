# Homegroups Maestro E2E Suite

Maestro flows for the Homegroups mobile app (`appId: org.recoveryconnect`).

## Run a single flow

```bash
maestro test homegroups/mobile/maestro/flows/invite-code-join.yaml
```

## Run the whole suite

```bash
maestro test homegroups/mobile/maestro/flows/
```

## Test accounts

Flows use env-injected credentials (`${EMAIL}` / `${PASSWORD}`) via the shared
`subflows/login.yaml`. See `homegroups/mobile/e2e/.env.e2e.example` for the existing
Detox test-account convention — the same Firebase Auth users work here.

| Persona                                    | Used by                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `test-admin@homegroups-e2e.com`            | invite-code-join, qr-meeting-checkin, group-creation, conscience-vote-create-and-cast                |
| `test-unclaimed-member@homegroups-e2e.com` | group-admin-claim-and-pay (must be a MEMBER of an UNCLAIMED group — not yet seeded, see plan Task 3) |
| `test-treasurer@homegroups-e2e.com`        | treasurer-handoff-completion (must hold the Treasurer role — not yet seeded, see plan Task 8)        |

## Status

These flows have **not yet been run against a live simulator** — no Maestro CLI or MCP
server was available when they were authored. Selectors were derived from React Native
`testID` props read directly from source and cross-checked against the proven navigation
paths in the existing Detox suite (`homegroups/mobile/e2e/screens/`). Steps marked
`NEEDS LIVE VERIFICATION` in each flow file should be confirmed on a real device/simulator
before removing `continue-on-error: true` from the CI job.

## Relationship to Detox

Detox (`homegroups/mobile/e2e/`) is not being removed. Per `e2e-maestro/README.md`,
both frameworks coexist; migrate a Detox spec's coverage to Maestro only once the
equivalent Maestro flow is proven reliable in CI.
