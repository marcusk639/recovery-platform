# Iterative Review — 2026-05-26

Three-cycle parallel review (code-reviewer + security-reviewer + architect) over the entire web codebase, followed by targeted fixes. Reviewers converged clean by cycle 3.

Scope: `src/app/`, `functions/src/`, `server.ts`, `e2e/`, `karma.conf.js`. Excluded build artifacts.

---

## Fixed in this session (15 files, uncommitted at time of writing)

### CRITICAL — SSR safety (browser-only code in components that render server-side)

| File:line                                                                           | Change                                                                                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/app/components/footer/footer-one/footer-one.component.ts:15-29`                | Injected `PLATFORM_ID`; `isPlatformBrowser` guards on `window.location.href` + `window.scroll`                       |
| `src/app/components/scrollup/scrollup.component.ts:15-17`                           | `isPlatformBrowser` guard on `window.scrollTo`                                                                       |
| `src/app/themes/theme-two/theme-two.component.ts:12-21`                             | DEFAULT ROUTE — `isPlatformBrowser` guard around `ngAfterViewInit` (`document.getElementById` + `window.setTimeout`) |
| `src/app/components/download/download.component.ts:17-25`                           | `isPlatformBrowser` guards on `openGooglePlay` / `openAppStore`                                                      |
| `src/app/components/terms/privacy-policy/terms.component.ts:18-21`                  | `PLATFORM_ID` injected; guard on `nativeElement.innerHTML` + `window.scrollTo`                                       |
| `src/app/components/privacypolicy/privacy-policy/privacy-policy.component.ts:18-21` | Same as terms                                                                                                        |
| `src/app/components/header/header-two/header-two.component.ts:37-43,75-84`          | Guards in `get show()` and `back()` (ReactNativeWebView access)                                                      |
| `src/app/components/accounts/login/login.component.ts:27-31`                        | Guard in `get isMobile()`                                                                                            |
| `src/app/components/accounts/signup/signup.component.ts:45-49`                      | Guard in `get isMobile()`                                                                                            |

### CRITICAL — Auth / PII

| File:line                                                                   | Change                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/components/billing/billing-info/billing-info.component.ts:187-218` | `postMessage` no longer serializes `cachedDetails` (was transmitting email+password to React Native host). Now sends `{event:'signup-complete', email}` only. `clearCachedDetails()` called in both success `finally` and error `catch` |
| `src/app/components/accounts/signup/signup.component.ts:87-90`              | Stopped writing `password` to `auth.cachedDetails.password` (only email cached)                                                                                                                                                         |
| `src/app/services/auth/auth-service.service.ts:29-30`                       | `cachedDetails` type narrowed: `{email: string; password: string}` → `{email?: string}` (compile-time prevention of regression)                                                                                                         |
| `src/app/services/auth/auth-service.service.ts:62-65`                       | Added `clearCachedDetails()` method                                                                                                                                                                                                     |

### HIGH

