# Maestro E2E Testing Guide — Regroup

**Status:** Under evaluation as a replacement / complement to Detox  
**Last updated:** 2026-06-01

Maestro is a mobile UI testing framework that operates via the accessibility layer — no app instrumentation, no code changes required. Tests are YAML files that run on iOS Simulators and Android Emulators. It integrates directly with Claude Code via MCP, enabling an AI-driven loop: read the codebase → generate test flows → execute → report → suggest fixes.

---

## Table of Contents

1. [Why Evaluate Maestro](#1-why-evaluate-maestro)
2. [Installation](#2-installation)
3. [Claude Code MCP Integration](#3-claude-code-mcp-integration)
4. [Autonomous Pipeline — mobile-e2e-skill](#4-autonomous-pipeline--mobile-e2e-skill)
5. [Writing Flows Manually](#5-writing-flows-manually)
6. [Regroup-Specific Flows](#6-regroup-specific-flows)
7. [Running Tests](#7-running-tests)
8. [AI Features](#8-ai-features)
9. [Test Reports](#9-test-reports)
10. [testID Conventions for Regroup](#10-testid-conventions-for-regroup)
11. [Firebase Auth in Tests](#11-firebase-auth-in-tests)
12. [CI/CD Integration](#12-cicd-integration)
13. [Comparison with Detox](#13-comparison-with-detox)
14. [Known Limitations](#14-known-limitations)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Why Evaluate Maestro

### Problems with the current Detox setup

The existing Detox suite (`e2e/tests/`) is fragile — it requires a special build configuration, a dedicated `iPhone 15-Detox` simulator, Firebase Emulators running in parallel, and custom global setup/teardown. The Xcode build alone breaks frequently (see `docs/e2e/E2E_XCODE_ISSUE.md`). Maintenance overhead is high relative to the coverage it provides.

### What Maestro offers

| Concern                     | Detox                                | Maestro                                     |
| --------------------------- | ------------------------------------ | ------------------------------------------- |
| Requires app build          | Yes (debug build w/ instrumentation) | No (runs against any build)                 |
| Test language               | TypeScript                           | YAML                                        |
| Selector strategy           | `testID` attrs + text                | `testID`, visible text, accessibility label |
| iOS Simulator setup         | Dedicated device name required       | Any running simulator                       |
| Firebase Emulator required  | Yes (global setup enforces it)       | Configurable                                |
| Learning curve              | High                                 | Low (first test in 5 min)                   |
| Claude Code integration     | None                                 | Native (official MCP server)                |
| AI-assisted test generation | No                                   | Yes (codebase analysis + YAML generation)   |
| AI-analyzed test results    | No                                   | Yes (`--analyze` flag + `assertWithAI`)     |

### The goal

Use Claude Code + Maestro MCP + `mobile-e2e-skill` to:

1. Analyze the Regroup codebase and infer what needs testing
2. Generate Maestro YAML flow files automatically
3. Execute them against a running simulator
4. Produce structured failure reports with root-cause classification
5. Feed failures back into Claude Code to propose and apply code fixes

---

## 2. Installation

### Prerequisites

- **Java 17+** — required by Maestro CLI
  ```bash
  java -version   # must be 17+
  brew install openjdk@17   # if needed
  ```
- **iOS Simulator** running before tests execute (launch from Xcode or `xcrun simctl boot <device>`)
- **Metro bundler** running for debug builds (`npm run ios` starts both)

### Install Maestro CLI

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Verify:

```bash
maestro --version   # should print 1.x or 2.x
```

Upgrade later:

```bash
maestro upgrade
```

### Verify device connectivity

```bash
# List available devices
maestro device list

# Should show your running iOS Simulator, e.g.:
# iPhone 14 Pro (iOS 17.0) — Booted
```

---

## 3. Claude Code MCP Integration

This is the key integration that enables the AI-driven workflow. Once registered, Claude Code can list devices, run flows, inspect the view hierarchy, take screenshots, and interact with the simulator directly — all from a conversation.

### Register the Maestro MCP server

```bash
# Project scope (recommended — committed to .mcp.json)
claude mcp add maestro -- maestro mcp --scope project

# Or user scope (applies to all projects)
claude mcp add maestro -- maestro mcp --scope user
```

### Verify it's connected

In Claude Code:

```
/mcp
# Select "maestro" — should show "Connected"
```

### Available MCP tools

Once connected, Claude Code has access to:

| Tool                     | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `list_devices`           | Show available iOS simulators and Android emulators        |
| `run`                    | Execute a Maestro flow (inline YAML or file path)          |
| `inspect_view_hierarchy` | Dump the current screen's UI tree (for selector debugging) |
| `take_screenshot`        | Capture the current simulator screen                       |
| `tap_on`                 | Tap a UI element by text or testID                         |
| `input_text`             | Type into the focused field                                |
| `back`                   | Press back / navigate back                                 |
| `check_flow_syntax`      | Validate YAML before executing                             |
| `query_docs`             | Ask questions about Maestro syntax                         |

### What this enables in practice

Ask Claude Code things like:

- _"Run the login flow against the simulator and tell me what failed"_
- _"Look at the current screen and tell me which testIDs are present"_
- _"Write a Maestro flow for the invitation acceptance flow and run it"_
- _"A test failed with 'element not found' on the residents screen — inspect the view hierarchy and fix the selector"_

---

## 4. Autonomous Pipeline — mobile-e2e-skill

The `mobile-e2e-skill` is a Claude Code skill that implements a three-phase pipeline: read the codebase → generate Maestro YAML flows → run them → report. **This is the zero-manual-test-writing path.**

### Install

```bash
git clone https://github.com/andreahaku/mobile-e2e-skill ~/.claude/skills/mobile-e2e
```

Claude Code detects it automatically after install.

### Usage

```bash
# Full pipeline: analyze → generate → run → report
/mobile-e2e pipeline

# Individual phases
/mobile-e2e analyze              # Reads codebase → generates docs/e2e/staging-test-plan.md
/mobile-e2e analyze login        # Analyze just one flow
/mobile-e2e generate             # Converts plan docs → .maestro/flows/*.yaml
/mobile-e2e run staging          # Executes flows → docs/e2e/reports/YYYY-MM-DD-staging.md

# Or describe naturally:
"generate e2e tests for the house management screens"
"run a release check and give me the failure report"
"find all screens missing testID props"
```

### What the skill produces

```
regroup-rn7/
├── .maestro/
│   ├── config.yaml                    # App ID, env vars, device config
│   ├── utils/
│   │   ├── launch-app.yaml            # clearState + launch
│   │   ├── resume-app.yaml            # resume without clearing state
│   │   ├── login.yaml                 # Firebase email/password login
│   │   └── login-with-otp.yaml        # OTP flow if applicable
│   ├── flows/
│   │   ├── smoke.yaml                 # Quick sanity check
│   │   ├── auth/
│   │   │   ├── 01-login.yaml
│   │   │   ├── 02-signup.yaml
│   │   │   └── 03-password-reset.yaml
│   │   ├── houses/
│   │   │   ├── 01-view-house.yaml
│   │   │   └── 02-setup-wizard.yaml
│   │   ├── residents/
│   │   │   ├── 01-view-residents.yaml
│   │   │   └── 02-invite-resident.yaml
│   │   └── invitations/
│   │       └── 01-accept-invitation.yaml
│   └── release-checks/
│       └── staging/
│           ├── run-all.yaml
│           └── NN-flow-name.yaml
├── scripts/
│   └── e2e-run.sh
└── docs/e2e/
    ├── staging-test-plan.md           # Generated from codebase analysis
    └── reports/
        └── 2026-06-01-staging.md      # Run results + failure classification
```

### Session architecture (important)

The skill generates flows with a specific session pattern to avoid re-login overhead:

```
Setup flow:    clearState → launch → login (Firebase)
Feature flows: resumeApp → test actions (reuses authenticated session)
Teardown:      logout → terminate
```

This mirrors how Detox's `beforeAll` works but is managed in YAML — no TypeScript glue needed.

---

## 5. Writing Flows Manually

When you need precise control or the generated flows miss business logic, write YAML directly.

### Basic flow structure

```yaml
# .maestro/flows/auth/01-login.yaml
appId: com.regroup.app # matches Info.plist Bundle ID
---
- launchApp:
    clearState: true

- tapOn:
    id: 'login-email-input' # testID prop value

- inputText: 'test@example.com'

- tapOn:
    id: 'login-password-input'

- inputText: '${TEST_PASSWORD}' # env var, never hardcode

- tapOn:
    id: 'login-submit-button'

- assertVisible:
    id: 'dashboard-screen' # confirms navigation succeeded
```

### Targeting elements — priority order

1. **`testID` props** (most stable — survives text changes, translations)

   ```yaml
   - tapOn:
       id: 'resident-card-add-button'
   ```

2. **Visible text** (readable but brittle if labels change)

   ```yaml
   - tapOn: 'Add Resident'
   ```

3. **Accessibility label** (for icon buttons without text)
   ```yaml
   - tapOn:
       accessibility id: 'close-modal'
   ```

### Reusable utility flows

Reference other flows with `runFlow`:

```yaml
# Reuse login utility instead of repeating it
- runFlow: '../utils/login.yaml'

# Pass variables
- runFlow:
    file: '../utils/login.yaml'
    env:
      EMAIL: 'admin@house.com'
      PASSWORD: '${ADMIN_PASSWORD}'
```

### Assertions

```yaml
# Element visible
- assertVisible: 'Oxford House'

# Element NOT visible
- assertNotVisible:
    id: 'error-banner'

# Text content
- assertVisible:
    text: '3 residents'

# AI assertion (requires Maestro Cloud account)
- assertWithAI: 'The resident list shows at least one entry'
```

### Waiting and timing

Maestro handles timing automatically — no `sleep()` calls needed. It waits for the accessibility layer to stabilize after each action. For long async operations (e.g., Firestore writes):

```yaml
# Wait for an element to appear (up to 5s by default)
- waitForAnimationToEnd

# Explicit wait if needed for Firestore latency
- extendedWaitUntil:
    visible:
      id: 'resident-saved-confirmation'
    timeout: 8000
```

---

## 6. Regroup-Specific Flows

### Critical flows to cover (priority order)

| Flow                                 | Why critical                     | Key testIDs needed                         |
| ------------------------------------ | -------------------------------- | ------------------------------------------ |
| Login (email/password)               | Auth gate for everything         | `login-email-input`, `login-submit-button` |
| Setup wizard (new house)             | Onboarding — multi-step          | `wizard-step-N-*`                          |
| Invite resident (server token)       | Recent feature — high churn risk | `invite-modal-*`, `invitation-token-input` |
| Accept invitation (token redemption) | New user path                    | `signup-invitation-token-*`                |
| View residents list                  | Core house admin                 | `residents-list`, `resident-card-{id}`     |
| Add/edit chore                       | Common daily action              | `chore-form-*`                             |
| Activity feed                        | Read-only but Firebase-heavy     | `activity-feed-list`                       |

### Setup wizard flow example

The setup wizard (`src/screens/SetupWizard/`) is multi-step with Firebase writes between steps. This is a flow the skill should generate automatically after analyzing the screen tree, but here's a manual reference:

```yaml
# .maestro/flows/houses/02-setup-wizard.yaml
appId: com.regroup.app
---
- runFlow: '../utils/login.yaml'

# Admin user lands on "create house" prompt
- assertVisible:
    id: 'setup-wizard-start-screen'

- tapOn:
    id: 'wizard-house-name-input'
- inputText: 'Test Oxford House'

- tapOn:
    id: 'wizard-next-button'

# Step 2: house rules / settings
- assertVisible:
    id: 'wizard-step-2-screen'
- tapOn:
    id: 'wizard-next-button'

# Step 3: invite residents (can skip for baseline)
- tapOn:
    id: 'wizard-skip-invitations-button'

# Should land on dashboard
- assertVisible:
    id: 'dashboard-screen'
- assertVisible: 'Test Oxford House'
```

### Invitation acceptance flow

This covers the recent `redeemInvitation` work:

```yaml
# .maestro/flows/invitations/01-accept-invitation.yaml
appId: com.regroup.app
---
- launchApp:
    clearState: true

# New user — lands on sign up / log in screen
- tapOn: 'Sign Up'

- tapOn:
    id: 'signup-name-input'
- inputText: 'Test Resident'

- tapOn:
    id: 'signup-email-input'
- inputText: 'resident-${timestamp}@test.com'

- tapOn:
    id: 'signup-password-input'
- inputText: '${TEST_RESIDENT_PASSWORD}'

# Invitation token field (shown when token is present in URL or entered manually)
- tapOn:
    id: 'signup-invitation-token-input'
- inputText: '${TEST_INVITATION_TOKEN}'

- tapOn:
    id: 'signup-submit-button'

# Should land on resident dashboard (not admin dashboard)
- assertVisible:
    id: 'resident-dashboard-screen'
- assertNotVisible:
    id: 'admin-controls'
```

---

## 7. Running Tests

### Run a single flow

```bash
maestro test .maestro/flows/auth/01-login.yaml
```

### Run all flows in a directory

```bash
maestro test .maestro/flows/
```

### Run the full release check suite

```bash
maestro test .maestro/release-checks/staging/run-all.yaml
```

Or using the generated runner script:

```bash
./scripts/e2e-run.sh staging
```

### Run with AI analysis (recommended for CI)

```bash
# Generates an HTML Insights Report at the end — visual regressions, spelling errors, layout breaks
maestro test .maestro/flows/ --analyze
```

### Target a specific device

```bash
# List devices first
maestro device list

# Run against a specific simulator
maestro test --device "iPhone 14 Pro" .maestro/flows/
```

### Continuous mode (reruns on file save — useful during authoring)

```bash
maestro test --continuous .maestro/flows/auth/01-login.yaml
```

### Environment variables

Never hardcode credentials. Pass via env:

```bash
export TEST_EMAIL="e2e-admin@regroup-test.com"
export TEST_PASSWORD="..."
export TEST_INVITATION_TOKEN="..."

maestro test .maestro/flows/
```

Or in a `.env.e2e` file (gitignored):

```bash
maestro test --env .env.e2e .maestro/flows/
```

---

## 8. AI Features

Maestro has two built-in AI modes. Both require a free Maestro Cloud account (`maestro login`).

### `--analyze` — post-run AI insights

```bash
maestro test .maestro/flows/ --analyze
```

After all flows run, Maestro sends screenshots and logs to its AI backend and generates an HTML report identifying:

- UI regressions vs. previous runs
- Spelling errors in visible text
- Layout breaks (elements overlapping, clipping)
- Missing elements on screens

The report link appears in terminal output.

### `assertWithAI` — in-flow natural language assertions

For states that are hard to express as element checks:

```yaml
- assertWithAI: 'The screen shows a list of residents with at least one entry'
- assertWithAI: 'The invitation was sent — a confirmation banner is visible'
- assertNoDefectsWithAI # general visual audit of current screen
```

These are slower than `assertVisible` (requires API call) — use sparingly on complex screens where structural assertions are brittle.

### Maestro Studio (visual test authoring)

```bash
maestro studio
```

Opens a desktop GUI where you can:

- Click elements in the live simulator to generate YAML commands
- Inspect element IDs and accessibility labels
- Debug failing selectors step-by-step
- Use **MaestroGPT** to describe a test in plain English and get YAML back

Most useful for: debugging why a selector isn't matching, and for creating flows for complex multi-step screens.

---

## 9. Test Reports

### Generated report structure

Each run with the `mobile-e2e-skill` produces a report at `docs/e2e/reports/YYYY-MM-DD-staging.md`:

```markdown
# Regroup E2E Report — 2026-06-01

## Summary

✅ Passed: 12 ❌ Failed: 3 ⏭️ Skipped: 1

## Failed Flows

### residents/02-invite-resident.yaml

**Root cause:** Missing testID  
**Element:** invite-modal confirm button  
**Fix owner:** App code  
**Action:** Add `testID="invite-modal-confirm-button"` to the TouchableOpacity in InviteModal.tsx

### auth/01-login.yaml

**Root cause:** Timeout  
**Element:** dashboard-screen (never appeared)  
**Fix owner:** Investigation needed — may be Firebase emulator connectivity
```

### Failure root cause categories

The skill classifies failures into 10 categories:

| Category         | Meaning                                | Fix owner              |
| ---------------- | -------------------------------------- | ---------------------- |
| `missing-testid` | Element exists but has no testID       | App code               |
| `timeout`        | Element never appeared within deadline | App or network         |
| `auth`           | Login flow failed                      | Test config / Firebase |
| `navigation`     | Wrong screen after action              | App logic              |
| `text-mismatch`  | Text assertion failed                  | App content            |
| `permission`     | OS permission dialog blocked flow      | Test setup             |
| `animation`      | Element not interactive mid-animation  | Timing or app          |
| `portal`         | Modal/overlay blocked interaction      | Test ordering          |
| `network`        | Firestore/API call failed              | Backend or emulator    |
| `unknown`        | Uncategorized failure                  | Manual investigation   |

---

## 10. testID Conventions for Regroup

testIDs are the most reliable selector strategy — they survive text changes, translations, and refactors. Add them to any element a test needs to find.

### Naming convention: `{feature}-{role}-{type}`

```tsx
// Auth screens
testID="login-email-input"
testID="login-password-input"
testID="login-submit-button"
testID="login-forgot-password-link"
testID="signup-name-input"
testID="signup-invitation-token-input"

// Navigation
testID="tab-dashboard"
testID="tab-residents"
testID="tab-activity"
testID="tab-settings"

// House / Dashboard
testID="dashboard-screen"
testID="dashboard-house-name-text"
testID="dashboard-resident-count-text"

// Residents
testID="residents-list"
testID={`resident-card-${resident.id}`}        // dynamic IDs for list items
testID="resident-add-button"
testID="invite-modal"
testID="invite-modal-email-input"
testID="invite-modal-confirm-button"
testID="invite-modal-cancel-button"

// Invitations
testID="invitation-token-input"
testID="invitation-redeem-button"
testID="invitation-success-banner"

// Setup wizard
testID="wizard-step-1-screen"
testID="wizard-house-name-input"
testID="wizard-next-button"
testID="wizard-skip-invitations-button"

// Chores
testID="chore-list"
testID={`chore-item-${chore.id}`}
testID="chore-add-button"
testID="chore-form-title-input"
testID="chore-form-save-button"

// Modals and overlays
testID="modal-close-button"
testID="error-banner"
testID="loading-indicator"
```

### How to add them

```tsx
// TouchableOpacity
<TouchableOpacity testID="login-submit-button" onPress={onLogin}>

// TextInput
<TextInput testID="login-email-input" value={email} />

// View (for screen-level assertions)
<View testID="dashboard-screen" style={styles.container}>

// FlatList items — use renderItem's item.id
renderItem={({ item }) => (
  <ResidentCard testID={`resident-card-${item.id}`} resident={item} />
)}
```

### Finding what's missing

```bash
# The analyze phase identifies gaps
/mobile-e2e analyze

# Or manually check coverage
grep -r 'testID' src/screens/ | wc -l
grep -rL 'testID' src/screens/*.tsx   # files with zero testIDs
```

---

## 11. Firebase Auth in Tests

Regroup uses real Firebase Auth (not a mock) in E2E tests. Two strategies:

### Strategy A: Firebase Emulator (matches existing Detox setup)

Run the Firebase Auth emulator and use test credentials that only exist there.

```bash
# Terminal 1 — start emulators
firebase emulators:start --only auth,firestore

# Terminal 2 — run Maestro flows
export TEST_EMAIL="admin@test.com"
export TEST_PASSWORD="password123"
maestro test .maestro/flows/
```

The app must be configured to point to emulator endpoints. Maestro doesn't control this — it's handled by the app's environment config (see `src/config/`).

### Strategy B: Dedicated test Firebase project

Create a separate Firebase project (`regroup-e2e-testing`) with seeded test users. Use real Firebase Auth, no emulator dependency. More representative of production behavior; simpler CI setup.

Seed test users:

```bash
# scripts/seed-e2e-users.sh
firebase auth:import e2e-test-users.json --project regroup-e2e-testing
```

### Handling sign-in timing

Firebase Auth sign-in involves a network round-trip (even to emulator). If the dashboard doesn't appear:

```yaml
# After tapping login-submit-button, wait explicitly
- extendedWaitUntil:
    visible:
      id: 'dashboard-screen'
    timeout: 10000 # 10s — generous for emulator cold start
```

### Google Sign-In / Apple Sign-In

These require the OS OAuth sheet which Maestro cannot interact with. Options:

1. Skip these flows in E2E — test them via unit tests mocking the native auth result
2. Use Firebase Auth Emulator's REST API to pre-authenticate and deep-link with the token
3. Test only the email/password path in Maestro; document the OAuth paths as manual-only

---

## 12. CI/CD Integration

### GitHub Actions example

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: macos-14 # must be macOS for iOS Simulator
    steps:
      - uses: actions/checkout@v4

      - name: Install Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash

      - name: Install Node dependencies
        run: npm ci

      - name: Start iOS Simulator
        run: xcrun simctl boot "iPhone 15" || true

      - name: Start Metro bundler (background)
        run: npm run ios &
        env:
          RCT_NO_LAUNCH_PACKAGER: 0

      - name: Wait for Metro
        run: npx wait-on http://localhost:8081/status --timeout 120000

      - name: Run E2E flows
        run: maestro test .maestro/flows/ --analyze
        env:
          TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: maestro-report
          path: docs/e2e/reports/
```

### Maestro Cloud (parallel execution)

For parallel runs across multiple iOS/Android versions without managing your own device farm:

```bash
# Run on Maestro Cloud (requires paid plan)
maestro cloud --apiKey $MAESTRO_API_KEY .maestro/flows/
```

This runs your flows in parallel on Maestro's infrastructure and returns results to the terminal. Average run time: ~5 minutes for a full suite.

---

## 13. Comparison with Detox

|                             | Detox (current)                                      | Maestro (evaluating)                |
| --------------------------- | ---------------------------------------------------- | ----------------------------------- |
| **App build required**      | Yes — dedicated debug build                          | No — runs against dev server        |
| **Test language**           | TypeScript                                           | YAML                                |
| **Selector model**          | `testID` attrs + element matchers                    | `testID`, text, accessibility label |
| **Simulator setup**         | Must match `iPhone 15-Detox` exactly                 | Any running simulator               |
| **Firebase Emulator**       | Mandatory (enforced in globalSetup)                  | Optional                            |
| **Parallel execution**      | Manual setup                                         | Maestro Cloud (paid)                |
| **AI analysis**             | None                                                 | `--analyze`, `assertWithAI`         |
| **Claude Code integration** | None                                                 | Official MCP server                 |
| **Auto test generation**    | No                                                   | Yes (mobile-e2e-skill)              |
| **Flakiness handling**      | Manual sleeps / retry logic                          | Built-in auto-wait                  |
| **Existing coverage**       | auth, setup wizard, invitations, residents, activity | To be generated                     |

### Migration path

Maestro and Detox can coexist. Suggested approach:

1. Install Maestro + MCP alongside the existing Detox setup
2. Run `/mobile-e2e pipeline` to generate Maestro flows covering the same critical paths
3. Run both suites in parallel for 2–3 sprints
4. If Maestro coverage reaches parity and flakiness is lower, retire Detox
5. Detox can remain for any flows that genuinely require programmatic assertions Maestro can't express

---

## 14. Known Limitations

- **Google/Apple Sign-In** — OS OAuth sheets are not automatable by Maestro. Test these paths at the unit level.
- **Notifications / Push** — Maestro cannot interact with system notification banners. Test notification delivery separately.
- **Biometric prompts** — Face ID / Touch ID dialogs are OS-level; use `maestro device biometrics` commands or avoid in E2E.
- **Deep links** — Supported via `openLink: regroup://path` but requires the app's URL scheme to be configured in the test config.
- **Background/foreground transitions** — Limited support for testing background fetch or push-triggered state changes.
- **testID required for stability** — Without testIDs on key elements, flows fall back to text matching which breaks on copy changes. Invest in testID coverage before authoring complex flows.
- **Maestro Cloud required for AI features** — `--analyze` and `assertWithAI` need a Maestro Cloud account (free tier is sufficient).

---

## 15. Troubleshooting

### "No devices found"

```bash
# Ensure a simulator is booted
xcrun simctl list devices | grep Booted

# Boot one if needed
xcrun simctl boot "iPhone 15"

# Open Simulator.app to confirm
open -a Simulator
```

### "App not found" / wrong bundle ID

```bash
# Find your app's actual bundle ID
xcrun simctl listapps booted | grep -i regroup

# Update .maestro/config.yaml with the correct appId
```

### "Element not found" — debugging strategy

```bash
# 1. Take a screenshot to see current screen
maestro device screenshot

# 2. Dump the view hierarchy to find actual IDs
maestro view-hierarchy

# 3. Open Studio for interactive inspection
maestro studio
```

If the element exists but Maestro can't find it, the testID may be missing. Add it and re-run.

### iOS: element not tappable (touch swallowed by parent view)

React Native can block touch events when views are deeply nested. Fix in app code:

```tsx
// Outer container — disable accessibility to let inner element handle touches
<View accessible={false}>
  <TouchableOpacity accessible={true} testID="inner-button" onPress={...}>
```

### Slow login (Firestore timeout after auth)

The dashboard fetches house data immediately after login. If Firestore emulator is slow to respond, the `dashboard-screen` assertion times out. Increase the timeout in the login utility:

```yaml
- extendedWaitUntil:
    visible:
      id: 'dashboard-screen'
    timeout: 15000
```

### MCP not connecting in Claude Code

```bash
# Reconnect
/mcp
# Select "maestro" → Reconnect

# If that fails, check Java path
echo $JAVA_HOME
which java

# Re-add with explicit Java path
claude mcp remove maestro
claude mcp add maestro -- maestro mcp
```
