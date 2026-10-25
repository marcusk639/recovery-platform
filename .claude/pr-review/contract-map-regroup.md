# Contract map: regroup (and the string-literal links it owns)

The map is guidance, not truth. Confirm every link by grep or read before reporting on it.
Which file owns which link type is listed at the top of `contract-map-homegroups.md`.

## How regroup links are expressed

- No shared package. About 17 entities are hand-copied across `regroup/functions/src/entities/`,
  `regroup/mobile/src/entities/` and `regroup/web/src/app/entities/`.
- Callables are v2 `onCall` with zod validation through `parseInput`, which strips unknown keys without error.
- HTTP export names are URLs. External systems depend on them: Stripe Dashboard endpoints,
  hosting rewrites in `regroup/web/firebase.json`, and the launch config `regroup/e2e/launch-config.json`.
- `regroup/web/firebase.json` declares a second functions codebase (`web`) in the same Firebase project.
- Stripe metadata keys are a string convention between the code that creates a PaymentIntent or
  subscription and the webhook that reads it.

## push

### homegroups

Senders call `messaging` (from `homegroups/functions/src/utils/firebase.ts`) directly in callables, Firestore triggers, pubsub and scheduled jobs. Grep `data.type` / `type:` to find them.
The mobile router is `homegroups/mobile/src/services/notifications/NotificationHandler.ts`.

| If this changes                                    | Check                                                             | Why                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A new or renamed `data.type` on the server         | A matching case in `NotificationHandler.ts`                       | Unknown types fall through to a generic screen.                                      |
| A handler case that needs a field (e.g. `groupId`) | Every sender of that type includes the field                      | The handler returns early when a required field is missing, so the tap does nothing. |
| A handler case added on mobile                     | A server sender exists for that type                              | A case with no sender is dead code that looks like a feature.                        |
| Payload built from user content                    | No PII in the notification body beyond what the recipient may see | See classes 7 and 8.                                                                 |

### regroup

Senders: `regroup/functions/src/util/notifications.ts` (more than one payload shape),
`regroup/functions/src/scheduled/officerTermReminder.ts`, and the notify trigger in `regroup/functions/src/triggers/firestore/index.ts`.
Mobile: foreground handling in `regroup/mobile/src/screens/Splash/Splash.tsx`, channels in
`regroup/mobile/src/services/notifications/service.ts` and `regroup/mobile/src/services/notifications/rentReminder.ts`.

| If this changes                             | Check                                                                               | Why                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Android `channelId` in a server payload     | The channel ids the app actually creates                                            | A payload naming a channel the app never created is shown with fallback behaviour or not at all. |
| Payload shape (data-only vs `notification`) | `Splash.tsx` and any tap handling                                                   | Data-only messages need app code to display them.                                                |
| Device-token field read by the server       | The field mobile writes tokens to (`regroup/mobile/src/services/notifications.tsx`) | Both sides must use the same store.                                                              |
| A new `data.type`                           | A mobile consumer for it                                                            | Otherwise it is informational only. Say so instead of claiming a deep link.                      |

## deep-link

### homegroups

| Piece                       | Files                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native scheme registration  | `homegroups/mobile/ios/RecoveryConnect/Info.plist`, `homegroups/mobile/android/app/src/main/AndroidManifest.xml`                                    |
| Universal / App Links       | Intent filters in the manifest, `homegroups/web/public/.well-known/apple-app-site-association`, `homegroups/web/public/.well-known/assetlinks.json` |
| URL parsing                 | `homegroups/mobile/src/utils/url.ts`                                                                                                                |
| Linking prefixes and routes | `homegroups/mobile/App.tsx`                                                                                                                         |
| Server-built links          | `homegroups/functions/src/callable/generateGroupInvite.ts`, `homegroups/functions/src/callable/sendGroupInviteEmail.ts` (from `APP_BASE_URL`)       |
| Web routes                  | `homegroups/web/src/App.js`                                                                                                                         |
| Web → app return links      | `homegroups/web/src/lib/deepLinks.js`                                                                                                               |
| WebView ↔ web page messages | `homegroups/mobile/src/components/payments/SubscriptionWebView.tsx` ↔ `homegroups/web/src/pages/SubscribePage.js` (message names are strings)       |

Any new URL string, whether from a QR code, email, share sheet or web page, must use a registered scheme or App
Links host, be parsed by `url.ts`, and have a route in `App.tsx`. If it is an https link, the web app needs a route
for it too, for users without the app. Check the path shape (leading slash, `/join/CODE` vs `?code=`) on every side.
Parameters the target callable needs must be in the link.

### regroup

