# Recovery Platform

[![CI](https://github.com/marcusk639/recovery-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/marcusk639/recovery-platform/actions/workflows/ci.yml)
[![Test-tamper gate](https://github.com/marcusk639/recovery-platform/actions/workflows/test-tamper.yml/badge.svg)](https://github.com/marcusk639/recovery-platform/actions/workflows/test-tamper.yml)

A monorepo of independent recovery products and the API that connects them. The products are 12-step group management (Homegroups), sober-living house operations (Regroup) and a detox and treatment site (NextStep Recovery).

Each product is self-contained, with its own Firebase project, Auth and Firestore. They share no runtime code. Cross-product flows such as referrals and identity go through `recovery-api`.

## Products

| Directory         | Product                           | Packages                                                                                              | Firebase project         |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| `homegroups/`     | **Homegroups**: 12-step groups    | `functions/` (Cloud Functions, TS) · `mobile/` (React Native 0.72) · `web/` (React 18, CRA)           | `recovery-connect-cad4b` |
| `regroup/`        | **Regroup**: sober living         | `functions/` (Cloud Functions, TS, Stripe) · `mobile/` (React Native 0.72) · `web/` (Angular 9 + SSR) | `phoenix-cleanhouse`     |
| `detox-recovery/` | **NextStep Recovery**: detox site | Next.js 15 / React 19 app                                                                             | `nextsteprecovery-1d5c2` |
| `recovery-api/`   | **Cross-app API**                 | Cloud Functions (TS, strict)                                                                          | `recovery-platform`      |

Also here:

- `e2e-maestro/`: Maestro mobile smoke tests.
- `scripts/`: git hooks and repo tooling.
- `docs/`: ecosystem and go-to-market docs.

Vocabulary differs per product. For example, a "meeting" is a 12-step meeting in Homegroups but a house meeting in Regroup. See [docs/ecosystem/vocabulary.md](docs/ecosystem/vocabulary.md).

## Prerequisites

- **Node.js 22.** The Cloud Functions packages and `recovery-api` require it, and it satisfies every other package's `engines` range.
- **npm.** Each package has its own `package-lock.json`, and there is no workspace tool.
- **Firebase CLI:** `npm install -g firebase-tools`
- **For the mobile apps:** Xcode with CocoaPods, and/or Android Studio. Both apps are bare React Native, not Expo.

## Getting started

```bash
git clone https://github.com/marcusk639/recovery-platform.git
cd recovery-platform
./scripts/install-git-hooks.sh   # once per clone; re-run after hook changes
```

Every package installs and runs on its own. Work from the package directory, never the repo root:

```bash
cd regroup/functions && npm ci && npm test
```

For JS-only work in `homegroups/mobile` or `regroup/mobile` (Jest, ESLint), use `npm ci --ignore-scripts`. Their postinstall runs `pod install`.

Secrets are never committed. Deployed functions read them from Firebase Secret Manager; local runs use the package's gitignored env file.

**Setting up a new machine?** [SETUP.md](SETUP.md) covers the tools you need, every package's env file, the Secret Manager secrets, the Firebase project aliases and native mobile setup.

### Per-product setup

| Product           | Start here                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Homegroups        | [homegroups/README.md](homegroups/README.md) · [development](homegroups/docs/technical/development.md)              |
| Regroup           | [regroup/docs/technical/development.md](regroup/docs/technical/development.md) · [mobile](regroup/mobile/README.md) |
| NextStep Recovery | [detox-recovery/README.md](detox-recovery/README.md) · [development](detox-recovery/docs/technical/development.md)  |
| recovery-api      | [recovery-api/CLAUDE.md](recovery-api/CLAUDE.md)                                                                    |

### Common commands

| Package                       | Run locally                                 | Test                                                                                                           |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `*/functions`, `recovery-api` | `npm run serve` (Firebase emulators)        | `npm test`                                                                                                     |
| `*/mobile`                    | `npm start`, then `npm run ios` / `android` | `npm test`                                                                                                     |
| `homegroups/web`              | `npm start`                                 | `npm test`                                                                                                     |
| `regroup/web`                 | `npm start` (`ng serve`)                    | `npx tsc --noEmit -p tsconfig.spec.json` (Karma can't run; see [regroup/web/CLAUDE.md](regroup/web/CLAUDE.md)) |
| `detox-recovery`              | `npm run dev`                               | `npm test`                                                                                                     |

Emulator ports differ per package, so read that package's `firebase.json`. `recovery-api` is offset (functions 5002, Firestore 8082, Auth 9100) so it can run beside one product. Don't run two products' emulators at the same time.

## Quality gates

**Local git hooks** (installed by `scripts/install-git-hooks.sh`):

- **pre-commit:**
  - blocks secrets (Stripe, Anthropic, OpenRouter, AWS, GitHub, private keys, non-allowlisted `AIza` keys);
  - blocks new source files over 300 lines;
  - blocks test tampering: deleted, skipped, hollowed or renamed-away tests, and test-count drops.
- **commit-msg:** the scope must name the product, e.g. `fix(regroup-mobile): …`.
- **pre-push:** runs unit tests for changed packages among `recovery-api`, `detox-recovery`, `homegroups/functions` and `regroup/functions`.

**CI** (`.github/workflows/`):

- `ci.yml`: typecheck and test per package, Firestore and Storage rules tests, and Maestro smoke tests.
- `test-tamper.yml`: re-runs the test-tamper check on every PR.
- `claude-code-review.yml`: automated PR review.

Coverage floors in the `recovery-api`, `homegroups/functions` and `detox-recovery` Jest configs are ratchets: raise them, never lower them.

## Contributing

- **Work in a git worktree off `origin/main`,** and use `git -C <path>` for git commands.
- **Use [Conventional Commits](https://www.conventionalcommits.org/) with a product scope:** `feat(homegroups-mobile): …`, `fix(regroup-functions): …`, `docs(platform): …`.
- **PRs land as squash merges.**
- **Never query one product's Firestore from another.** Cross-product calls go through `recovery-api`.
- **Never log PII:** names, contact info, health or recovery status.

Contributor and agent conventions live in [CLAUDE.md](CLAUDE.md) and each product's `CLAUDE.md`. The full documentation map is [docs/INDEX.md](docs/INDEX.md).

## License

Proprietary. Copyright (c) 2026 Marcus Klein. All rights reserved. The source is publicly viewable, but no license is granted to use, copy, modify or distribute it. See [LICENSE](LICENSE).
