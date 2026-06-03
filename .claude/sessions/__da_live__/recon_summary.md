# Reconnaissance Summary

- **Project:** recovery-platform — flat monorepo, 4 products + 1 shared API service
- **Primary language:** TypeScript (also Angular/TS, React Native, Next.js)
- **Codebase size (source files, excl. node_modules/build):**
  - recovery-api: 30
  - homegroups: 779 (functions + mobile RN + web CRA)
  - regroup: 1285 (functions + mobile RN + web Angular SSR)
  - detox-recovery: 61 (Next.js 15)
  - shared: 0 (reserved/empty)

## Per-product stack

- **recovery-api** (`recovery-shared-api`): Firebase Functions v2. src tree: middleware/auth, triggers/onUserWrite, http/health, callable/{users,identity,referrals}, entities/{Referral,User}, lib/firebase, config. Deps: firebase-admin, firebase-functions, zod. **The intended cross-app integration bus.**
- **homegroups** (RecoveryConnect): 3 surfaces —
  - functions: firebase-admin/functions, stripe
  - mobile (RecoveryConnect): React Native + @react-native-firebase/\* (auth, firestore, functions, messaging, analytics, crashlytics), Apple auth
  - web (recovery-connect-website): CRA (react-scripts), react-router-dom, @stripe/react-stripe-js
- **regroup** (RATS): 3 surfaces —
  - functions: firebase-admin/functions, stripe
  - mobile (rats): React Native + @react-native-firebase/\*, notifee, push-notification-ios
  - web (sapp): Angular + @nguniversal/express-engine SSR, @angular/fire, ngx-stripe, express
- **detox-recovery** (NextStep): Next.js 15 app router, resend (email), API routes: contact, subscribe. Marketing/lead-gen site.
- **shared**: empty.

## Key observations

- Each product has its own Firebase project + isolated Firestore (per CLAUDE.md). No cross-query.
- recovery-api uses X-Service-Key/X-App-Id/X-User-Uid service auth (Phase 1); Phase 2 = custom token.
- Two products are multi-surface (mobile + web + functions); regroup web is Angular, homegroups web is CRA React — notable divergence.
- docs/ has INDEX, PRODUCT-ENCYCLOPEDIA, ecosystem/, strategy/, superpowers/.
