# Maestro E2E Tests

Standalone CLI tests against compiled iOS simulator / Android emulator binaries.
No app-side changes required — Maestro operates against the installed app externally.

## Prerequisites

```bash
# Install Maestro CLI (already installed if maestro --version works)
brew install maestro

# iOS Simulator or Android Emulator must be running with the target app installed
```

## Run tests

```bash
# All homegroups flows
maestro test e2e-maestro/homegroups/

# All regroup/RATS flows
maestro test e2e-maestro/regroup/

# Single flow
maestro test e2e-maestro/homegroups/login-and-join-group.yaml
maestro test e2e-maestro/regroup/login-and-view-dashboard.yaml
```

## Flows

### homegroups (RecoveryConnect — `org.recoveryconnect`)

| File                        | Flow                                          | Status   |
| --------------------------- | --------------------------------------------- | -------- |
| `login-and-join-group.yaml` | User logs in and requests to join a homegroup | scaffold |

### regroup / RATS (`com.rats.dev`)

| File                            | Flow                                       | Status   |
| ------------------------------- | ------------------------------------------ | -------- |
| `login-and-view-dashboard.yaml` | Operator logs in and views house dashboard | scaffold |

## Adjusting selectors

Flow YAML files contain placeholder selectors (`id: "email-input"`, `assertVisible: "Sign In"`).
To calibrate them against the real UI:

```bash
# Interactive element inspector — highlights elements as you tap
maestro studio
```

Or use `maestro record` to generate a flow by interacting with the running app.

## Coexistence with Detox

Both apps have legacy Detox config (`npm run test:e2e:ios`). Maestro runs independently —
no removal of Detox needed. Migrate critical flows to Maestro incrementally as Detox
blockers make those flows unreliable (see `regroup/mobile/docs/e2e/E2E_TESTING_BLOCKERS.md`).

## CI

To run in CI, add to your pipeline after building and launching the simulator:

```bash
maestro test e2e-maestro/ --format junit --output maestro-results.xml
```
