# Team Plan: Deep Analysis

## Analysis Context

Whole-monorepo architecture overview of recovery-platform — map the structure, stack, and
responsibilities of all 4 products + recovery-api, then synthesize a cross-product view
(integration map, shared patterns, divergences, risks).

## Reconnaissance Summary

- **Project:** recovery-platform flat monorepo, TypeScript-centric
- **Size:** ~2155 source files; regroup (1285) and homegroups (779) dominate
- **Shape:** 1 API service (recovery-api), 2 multi-surface products (mobile RN + web + functions),
  1 Next.js site, 1 empty shared module, 1 docs ecosystem

## Focus Areas

### Focus Area 1: recovery-api integration layer

- **Directories:** recovery-api/src/{middleware,triggers,http,callable,entities,lib}
- **Starting files:** recovery-api/src/index.ts, callable/referrals.ts, middleware/auth.ts
- **Search patterns:** `X-Service-Key`, `appId`, `createReferral`, `getUserProfile`, `onUserWrite`
- **Complexity:** Medium (small surface, high architectural importance)
- **Assigned to:** explorer-1 (sonnet)

### Focus Area 2: homegroups (RecoveryConnect)

- **Directories:** homegroups/{mobile,web,functions}
- **Starting files:** homegroups/mobile entry, homegroups/web/src entry, homegroups/functions/src
- **Search patterns:** `createSlice`, `configureStore`, `stripe`, `firestore`, `meeting`, `homegroup`
- **Complexity:** High (779 files, RN + CRA + functions)
- **Assigned to:** explorer-2 (sonnet)

### Focus Area 3: regroup (RATS)

- **Directories:** regroup/{mobile,web,functions}
- **Starting files:** regroup/mobile entry, regroup/web (Angular app), regroup/functions/src
- **Search patterns:** `@NgModule`, `Component`, `house`, `guest`, `resident`, `stripe`, `firestore`
- **Complexity:** High (1285 files, RN + Angular SSR + functions)
- **Assigned to:** explorer-3 (sonnet)

### Focus Area 4: detox-recovery (NextStep) + shared + docs/monorepo

- **Directories:** detox-recovery/{app,components,lib,middleware.ts}, shared/, docs/, root config
- **Starting files:** detox-recovery/app/layout/page, app/api/{contact,subscribe}, docs/INDEX.md
- **Search patterns:** `resend`, `route`, `metadata`, `referral`, cross-cutting config
- **Complexity:** Medium (61 files + docs + cross-cutting concerns)
- **Assigned to:** explorer-4 (sonnet)

## Agent Composition

| Role        | Count | Model  | Purpose                                     |
| ----------- | ----- | ------ | ------------------------------------------- |
| Explorer    | 4     | sonnet | Independent focus-area exploration          |
| Synthesizer | 1     | opus   | Merge findings, cross-product investigation |

## Task Dependencies

- Exploration Tasks 1-4: parallel (no dependencies)
- Synthesis Task: blocked by all 4 exploration tasks
