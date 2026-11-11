# Staging operator command: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run e2e:staging-operator` in `regroup/e2e` signs up a new operator on staging (`regroup-e2e`), subscribes them through the deployed `createOperatorSubscription` with a Stripe test card, confirms they can create houses, and prints their sign-in details.

**Architecture:** The pure parts are each in their own module, and every one is unit-tested:

- plan choice and validation;
- the staging config guard;
- the operator user document;
- the entitlement check.

One HTTP client wraps staging's three endpoints, behind an injected `fetch`:

- the Auth REST signup;
- Firestore REST create and read, with the user's ID token, so the security rules apply;
- the callable over HTTPS.

A `run` function joins them with injected dependencies, and a thin script wires in real ones.

**Tech Stack:** Node 22, TypeScript, Jest with ts-jest (the existing `regroup/e2e` setup). The global `fetch` is used, and no new dependencies are added.

**Spec:** `docs/superpowers/specs/2026-11-09-regroup-staging-operator-design.md`

## Global Constraints

- The target is fixed to the project id `regroup-e2e`. Refuse any other project id from any source.
- The command holds no Stripe secret. Staging's functions make every Stripe call.
- No houses, residents, invitations or cleanup are created. It doesn't run in CI.
- Never write a non-empty `subscriptionMetadata` from the client. Only `createOperatorSubscription` sets it. The rules (`regroup/mobile/firebase/firestore.rules`, `users` create) allow only an empty `status`, `customerId` and `subscriptionId`, and an empty `houses` map.
- Read staging config from `~/.config/regroup-e2e/firebase-web-config.json`, and refuse with a pointer to that folder if it's missing.
- Print credentials only to the terminal. Use fake addresses only.
- The output says that each run makes staging email admin@regroup-app.com about a new subscription.
- New files stay under 300 lines. Commit scope is `regroup-e2e`. Commits end with `Claude-Session: https://claude.ai/code/session_011RPBdxW11Vt8nJe1ip5BUk`.
- Tests live in `regroup/e2e/src/__tests__/*.test.ts`. Run them with `cd regroup/e2e && npx jest <file>`, and type-check with `npx tsc --noEmit -p .`.

## Review Focus

1. **Firestore REST value encoding:** an empty map (`houses: {}`), `null` (`houseCode`), booleans and nested maps must round-trip, or the rules reject the create. This is pinned in Task 3: `encodes the operator doc so the rules' empty-subscription shape survives`.
2. **The subscription fails after the account exists**, for example on a decline or a validation error. Expect a non-zero exit that names the failed step and prints the orphaned email and uid; there's no cleanup, per the spec. This is pinned in Task 4: `reports a failed subscription with the account it left behind`.
3. **The callable's error envelope:** an HTTP 200 with `{"error":{...}}`, or a non-2xx with the same body. Either one must raise the server's `message`. This is pinned in Task 3: `raises the callable's error message`.
4. **The config's `projectId` isn't `regroup-e2e`,** or the file is missing. Expect a refusal before any network call. This is pinned in Task 2 and Task 4: `refuses before signing up when the config is not staging`.
5. **The readback isn't entitled**, for example status `incomplete` or no `tier`. Expect a loud failure, not printed credentials. This is pinned in Task 4: `fails when the subscribed user cannot create houses`.

---

### Task 0: Commit the design

- [ ] Commit the spec and this plan with `docs(regroup-e2e): staging operator design and plan`.

### Task 1: Plan choice

**Files:**

- Create: `regroup/e2e/src/stagingOperator/plan.ts`
- Test: `regroup/e2e/src/__tests__/stagingOperatorPlan.test.ts`

**Interfaces:**

- Produces:
  - `type HouseType = 'traditional' | 'oxford'`;
  - `type BillingInterval = 'month' | 'year'`;
  - `interface OperatorPlan { houseType: HouseType; tier: string; interval: BillingInterval }`;
  - `const PLANS_FOR_SALE: Readonly<Record<HouseType, readonly string[]>>`;
  - `parseOperatorArgs(argv: readonly string[]): OperatorPlan`, which throws `Error` with a usage message that lists the valid choices.

