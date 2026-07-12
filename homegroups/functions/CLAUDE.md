# Cloud Functions

This directory contains the Firebase Cloud Functions backend for Homegroups. Loaded by Claude Code automatically when working inside `functions/`. See `../CLAUDE.md` for project-wide rules (including Stripe).

## Commands

```bash
npm run build                     # TypeScript compile
npm test                          # Jest unit tests
npm run test:rules                # Firestore security rules (requires emulator)
npm run deploy                    # Deploy all functions
npm run deploy:changed            # Deploy only changed functions (preferred)
npm run deploy:batch              # Batch deploy with script
npm run deploy:from               # Deploy from a specific function onward
npm run deploy:list               # List functions that would be deployed
```

## Architecture

Two function categories live under `src/`:

- **Callable** (`src/callable/`, 91 total): invoked directly by mobile and web clients via `firebase.functions().httpsCallable(name)`.
- **Triggers** (`src/triggers/`): event-driven — Firestore document writes (`firestore/`, 17 active + 2 commented out: onGroupAdminUpdate, onGroupCreateFetchMeetings), auth events (`auth/onUserCreated.ts`), Pub/Sub scheduled crons (`pubsub/`, 14 jobs), and one legacy `scheduled/scheduledAnnouncementPublisher.ts`.

HTTP-only functions live in `src/http/` and are NOT callables:

- `getMeetingAttendance.ts` — authenticated via `Authorization: Bearer <RATS_API_KEY>` (NOT Firebase Auth). The only function using this bearer-token pattern.
- `stripeWebhook.ts` — exports both `stripeWebhook` and `stripeConnectWebhook`; authenticated via Stripe signature verification.

Shared utilities live in `src/utils/`: `firebase.ts`, `stripe.ts`, `stripeUtils.ts`, `location.ts`. All exports are wired through `src/index.ts`.

### Callable auth/validation

All callables use the shared `requireAuth`/`validateData` wrapper from `src/utils/callableWrapper.ts` (rolled out in Wave 6) for the base "is there a signed-in caller" check and, where client input is written to Firestore, Zod schema validation. Group-admin, role, ownership, and custom-claim checks remain individual per-callable business logic — the wrapper does not attempt to unify those. `getPublicGroupProfile.ts` and `submitPartnershipLead.ts` are intentionally unauthenticated by design and do not use `requireAuth`.

## Domain Rules

### Stripe-related code that lives here

- `productIdGroup`, `productIdIntergroupA`, `productIdIntergroupB` are all exported from `src/utils/stripe.ts`. Price IDs must be fetched at runtime via `getDefaultPriceForProduct()` — never hardcoded.
- The `createIntergroup` callable handles both intergroup tier-A/B checkout AND treatment-center onboarding (`type: "treatment_center"`). It accepts optional `successUrl` / `cancelUrl` validated against `ALLOWED_REDIRECT_ORIGINS`.
- The `upgradeIntergroupTier` callable handles tier-A → tier-B upgrades and checks `adminUids` on the intergroup document.

### Custom JWT Claims

Claims have a **1000-byte limit**. The `onMemberWrite` trigger (`src/triggers/firestore/onMemberWrite.ts`) syncs claims and enforces this limit. When claims exceed the limit, Firestore security rules fall back to document reads.

### Callable v1 vs v2 syntax

When a callable needs a non-default `region`, `memory`, `cpu`, or `timeoutSeconds`, use the **v2** form:

```ts
import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const myCallable = onCall(
  { region: "us-west1", memory: "512MiB", timeoutSeconds: 60 },
  async (request: CallableRequest<MyData>) => { ... },
);
```

The v1 form `functions.https.onCall(config, handler)` accepts the config object at the call site but **silently ignores `region`** at deploy time — the function lands in `us-central1` regardless. See `joinGroupByInviteCode.ts` / `sendGroupInviteEmail.ts` for canonical v2 examples (refs: audit D-10).

### Facility / Treatment-Center Dashboard

Three callables in `src/callable/`:

- `getFacilityEngagementMetrics` — engagement aggregation
- `getFacilityStats` — anonymized stats
- `exportFacilityComplianceReport` — export

All three gate on `intergroup.adminUids.includes(request.auth.uid)`.

## Testing

- Unit tests: `npm test` (Jest).
- Firestore rules tests: `npm run test:rules` wraps `firebase emulators:exec --only firestore` — emulator starts/stops automatically.
