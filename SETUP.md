# New Machine Setup

How to get `recovery-platform` running on a fresh machine. For what the repo contains and day-to-day commands, see [README.md](README.md). For conventions, see [CLAUDE.md](CLAUDE.md).

## 1. Tools

| Tool                 | Version | Notes                                                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------------------- |
| Node.js              | 22      | Required by every Cloud Functions package; satisfies every other package's `engines`. |
| npm                  | bundled | Each package has its own lockfile. There is no workspace tool.                        |
| Firebase CLI         | latest  | `npm install -g firebase-tools`                                                       |
| JDK                  | —       | For the Firestore emulator; the Firebase CLI reports the version it needs.            |
| Xcode + CocoaPods    | —       | iOS builds of `homegroups/mobile` and `regroup/mobile` (bare React Native, not Expo). |
| Android Studio + JDK | —       | Android builds.                                                                       |
| Maestro CLI          | —       | Only for mobile E2E flows ([e2e-maestro/README.md](e2e-maestro/README.md)).           |

## 2. Clone and install hooks

```bash
git clone https://github.com/marcusk639/recovery-platform.git
cd recovery-platform
./scripts/install-git-hooks.sh
```

Work happens in git worktrees off `origin/main`, not on long-lived branches. See the Gotchas in [CLAUDE.md](CLAUDE.md).

## 3. Install the packages you need

Install each package from its own directory:

```bash
for p in recovery-api homegroups/functions regroup/functions detox-recovery homegroups/web regroup/web; do
  (cd "$p" && npm ci)
done

# Mobile apps: full install runs `pod install`; use --ignore-scripts for JS-only work.
(cd homegroups/mobile && npm ci)
(cd regroup/mobile && npm ci)
```

The session-start check (`scripts/session-check.sh`) warns about any package whose `node_modules` is missing.

## 4. Environment files

Every package with runtime configuration has a tracked example. Copy it and fill in values:

| Package                | Example file           | Copy to                 | Holds                                                     |
| ---------------------- | ---------------------- | ----------------------- | --------------------------------------------------------- |
| `recovery-api`         | `env.example`          | `.env`                  | Admin credentials path, project ID, API key, CORS origins |
| `homegroups/functions` | `.env.example`         | `.env.local` (emulator) | Stripe keys and price IDs, cross-app API key              |
| `regroup/functions`    | `.env.example`         | `.env` (per its header) | Stripe, SendGrid, Maps, tier prices, rent-fee settings    |
| `detox-recovery`       | `env.example`          | `.env.local`            | Resend, MailerLite, checkout/booking URLs, recovery-api   |
| `homegroups/mobile`    | `.env.example`         | `.env`                  | Maps key, Stripe test publishable key                     |
| `regroup/mobile`       | `.env.example`         | `.env`                  | Maps key                                                  |
| `homegroups/mobile`    | `e2e/.env.e2e.example` | `e2e/.env.e2e`          | E2E test account                                          |

`regroup/web` and `homegroups/web` read their public Firebase client config from source (`src/environments/`, `src/lib/firebase.js`).

All real `.env*` files are gitignored. Never commit one, and never paste a secret into docs. The pre-commit hook blocks the common key formats, but it can't catch everything.

## 5. Secrets

Deployed functions read their secrets from **Firebase Secret Manager**, not from env files:

| Package                | Secrets (`defineSecret`)                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `recovery-api`         | `GOOGLE_MAPS_API_KEY`, `RECOVERY_PLATFORM_API_KEY`                                                                                           |
| `homegroups/functions` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENDGRID_API_KEY`, `GOOGLE_MAPS_API_KEY`, `RATS_API_KEY`, `RECOVERY_PLATFORM_API_KEY`         |
| `regroup/functions`    | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CLIENT_ID`, `SENDGRID_API_KEY`, `GOOGLE_MAPS_API_KEY` |

Set or rotate one with `firebase functions:secrets:set <NAME> --project <id>`. Local values for the emulator go in the package's `.env.local`. Get them from the team password manager (1Password vault `recovery-platform`), not from git history.

E2E test passwords are never committed. CI reads `REGROUP_E2E_TEST_PASSWORD` and `HOMEGROUPS_E2E_TEST_PASSWORD`. Locally, export `E2E_TEST_PASSWORD` before running Maestro flows.

## 6. Firebase projects

```bash
firebase login
```

Each product deploys to its own project. The aliases are in the `.firebaserc` next to the product's `firebase.json`:

| Product           | Directory with `.firebaserc` | Project(s)                                                         |
| ----------------- | ---------------------------- | ------------------------------------------------------------------ |
| Homegroups        | `homegroups/`                | `recovery-connect-cad4b` (default), `homegroups-e2e` (alias `e2e`) |
| Regroup           | `regroup/`, `regroup/web/`   | `phoenix-cleanhouse`                                               |
| recovery-api      | `recovery-api/`              | `recovery-platform`                                                |
| NextStep Recovery | none                         | `nextsteprecovery-1d5c2`. Pass `--project` explicitly.             |

Run emulators from the product directory. Ports differ per product; see that product's `firebase.json`. Don't run two products' emulators at once.

## 7. Mobile native setup

```bash
cd regroup/mobile/ios && pod install && cd -      # same for homegroups/mobile/ios
cd regroup/mobile && npm start                    # Metro
npm run ios                                       # or: npm run android
```

`GoogleService-Info.plist` and `google-services.json` are committed public client config; you don't need to download them.

## 8. Verify

```bash
bash scripts/session-check.sh                     # hooks current, deps installed, rule frontmatter valid
(cd recovery-api && npm test)                     # any package's suite
```