| Piece                        | Files                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link builders                | `regroup/functions/src/callable/invitations.ts`, `regroup/functions/src/util/inviteEmails.ts`, `regroup/functions/src/util/user.ts` (wrap in an https redirect URL) |
| Native registration          | `regroup/mobile/ios/rats/Info.plist`, `regroup/mobile/ios/rats/rats.entitlements`, `regroup/mobile/android/app/src/main/AndroidManifest.xml`                        |
| Association file             | `regroup/mobile/.well-known/apple-app-site-association` (universal-link association)                                                                                |
| Mobile handling              | `regroup/mobile/src/services/native-deep-links.ts`, `regroup/mobile/src/navigation/linking.ts`                                                                      |
| Web redirect page and routes | `regroup/web/src/app/components/redirect/redirect.component.ts`, `regroup/web/src/app/app-routing.module.ts`                                                        |

- If the link format or query keys change, check `native-deep-links.ts` parsing and the web redirect page.
- Links from mobile into web (for example billing) must match a route in `app-routing.module.ts`.
- Dev and prod builds use different schemes. A builder must pick the right one for the environment.

## origins-config

### homegroups

| If this changes                                                         | Check                                                                                                                                                                                                                                                                                                                                                                                | Why                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `APP_BASE_URL` default in `homegroups/functions/src/utils/appConfig.ts` | Stripe success, cancel and return URLs in `homegroups/functions/src/callable/createIntergroup.ts`, `homegroups/functions/src/callable/upgradeIntergroupTier.ts`, `homegroups/functions/src/callable/createCustomerPortalSession.ts`, `homegroups/functions/src/callable/createStripeAccountLink.ts`; billing emails in `homegroups/functions/src/utils/stripeUtils.ts`; invite links | Each one must land on a host and route that exists.                                     |
| `WEB_ORIGIN` in `homegroups/web/src/lib/deepLinks.js`                   | `APP_BASE_URL`, and hosts hard-coded in mobile                                                                                                                                                                                                                                                                                                                                       | Several sources of truth for the public host. A change to one should consider the rest. |
| A callable that accepts a client-sent return URL                        | Whether the server uses it or builds its own, and the allowlist if it uses it                                                                                                                                                                                                                                                                                                        | Open-redirect risk if client URLs are used unchecked. See class 11.                     |

### regroup

