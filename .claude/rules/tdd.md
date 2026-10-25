---
paths:
  - "**/src/**"
  - "**/app/**"
  - "detox-recovery/{components,lib}/**"
  - "detox-recovery/*.ts"
---

# Test-Driven Development

Features start with a failing test. Bug fixes start with a test that reproduces the bug.

## Cycle

1. **Red:** write the test, run it, and confirm it fails for the expected reason.
2. **Green:** write the smallest change that makes it pass.
3. **Refactor:** clean up with the test still green.
4. Run the package's full suite (`npm test` in that package's directory) before declaring done.

## Bug fixes

- If you cannot reproduce the bug in a test, keep investigating. Do not write a speculative fix.
- Do not commit a fix before its reproduction test exists.

## Coverage

Coverage floors in `recovery-api`, `homegroups/functions` and `detox-recovery` jest configs are ratchets: raise them, never lower them. Do not delete or weaken tests to get green. The installed pre-commit gate blocks deleted test files and test-count drops.

## When TDD may be skipped

- Documentation-only changes.
- Pure refactors already covered by existing tests.
- Packages without a test runner (`regroup/web` CI is typecheck-only). Say so explicitly instead of claiming the change is tested.
