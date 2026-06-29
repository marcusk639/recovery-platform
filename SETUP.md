# recovery-platform — New Machine Setup

Multi-app recovery platform. Primary app is **Regroup** — a Firebase + React Native + web platform for recovery housing.

## Active Branch

```bash
git clone https://github.com/marcusk639/recovery-platform.git
cd recovery-platform
git checkout test/e2e-launch-prep
```

## Repository Structure

| Directory       | What it is                                                               |
| --------------- | ------------------------------------------------------------------------ |
| `regroup/`      | **Primary app** — Firebase Functions + React Native mobile + Next.js web |
| `homegroups/`   | Homegroups sub-app                                                       |
| `recovery-api/` | Standalone recovery API                                                  |
| `shared/`       | Shared utilities                                                         |
| `scripts/`      | Utility scripts                                                          |
| `e2e-maestro/`  | Maestro mobile E2E tests                                                 |

---

## Regroup App Setup

This is the main app. All commands below run from `regroup/`.

### Prerequisites

| Tool          | Version | Install                                |
| ------------- | ------- | -------------------------------------- |
| Node.js       | ≥18     | `brew install node`                    |
| npm           | bundled | —                                      |
| Firebase CLI  | latest  | `npm install -g firebase-tools`        |
| Expo CLI      | latest  | `npm install -g expo-cli` (for mobile) |
| iOS Simulator | —       | Xcode from Mac App Store               |

### Install

```bash
cd regroup

# Firebase Functions
cd functions && npm install && cd ..

# Web
cd web && npm install && cd ..

# Mobile
cd mobile && npm install && cd ..
```

### Environment

```bash
# Functions env (secrets)
cp functions/.env.example functions/.env.local 2>/dev/null || touch functions/.env.local
# Fill from 1Password "recovery-platform"
```

Key secrets (retrieve from 1Password "recovery-platform"):

| Variable                | Source                                      |
| ----------------------- | ------------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe dashboard → Developers → API keys    |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks                 |
| `STRIPE_PRICE_*`        | See `scripts/stripe-prices.env` (committed) |
| `INTERNAL_API_KEY`      | Any random string                           |
| `RESEND_API_KEY`        | resend.com                                  |

Stripe price IDs (test mode) are documented in `scripts/stripe-product-values.md` and `scripts/stripe-prices.env`.

### Firebase

```bash
firebase login
firebase use regroup-app   # check firebase.json for project ID
```

### Start (local emulators)

```bash
cd regroup
firebase emulators:start   # Functions + Firestore + Auth emulators
```

### Start (mobile)

```bash
cd regroup/mobile
npx expo start
# Press 'i' for iOS simulator, 'a' for Android
```

### Start (web)

```bash
cd regroup/web
npm run dev    # localhost:3000
```

---

## Notes

- `regroup/functions/.local.env` is gitignored — secrets only, never commit
- `scripts/stripe-prices.env` contains test-mode Stripe price IDs (safe, committed)
- `PATHFINDER-*` and `.git-workflow/` directories are tool state — do not commit
- Secrets backup is in iCloud Drive dev-env-backup (see NEW-MACHINE-SETUP-PLAN.md Phase 4)
- Firebase project ID: check `regroup/firebase.json`