| If this changes                                                               | Check                                                                                                                   | Why                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ALLOWED_RETURN_ORIGINS` in `regroup/functions/src/validation/index.ts`       | The production entry in `regroup/e2e/launch-config.json`                                                                | The default must equal the production origin. No localhost or preview hosts in production.  |
| `CONNECT_BASE_URL` handling in `regroup/functions/src/util/connectUrls.ts`    | Rewrites in `regroup/web/firebase.json` and `CONNECT_BASE_URL` in launch config                                         | Three-way contract (see http-export).                                                       |
| Env var names in `regroup/functions/src/config.ts`                            | `regroup/functions/.env.example`, `regroup/e2e/scripts/gen-env.ts`, launch config                                       | Price ids are read by computed name. A renamed tier or interval changes the env key.        |
| Stripe publishable keys (`regroup/mobile/src/config/env.ts`, web environment) | Server secret key account and mode                                                                                      | Test vs live keys on different sides fail at payment time.                                  |
| Stripe API version                                                            | `regroup/functions/src/util/stripeApiVersion.ts` and every client constructed in `regroup/functions/src/util/stripe.ts` | Two Stripe clients exist (`regroup/functions/CLAUDE.md`).                                   |
| Emulator routing (`regroup/mobile/src/config/firebase-emulator.ts`)           | Which services are routed to the emulator in dev                                                                        | A service not routed to the emulator reaches a real project from a dev build. See class 11. |

## http-export

### homegroups

Exports in `homegroups/functions/src/http/`: `stripeWebhook.ts`, `googlePlacesProxy.ts`, `getMeetingAttendance.ts`.

| If this changes                             | Check                                                                              | Why                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Webhook export name or region               | Stripe Dashboard endpoint URL (not in repo: say it is unverifiable)                | Export name and region are the URL.                                    |
| `googlePlacesProxy` name or region          | The hard-coded URL in `homegroups/mobile/src/components/groups/LocationPicker.tsx` | The client builds project, region and name into a literal URL.         |
| Webhook writes to group subscription fields | Clients that read those fields, and the rules that guard them                      | The webhook is the writer of record. Clients must not also write them. |
| Bearer-key HTTP endpoints                   | The key is compared in constant time and never logged                              | See class 11.                                                          |

### regroup

| If this changes                                                                                                                                                        | Check                                                                                                                                                                                               | Why                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `stripeEvents` (deployed export; source symbol `stripeWebhook`, aliased in `regroup/functions/src/index.ts`) or `handleStripeConnectWebhook`                           | Stripe Dashboard endpoints and the `stripe:listen` script in `regroup/functions/package.json`                                                                                                       | The deployed name is the URL.                                                                                     |
| `stripeConnectReturn` / `stripeConnectReauth` in `regroup/functions/src/http/stripeConnect.ts`                                                                         | Rewrites in `regroup/web/firebase.json` (ordered above `**`), `RETURN_PATH` / `REFRESH_PATH` in `regroup/functions/src/util/connectUrls.ts`, `CONNECT_BASE_URL` in `regroup/e2e/launch-config.json` | Three-way contract. Renaming any piece breaks Connect onboarding.                                                 |
| `ssr` or the `codebase` split in `regroup/web/firebase.json`                                                                                                           | `regroup/firebase.json` functions config                                                                                                                                                            | Two codebases share a project. Dropping the split makes one deploy delete the other's functions.                  |
| Stripe metadata keys set at creation                                                                                                                                   | Readers in `regroup/functions/src/webhooks/stripeWebhook.ts`, `regroup/functions/src/webhooks/transferReversals.ts` and account deletion                                                            | Keys such as `guestId`, `houseId`, `rentAttemptId`, `userId`, `houseType`, `tier`, `billingInterval` route money. |
| Writers of metadata: `regroup/functions/src/callable/payments.ts`, `regroup/functions/src/scheduled/scheduledRentCollection.ts`, `regroup/functions/src/api/stripe.ts` | The webhook reads the same keys                                                                                                                                                                     | Reverse direction of the row above.                                                                               |
| Webhook event handling order                                                                                                                                           | Event claim before work, mark done after work (see class 2)                                                                                                                                         | Marking done first loses events on failure.                                                                       |
| Signature verification (`regroup/functions/src/util/verifyStripeWebhook.ts`, `regroup/functions/src/util/stripeWebhookSecrets.ts`)                                     | Raw body is used, and each endpoint uses its own secret                                                                                                                                             | See `regroup/functions/CLAUDE.md`.                                                                                |
| Payment documents written by both mobile and the webhook                                                                                                               | Same doc id and compatible fields from both writers                                                                                                                                                 | Two writers to one doc must not clobber each other.                                                               |

## shared-literals

String unions copied by hand. When one copy changes, check every copy in the same PR, matching exact strings and case.

### homegroups

| Literal                     | Copies                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting type                | `homegroups/functions/src/entities/Meeting.ts`, `homegroups/mobile/src/types/index.ts`, `homegroups/functions/src/utils/directoryMapping.ts`, the enum in `homegroups/functions/src/callable/findMeetings.ts` |
| Document shapes             | `homegroups/mobile/src/types/schema.ts` ↔ `homegroups/functions/src/entities/`                                                                                                                                |
| Transaction / vote / status | `income` / `expense`, vote enums in admin-removal and conscience-vote callables, announcement `published` / `scheduled`                                                                                       |
| Stripe subscription status  | Must match Stripe's spelling exactly wherever it is compared: functions and web pages                                                                                                                         |
| Notification setting keys   | Scheduled jobs that read them ↔ the user settings type in `homegroups/mobile/src/types/schema.ts`                                                                                                             |

### regroup

| Literal                           | Copies                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role                              | `regroup/functions/src/entities/`, `regroup/mobile/src/entities/`, `regroup/web/src/app/entities/`, plus the invitation role list in `regroup/functions/src/callable/invitations.ts` |
| Guest status                      | `regroup/mobile/src/entities/Guest.tsx` ↔ functions entity ↔ onGuestWrite's status checks                                                                                            |
| Meeting type                      | `regroup/functions/src/entities/Meeting.ts`, `regroup/mobile/src/entities/Meeting.tsx`, the zod schema in `regroup/functions/src/callable/meetings.ts`                               |
| HouseType, BillingInterval, tier  | functions (several files), `regroup/web/src/app/entities/TierCatalog.ts`, mobile entities                                                                                            |
| Subscription status               | `regroup/functions/src/api/firestore.ts`, `regroup/mobile/src/entities/User.tsx`, web strings                                                                                        |
| Entitlement ladder                | `regroup/functions/src/util/entitlement.ts` (authority), `regroup/mobile/src/hooks/useSubscriptionGate.ts`, `regroup/mobile/src/util/subscription.ts`                                |
| Paywall switch                    | server config doc, `regroup/mobile/src/services/paywall.ts`, `paywall.enabled` in `regroup/e2e/launch-config.json`                                                                   |
| Payment cap (`MAX_PAYMENT_CENTS`) | `regroup/functions/src/callable/payments.ts` ↔ `regroup/mobile/src/services/payments.ts`                                                                                             |
| Validation schemas                | `regroup/functions/src/validation/` ↔ the client payload types                                                                                                                       |

The server copy is the authority for entitlement and caps. A client-side gate that is looser or stricter than the
server is a UX bug, and a client-only gate is class 4.