- [ ] **Step 1: Write the failing tests**
  - `parses --house-type traditional --tier professional --interval year` gives `{ houseType: 'traditional', tier: 'professional', interval: 'year' }`.
  - `defaults the interval to month` when `--interval` is absent.
  - `refuses a tier that is not for sale`: `oxford` with `network` throws a message containing `standard, plus`.
  - `refuses an unknown house type, tier or interval, or a missing flag`: for example `--interval annual` throws a message containing `month, year`. An unknown flag also throws.
  - `matches the tiers for sale in functions/src/config.ts`: read `../../../functions/src/config.ts` as text, the same way `launchConfig.test.ts` reads `stripeApiVersion.ts`. Take each house type's tier keys under `SUBSCRIPTION_TIERS`, drop any whose block has `availableForSale: false`, and expect the result to equal `PLANS_FOR_SALE`, which is `{ traditional: ['starter','professional','enterprise'], oxford: ['standard','plus'] }`. To parse it, slice from `export const SUBSCRIPTION_TIERS = {` to the next line that is exactly `};`. House keys are the lines matching `^  (\w+): \{`, and tier keys are the lines matching `^    (\w+): \{` under each house. A tier's block runs to the next tier or house key; drop the tier when that block contains `availableForSale: false`.
- [ ] **Step 2: Run them.** `npx jest stagingOperatorPlan`, expected to FAIL because the module isn't found.
- [ ] **Step 3: Implement `plan.ts`.** Flags take the `--name value` form only.
- [ ] **Step 4: Run them.** Expected to PASS. Then run `npx tsc --noEmit -p .`, expected to be clean.
- [ ] **Step 5: Commit** with `feat(regroup-e2e): choose and validate a staging operator's plan`.

### Task 2: Staging config, operator doc, entitlement

**Files:**

- Create: `regroup/e2e/src/stagingOperator/staging.ts`
- Test: `regroup/e2e/src/__tests__/stagingOperatorStaging.test.ts`

**Interfaces:**

- Produces:
  - `const STAGING_PROJECT_ID = 'regroup-e2e'`;
  - `interface StagingConfig { apiKey: string; projectId: 'regroup-e2e' }`;
  - `readStagingConfig(file: string, read?: (f: string) => string): StagingConfig`;
  - `buildOperatorUserDoc(uid: string, email: string): Record<string, unknown>`;
  - `canCreateHouses(meta: unknown): boolean`;
  - `newOperatorCredentials(now: Date, random: (bytes: number) => Buffer): { email: string; password: string }`.

- [ ] **Step 1: Write the failing tests**
  - `readStagingConfig` returns `{ apiKey, projectId }` for a file whose `projectId` is `regroup-e2e`.
  - It throws, with a message containing `~/.config/regroup-e2e`, for a missing file, for invalid JSON, for an empty `apiKey`, and for any other `projectId`, such as `phoenix-cleanhouse`.
  - `buildOperatorUserDoc('u1','a@rats-e2e.com')` returns the web signup's shape, which is `createSuperAdmin` plus `convertFirebaseUserToRatsUser` in `regroup/web/src/app/services/auth/auth-service.service.ts`:
    - `id` and `uid` are `'u1'`;
    - `email` and `billingEmail` are the email;
    - `isSuperAdmin`, `potentialSuperAdmin`, `termsOfService` and `emailVerified` are `true`;
    - `isAdmin`, `houseAccountVerified` and `isAnonymous` are `false`;
    - `houseCode` is `null`;
    - `subscriptionMetadata` equals `{ subscriptionId: '', currentPeriodEnd: 0, status: '', customerId: '', items: { guestItemId: '', houseItemId: '' }, houses: {} }`;
    - there's no `password` key.
  - `canCreateHouses` is true only with a non-empty `tier` and a `status` of `active` or `trialing`, which is the server's `assertCanCreateHouses` after `operatorStatusToHouseStatus`. It's false for `incomplete`, `cancelling`, an empty status, no tier, `null`, and a non-object.
  - `newOperatorCredentials(new Date('2026-11-09T22:05:07Z'), () => Buffer.alloc(n, 0xab))` returns an email `operator-20261109-220507-abab@rats-e2e.com` and a password of at least 20 characters, made from the random bytes as base64url.
