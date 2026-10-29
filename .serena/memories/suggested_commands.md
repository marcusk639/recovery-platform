# Commands

- Install hooks per clone: `./scripts/install-git-hooks.sh`.
- Mobile JS-only installs: `npm ci --ignore-scripts` (postinstall runs `pod install`, unavailable on Linux), then `npx patch-package` (patches are load-bearing; CI runs it explicitly).
- Per package: `npm test`, `npm run typecheck` / `npm run typecheck:ratchet` (regroup mobile: error count must not exceed `.typecheck-baseline`), `npm run lint`.
- Git: always `git -C <path> …`; check merged branches with two-dot diff (squash merges).
- Linux container: no Xcode/CocoaPods; Android SDK host `dl.google.com` may be blocked by network policy, so Android builds are verified in CI.