| File:line                                                                   | Change                                                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app/entities/User.ts:51-60`                                            | `createSuperAdmin` refactored to be immutable (spread `values`, no mutation)                                               |
| `src/app/components/modal/modal.component.html:5`                           | `[innerHTML]="title"` → `{{ title }}` (XSS sink eliminated)                                                                |
| `src/app/guards/auth.guard.ts:26`                                           | `return null` on SSR → `return false` (correct `CanActivate` contract)                                                     |
| `src/app/services/auth/auth-service.service.ts:49-60`                       | `onAuthStateChanged` listener leak — now captures unsubscribe and calls it on first event                                  |
| `src/app/services/auth/auth-service.service.ts:73-79`                       | `doAutoLogin` error log now includes `error.code` (was silently dropping)                                                  |
| `src/app/components/billing/billing-info/billing-info.component.ts:213-218` | Silent `.catch` now displays user-visible "Payment failed" error                                                           |
| `src/app/components/billing/billing-info/billing-info.component.ts:184`     | `analytics.logEvent('subscription-created', {user: this.user.id})` → no UID parameter (GDPR/CCPA pseudonymous PII concern) |
| `src/app/components/billing/billing-info/billing-info.component.ts:200`     | Removed `console.log(result.error.message)` (could leak partial card metadata)                                             |

---

## Deliberately NOT fixed — pick up later

### Architectural refactors (too large for a fix-loop, real value)

- **AuthService → reactive store**. `_user`, `cachedDetails`, `authSubscription` are plain instance fields on a root-injected singleton. Components poll `authService.user` with no change-notification. Replace with `user$: BehaviorSubject<User|null>` so guards/headers/components can subscribe. File: `src/app/services/auth/auth-service.service.ts`.
- **`app.module.ts` god-module**. 90+ component declarations + `NO_ERRORS_SCHEMA` (silences template typos). Every route's components eagerly compiled into main bundle. Split into `AccountsModule`, `BlogModule`, `ThemesModule`, `LegalModule`; lazy-load via `loadChildren`. Then remove `NO_ERRORS_SCHEMA`.
- **6 theme variants — pure duplication**. `theme-one` … `theme-six` are empty TS classes; only the HTML differs (which `<app-welcome-N>` etc. they compose). Consolidate via a `ThemeLayoutComponent` taking `sections: SectionConfig[]` and `*ngComponentOutlet`.
- **10 breadcrumb components** in `src/app/components/breadcrumb/` differ only in title text + nav label. Collapse to one `BreadcrumbComponent` with `@Input() title` + `@Input() crumbs`. Routes pass data via `route.data`.
- **Form construction in services**. `AuthService.buildAuthForm`, `ContactService.buildForm`, `SubscriptionService.buildForm` mix view-model concerns into data services. Move to an `AuthFormService` / `forms/` util.

### Subscription leaks (HIGH but cross-component refactor; left for batched cleanup)

- `src/app/themes/theme-two/theme-two.component.ts:13` — `route.queryParams.subscribe` (no `ngOnDestroy`)
- `src/app/components/accounts/signup/signup.component.ts:56` — `formGroup.get('email').valueChanges.subscribe`
- `src/app/components/billing/billing-info/billing-info.component.ts:125` — `stripeService.elements(...).subscribe`
- `src/app/components/ui/mek-field/mek-field.component.ts:31,34` — two `valueChanges`/`statusChanges` subscriptions

Fix pattern: have each extend `BaseComponent` and push to `this.subscriptions[]`, or adopt `takeUntil(this.destroy$)` with `ngOnDestroy`.

### UX / product decisions (need product input, not engineering fix)

- **Firebase persistence is `LOCAL`** (`auth-service.service.ts:217-222`). Tokens persist in `localStorage` — on a shared/kiosk device, next user resumes previous operator session. Switch to `SESSION` or make `LOCAL` opt-in via "Remember me" checkbox.
- **Email enumeration in signup** (`signup.component.ts:72-79`). `fetchSignInMethodsForEmail` reveals whether an email is registered with the recovery-housing service. Mitigation requires changing the signup UX flow (attempt then handle `auth/email-already-in-use` generically).

### Pre-existing tech debt / known gaps

- **No `firestore.rules` in this repo** — already documented in `CLAUDE.md`. Rules deployment lives elsewhere.
- **`RedirectComponent` is dead code** (`src/app/components/redirect/redirect.component.ts`). Not in `app.module.ts`, not in routes. The reviewers' open-redirect findings against it are moot. Either wire it up properly with scheme allowlist (`regroup-app://`, `com.rats.dev://`, `https://regroup-app.com/`, app store URLs) or delete the file.
- **`functions/package.json` build script fragility** (`"build": "rm -r ./dist && cp -r ../dist . && tsc"`). Hardcoded `../dist`, fails if `./dist` missing, no `-f`. Replace with a Node script that reads `outputPath` from `angular.json`.
- **`warmWebsite` cron points at dev URL** (`functions/src/util/firebase.ts:4` hardcoded `rats-dev.web.app`). Should read from `functions.config().webserver.url`. Free DoS amplifier hitting dev project from prod quota.
- **`LocalStorageService`** (`src/app/services/local-storage.service.ts:9-15`) accepts `any` value with no key namespacing/allowlist. Future caller could persist whole `User` entity (with SSN/DOB) to localStorage. Add typed wrapper + key reject-list.
- **`AppService` is dead abstraction** (`src/app/services/app-service/app.service.ts`) — `appName` constant + `route()` that wraps `router.navigate([route])`. Replace callers with direct `Router` injection; move `appName` to a constants file.
- **`AuthService.retrieveCredential()`** is a no-op stub with commented-out body (`auth-service.service.ts:62-64`). Delete or implement.

---

## Verification

- `npx tsc --noEmit -p tsconfig.json` passes cleanly (2 pre-existing errors outside scope: `functions/src/index.ts` and `@types/jsdom`).
- Three review cycles converged; cycle 3 returned 0 findings above CRITICAL/HIGH @ confidence 85 threshold.
- 15 files modified, ~200 net LOC.

## How to use this doc

- For a future iterative-review pass: brief reviewers with the "Deliberately NOT fixed" section so they don't re-flag known items. Cuts cycle 1 noise significantly.
- For roadmap: the "Architectural refactors" section is a prioritized backlog for the next sprint of cleanup work. Each item has file:line evidence.
- For PR description: the "Fixed in this session" tables describe the diff in detail.
