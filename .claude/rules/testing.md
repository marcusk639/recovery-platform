---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/*.e2e.*"
  - "**/__tests__/**"
  - "**/tests/**"
  - "**/e2e/**"
  - "e2e-maestro/**"
---

# Testing

## Running tests

- Run from the package root, never from the repo root: `npm test -- path/to/file.test.ts` for a single file.
- For `homegroups/mobile` and `regroup/mobile`, install with `npm ci --ignore-scripts` for JS-only work (postinstall runs `pod install`).
- Emulator ports differ per package. Read that package's `firebase.json` and do not run two products' emulators at once.
- `pre-push` runs `npm test` in each changed package among recovery-api, detox-recovery, homegroups/functions and regroup/functions.

## Writing tests

- Name tests after the behavior they pin down, grouped in `describe` blocks.
- Cover the error paths and authorization denials, not just the happy path. Most recent bugs here were authorization gaps and silent failures.
- Each test must be independent; no shared mutable state between tests.
- On money paths (Stripe, rent, subscriptions), mutation-kill counts are not proof of correctness. Assert against the domain model, and get an independent review.