- [ ] **Step 2: Run them.** `npx jest stagingOperatorStaging`, expected to FAIL.
- [ ] **Step 3: Implement `staging.ts`.**
- [ ] **Step 4: Run them.** Expected to PASS, with `tsc` clean.
- [ ] **Step 5: Commit** with `feat(regroup-e2e): staging config guard, operator doc and entitlement check`.

### Task 3: Staging HTTP client

**Files:**

- Create: `regroup/e2e/src/stagingOperator/stagingClient.ts`
- Test: `regroup/e2e/src/__tests__/stagingOperatorClient.test.ts`

**Interfaces:**

- Consumes: `StagingConfig` (Task 2).
- Produces:
  - `type FetchFn = typeof fetch`;
  - `interface StagingClient { signUp(email: string, password: string): Promise<{ uid: string; idToken: string }>; createUserDoc(idToken: string, uid: string, doc: Record<string, unknown>): Promise<void>; readUserDoc(idToken: string, uid: string): Promise<Record<string, unknown>>; callFunction<T>(idToken: string, name: string, data: unknown): Promise<T> }`;
  - `createStagingClient(config: StagingConfig, fetchFn: FetchFn): StagingClient`;
  - `toFirestoreFields(value: Record<string, unknown>): Record<string, unknown>` and `fromFirestoreFields(fields: Record<string, unknown>): Record<string, unknown>`.

The endpoints, with `<p>` = `regroup-e2e`:

- **Signup:** `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<apiKey>` with body `{ email, password, returnSecureToken: true }`. It returns `localId` and `idToken`.
- **Create the user doc:** `POST https://firestore.googleapis.com/v1/projects/<p>/databases/(default)/documents/users?documentId=<uid>`.
- **Read it back:** `GET https://firestore.googleapis.com/v1/projects/<p>/databases/(default)/documents/users/<uid>`.
- **Call a function:** `POST https://us-central1-<p>.cloudfunctions.net/<name>` with body `{ data }`. It returns `{ result }`, or `{ error: { status, message } }`.
- All calls except signup send `Authorization: Bearer <idToken>`.

- [ ] **Step 1: Write the failing tests**, with a fake `fetchFn` that records each request.
  - `encodes the operator doc so the rules' empty-subscription shape survives`:
    - `fromFirestoreFields(toFirestoreFields(buildOperatorUserDoc(...)))` deep-equals the input;
    - `houses` is encoded as `{ mapValue: {} }`, `houseCode` as `{ nullValue: null }`, `true` as `{ booleanValue: true }` and `0` as `{ integerValue: '0' }`.
  - `signs up with the API key and returns the uid and token`: checks the URL, the method and the body above.
  - `creates the user doc as the user`: checks the URL with `documentId`, the Bearer header, and a `fields` body.
  - `calls a function and returns its result`.
  - `raises the callable's error message`: both a 200 `{ error: { message: 'Card declined' } }` and a 400 with the same body reject with an `Error` whose message contains `Card declined`.
  - `raises Auth and Firestore errors with their status and message`: a 400 `{ error: { message: 'EMAIL_EXISTS' } }` rejects with a message containing `EMAIL_EXISTS`.
- [ ] **Step 2: Run them.** `npx jest stagingOperatorClient`, expected to FAIL.
- [ ] **Step 3: Implement `stagingClient.ts`.** It never logs a request body or token. Errors carry only the endpoint name, the status and the server's message.
- [ ] **Step 4: Run them.** Expected to PASS, with `tsc` clean.
- [ ] **Step 5: Commit** with `feat(regroup-e2e): staging client for signup, Firestore and callables`.

### Task 4: Run it end to end, the CLI and the docs

**Files:**

