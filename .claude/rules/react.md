---
paths:
  - "homegroups/mobile/**/*.tsx"
  - "regroup/mobile/**/*.tsx"
  - "homegroups/web/src/**/*.{js,jsx}"
  - "detox-recovery/**/*.tsx"
---

# React and React Native

`regroup/web` is Angular; these rules do not apply there.

## Prefer alternatives to `useEffect` in new code

Existing code uses `useEffect` heavily. Do not rewrite working effects as part of an unrelated change. In code you write, reach for an effect last:

1. **Derive values during render** instead of syncing them into state with an effect.
2. **Call work from event handlers** when a user action triggers it, not from an effect watching a flag.
3. **Reset state with a `key` prop** instead of an effect that watches an id.
4. **Subscriptions** (Firestore `onSnapshot`, notifee, AppState) belong in an effect. Always return the unsubscribe function, and guard against setting state after unmount.

## Component layout

Order inside a component: hooks, local state, derived values, event handlers, early returns, render.