- Create: `regroup/e2e/src/stagingOperator/run.ts`, `regroup/e2e/scripts/staging-operator.ts`
- Modify: `regroup/e2e/package.json`, adding the script `"e2e:staging-operator": "ts-node scripts/staging-operator.ts"`
- Modify: `regroup/mobile/maestro/README.md`, adding a short "Staging operator for manual testing" section
- Test: `regroup/e2e/src/__tests__/stagingOperatorRun.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces:
  - `const TEST_PAYMENT_METHOD = 'pm_card_visa'`;
  - `interface RunDeps { argv: readonly string[]; configFile: string; readFile: (f: string) => string; makeClient: (c: StagingConfig) => StagingClient; now: () => Date; random: (n: number) => Buffer }`;
  - `interface RunResult { email: string; password: string; uid: string; plan: OperatorPlan; customerId: string; subscriptionId: string; status: string }`;
  - `runStagingOperator(deps: RunDeps): Promise<RunResult>`;
  - `formatRunResult(r: RunResult): string`.

The run's order:

1. Parse the plan.
2. Read the config.
3. Make the credentials.
4. `signUp`.
5. `createUserDoc(buildOperatorUserDoc)`.
6. `callFunction('createOperatorSubscription', { user: { id, email, subscriptionMetadata: doc.subscriptionMetadata }, paymentMethod: TEST_PAYMENT_METHOD, houseType, tier, billingInterval: interval })`.
7. `readUserDoc`.
8. `canCreateHouses(doc.subscriptionMetadata)`, otherwise throw.

A failure after step 4 throws an `Error` whose message names the step and includes the email and uid that were left behind.

- [ ] **Step 1: Write the failing tests**, with a fake `StagingClient`.
  - `subscribes a new operator and returns their sign-in details`: the calls arrive in the order above, with the callable data exactly as above, and the result carries the readback's `customerId`, `subscriptionId` and `status`.
  - `refuses before signing up when the plan is invalid` (`--tier network --house-type oxford`), and `refuses before signing up when the config is not staging`. In both cases the fake records no call.
  - `reports a failed subscription with the account it left behind`: the callable rejects with `Card declined`. The error message contains `createOperatorSubscription`, `Card declined`, the email and the uid.
  - `fails when the subscribed user cannot create houses`: the readback has status `incomplete`. It rejects with a message containing `cannot create houses`.
  - `formatRunResult` prints the email, password, uid, plan, customer and subscription ids. It names the `E2EStaging` build (`com.rats.dev.e2e.stg`) and says sign-in lands on OrgSetup. It includes the line about the admin@regroup-app.com email.
- [ ] **Step 2: Run them.** `npx jest stagingOperatorRun`, expected to FAIL.
- [ ] **Step 3: Implement `run.ts`, then the script.** The script wires real dependencies: `os.homedir()/.config/regroup-e2e/firebase-web-config.json`, `fs.readFileSync`, `createStagingClient(c, fetch)`, `crypto.randomBytes` and `new Date()`. It prints `formatRunResult` on success. On failure it prints `staging-operator: <message>` and exits 1. Add the npm script. Then add the README section: the command, its flags, the valid plans, that it's staging and test mode only, and the admin email note.
- [ ] **Step 4: Run them**, then the whole package: `npx jest` and `npx tsc --noEmit -p .`. Expected to PASS, with every existing suite still green.
- [ ] **Step 5: Commit** with `feat(regroup-e2e): e2e:staging-operator command, with its README section`.

### Task 5: One real run on staging

No code. It proves the command against the deployed staging functions.

- [ ] **Step 1:** In `regroup/e2e`, run `npm ci`, then `npm run e2e:staging-operator -- --house-type traditional --tier starter`.
      Expected: it prints the credentials, and the status is `trialing`.
- [ ] **Step 2:** Check the readback independently. Use the Firebase MCP's `firestore_get_document` on project `regroup-e2e`, path `users/<uid>`, to confirm that `users/<uid>.subscriptionMetadata` has `tier: 'starter'`, a `customerId` starting `cus_` and a `subscriptionId` starting `sub_`.
      If `pm_card_visa` is refused by the SetupIntent check, record the Stripe message. Switch `TEST_PAYMENT_METHOD` to the test-mode method it accepts, add a Task 4 test for that value, and rerun.
- [ ] **Step 3:** Hand the printed email and password to the owner, for signing into the `E2EStaging` build. The owner confirms that sign-in lands on OrgSetup with no plan-required panel.
