# Homegroups Wave 4: Money-Critical Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk test-coverage gaps in `homegroups/functions` and `homegroups/mobile` — the six untested Stripe Connect account-management callables, the three untested treasurer-handoff callables, the untested treasury update/delete thunks, and the `homegroups/web` CI gap — before launch.

**Architecture:** Every task adds characterization tests against code that already exists and is already deployed; no production behavior changes except where a task explicitly says so. Functions tests mock `firebase-admin`, `firebase-functions/v2/https`, `../utils/firebase` (the shared `db`/`messaging` handles), and `../utils/stripe` (the shared Stripe client) at the module boundary, following the exact pattern already used in `createGroupSubscription.test.ts`. Mobile tests mock `TreasuryModel` and exercise the real `transactionsSlice` reducer via `configureStore`.

**Tech Stack:** Jest, TypeScript, Firebase Cloud Functions v2 (`onCall`/`HttpsError`), Redux Toolkit (`createAsyncThunk`), GitHub Actions.

## Global Constraints

- Test files for `homegroups/functions` go in `homegroups/functions/src/__tests__/` (confirmed majority convention; `testMatch: ["**/*.test.ts"]` picks up both `__tests__/` and `tests/`, but every existing Stripe-callable test lives in `__tests__/`).
- Two distinct `onCall` mock shapes are required depending on the callable — see "Critical mock-shape finding" below. Using the wrong one silently returns `undefined` instead of failing loudly, so get this right per task.
- No production code changes in this plan except Task 11 (CI workflow only). If a test surfaces a real bug (see "Bugs Found" at the end), do not fix it inline — flag it and stop for a decision, per this plan's own Task 12.
- Every new test file must pass in isolation (`npx jest <file>`) before commit — do not batch multiple new files into one commit.

**Critical mock-shape finding:** the `firebase-functions/v2/https` mock used in `createGroupSubscription.test.ts` (`onCall: (opts, handler) => handler`) only works for callables that pass an **options object** to `onCall(options, handler)`. Six target callables — `getStripeAccountDetails`, `getStripeAccountInfo`, `createStripePaymentIntent`, `initiateTreasurerHandoff`, `completeTreasurerHandoff`, `cancelTreasurerHandoff` — call `onCall(handler)` with **no options object**. Use this corrected mock for those six (each task below states which shape to use):

```ts
jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));
```

For the four callables that DO pass an options object (`createStripeAccountLink`, `getStripeAccountMetrics`, `reactivateGroupSubscription`, `createCustomerPortalSession`), use the simpler existing pattern:

```ts
jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));
```

## File Structure

- Create: `homegroups/functions/src/__tests__/createStripeAccountLink.test.ts`
- Create: `homegroups/functions/src/__tests__/getStripeAccountDetails.test.ts`
- Create: `homegroups/functions/src/__tests__/getStripeAccountInfo.test.ts`
- Create: `homegroups/functions/src/__tests__/getStripeAccountMetrics.test.ts`
- Create: `homegroups/functions/src/__tests__/createStripePaymentIntent.test.ts`
- Create: `homegroups/functions/src/__tests__/reactivateGroupSubscription.test.ts`
- Create: `homegroups/functions/src/__tests__/createCustomerPortalSession.test.ts`
- Create: `homegroups/functions/src/__tests__/initiateTreasurerHandoff.test.ts`
- Create: `homegroups/functions/src/__tests__/completeTreasurerHandoff.test.ts`
- Create: `homegroups/functions/src/__tests__/cancelTreasurerHandoff.test.ts`
- Create: `homegroups/mobile/src/store/slices/__tests__/transactionsSlice.crud.test.ts`
- Modify: `.github/workflows/ci.yml` (add `homegroups-web` job)

---

### Task 1: createStripeAccountLink

**Files:**

- Create: `homegroups/functions/src/__tests__/createStripeAccountLink.test.ts`

**Interfaces:**

- Consumes: `createStripeAccountLink = onCall({ region: "us-central1", memory: "256MiB", timeoutSeconds: 60 }, async (request: CallableRequest<{ groupId: string }>) => ...)` from `src/callable/createStripeAccountLink.ts`. Uses the **options-object** mock shape.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAccountsCreate = jest.fn();
const mockAccountLinksCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { create: mockAccountsCreate },
    accountLinks: { create: mockAccountLinksCreate },
  },
}));

jest.mock("../utils/appConfig", () => ({
  APP_BASE_URL: "https://homegroups-app.com",
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockDocUpdate,
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid, token: {} } : null, data };
}

describe("createStripeAccountLink", () => {
  const groupId = "group-connect-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, { name: "Test Group", admins: [userId] });
    mockAccountsCreate.mockResolvedValue({ id: "acct_new_123" });
    mockAccountLinksCreate.mockResolvedValue({
      url: "https://connect.stripe.com/setup/acct_new_123",
    });
    mockDocUpdate.mockResolvedValue(undefined);
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not a group admin", async () => {
    setDoc("groups", groupId, { name: "Test Group", admins: ["someone-else"] });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("falls back to adminUids when admins is absent", async () => {
    setDoc("groups", groupId, { name: "Test Group", adminUids: [userId] });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).resolves.toMatchObject({ url: expect.any(String) });
  });

  it("creates a new Connect Express account with a deterministic idempotency key when none exists", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = mockAccountsCreate.mock.calls[0];
    expect(params).toMatchObject({
      type: "express",
      metadata: { groupId },
      capabilities: { transfers: { requested: true } },
    });
    expect(opts).toMatchObject({ idempotencyKey: `connect-acct-${groupId}` });
  });

  it("saves the new stripeConnectAccountId onto the group doc", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockDocUpdate).toHaveBeenCalledWith({
      stripeConnectAccountId: "acct_new_123",
    });
  });

  it("reuses an existing stripeConnectAccountId without calling accounts.create", async () => {
    setDoc("groups", groupId, {
      name: "Test Group",
      admins: [userId],
      stripeConnectAccountId: "acct_existing_456",
    });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockAccountsCreate).not.toHaveBeenCalled();
    const linkArgs = mockAccountLinksCreate.mock.calls[0][0];
    expect(linkArgs.account).toBe("acct_existing_456");
  });

  it("builds refresh_url/return_url with the groupId and account_onboarding type", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    const linkArgs = mockAccountLinksCreate.mock.calls[0][0];
    expect(linkArgs.type).toBe("account_onboarding");
    expect(linkArgs.refresh_url).toContain(`groupId=${groupId}`);
    expect(linkArgs.return_url).toContain(`groupId=${groupId}`);
  });

  it("returns the onboarding url on success", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    const result = await (createStripeAccountLink as any)(
      makeRequest(userId, { groupId }),
    );
    expect(result.url).toBe("https://connect.stripe.com/setup/acct_new_123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest createStripeAccountLink`
Expected: FAIL (file does not exist yet before Step 1 is saved; after saving, if it fails for any other reason than "file not found," stop and investigate the mock shape against the real callable source before proceeding).

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest createStripeAccountLink`
Expected: PASS — the callable already exists in production; this is characterization coverage, not new implementation. If any test fails against real behavior, read `src/callable/createStripeAccountLink.ts` directly and correct the test's expectations to match reality (do not change production code in this task).

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/createStripeAccountLink.test.ts
git commit -m "test(homegroups-functions): add coverage for createStripeAccountLink"
```

---

### Task 2: getStripeAccountDetails + getStripeAccountInfo

**Files:**

- Create: `homegroups/functions/src/__tests__/getStripeAccountDetails.test.ts`
- Create: `homegroups/functions/src/__tests__/getStripeAccountInfo.test.ts`

**Interfaces:**

- Consumes: `getStripeAccountDetails = onCall(async (request: CallableRequest<{ accountId?, includeBalance?, includeCharges?, includeCustomers?, includeSubscriptions?, includeProducts?, includePrices? }>) => ...)`. Uses the **single-arg** mock shape (see Global Constraints).
- Consumes: `getStripeAccountInfo = onCall(async (request: CallableRequest<{}>) => ...)`. Uses the **single-arg** mock shape.

Both are **super-admin-only, platform-wide** reads gated on `request.auth.token.superAdmin === true` — neither takes nor checks a `groupId`. This is a deliberate scope difference from the group-scoped callables in Task 1; don't "fix" it as a bug.

- [ ] **Step 1: Write the failing test**

`getStripeAccountDetails.test.ts`:

```ts
export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAccountsRetrieve = jest.fn();
const mockBalanceRetrieve = jest.fn();
const mockChargesList = jest.fn();
const mockCustomersList = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockProductsList = jest.fn();
const mockPricesList = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { retrieve: mockAccountsRetrieve },
    balance: { retrieve: mockBalanceRetrieve },
    charges: { list: mockChargesList },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
    products: { list: mockProductsList },
    prices: { list: mockPricesList },
  },
}));

function makeRequest(
  uid: string | null,
  superAdmin: boolean,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { superAdmin } } : null, data };
}

describe("getStripeAccountDetails", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      type: "standard",
      country: "US",
      default_currency: "usd",
      email: "ops@homegroups-app.com",
      business_type: "company",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: 1700000000,
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({ available: [], pending: [] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied if caller is not a super admin", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws invalid-argument for a malformed accountId", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await expect(
      (getStripeAccountDetails as any)(
        makeRequest(userId, true, { accountId: "not-a-stripe-id" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("returns only the platform account by default (includeBalance defaults true, rest false)", async () => {
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    const result = await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {}),
    );

    expect(mockAccountsRetrieve).toHaveBeenCalledWith();
    expect(mockBalanceRetrieve).toHaveBeenCalledTimes(1);
    expect(mockChargesList).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data.account.id).toBe("acct_platform");
  });

  it("projects only safe account fields (no raw Stripe object leakage)", async () => {
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      type: "standard",
      country: "US",
      default_currency: "usd",
      email: "ops@homegroups-app.com",
      business_type: "company",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      created: 1700000000,
      capabilities: {},
      requirements: {},
      individual: { ssn_last_4_provided: true, id_number_provided: true },
      tos_acceptance: { ip: "1.2.3.4" },
    });
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    const result = await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.account.individual).toBeUndefined();
    expect(result.data.account.tos_acceptance).toBeUndefined();
  });

  it("fetches charges when includeCharges is true, scoped to accountId via stripeAccount", async () => {
    mockChargesList.mockResolvedValue({ data: [] });
    jest.resetModules();
    const { getStripeAccountDetails } =
      await import("../callable/getStripeAccountDetails");
    await (getStripeAccountDetails as any)(
      makeRequest(userId, true, {
        accountId: "acct_ABC123",
        includeCharges: true,
      }),
    );

    expect(mockChargesList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_ABC123" }),
    );
  });
});
```

`getStripeAccountInfo.test.ts` — same mock header as above, mocking `stripe.{accounts.retrieve, balance.retrieve, charges.list, customers.list, subscriptions.list}`:

```ts
export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAccountsRetrieve = jest.fn();
const mockBalanceRetrieve = jest.fn();
const mockChargesList = jest.fn();
const mockCustomersList = jest.fn();
const mockSubscriptionsList = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { retrieve: mockAccountsRetrieve },
    balance: { retrieve: mockBalanceRetrieve },
    charges: { list: mockChargesList },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
  },
}));

function makeRequest(
  uid: string | null,
  superAdmin: boolean,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { superAdmin } } : null, data };
}

describe("getStripeAccountInfo", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    await expect(
      (getStripeAccountInfo as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied without superAdmin claim", async () => {
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    await expect(
      (getStripeAccountInfo as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("aggregates account, balance, and recentActivity on success", async () => {
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({
      available: [],
      pending: [],
      instant_available: [],
    });
    mockChargesList.mockResolvedValue({ data: [] });
    mockCustomersList.mockResolvedValue({ data: [] });
    mockSubscriptionsList.mockResolvedValue({ data: [] });
    jest.resetModules();
    const { getStripeAccountInfo } =
      await import("../callable/getStripeAccountInfo");
    const result = await (getStripeAccountInfo as any)(
      makeRequest(userId, true, {}),
    );
    expect(result.success).toBe(true);
    expect(result.account.id).toBe("acct_platform");
    expect(result.recentActivity).toEqual({
      charges: [],
      customers: [],
      subscriptions: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest getStripeAccountDetails getStripeAccountInfo`
Expected: FAIL (no prior test files)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest getStripeAccountDetails getStripeAccountInfo`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/getStripeAccountDetails.test.ts homegroups/functions/src/__tests__/getStripeAccountInfo.test.ts
git commit -m "test(homegroups-functions): add coverage for getStripeAccountDetails and getStripeAccountInfo"
```

---

### Task 3: getStripeAccountMetrics

**Files:**

- Create: `homegroups/functions/src/__tests__/getStripeAccountMetrics.test.ts`

**Interfaces:**

- Consumes: `getStripeAccountMetrics = onCall({ cpu: 0.5, memory: "256MiB", timeoutSeconds: 60, region: "us-central1" }, async (request: CallableRequest<{ accountId?, startDate?, endDate? }>) => ...)`. Uses the **options-object** mock shape.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockAccountsRetrieve = jest.fn();
const mockBalanceRetrieve = jest.fn();
const mockChargesList = jest.fn();
const mockCustomersList = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockProductsList = jest.fn();
const mockPricesList = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { retrieve: mockAccountsRetrieve },
    balance: { retrieve: mockBalanceRetrieve },
    charges: { list: mockChargesList },
    customers: { list: mockCustomersList },
    subscriptions: { list: mockSubscriptionsList },
    products: { list: mockProductsList },
    prices: { list: mockPricesList },
  },
}));

function makeRequest(
  uid: string | null,
  superAdmin: boolean,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { superAdmin } } : null, data };
}

describe("getStripeAccountMetrics", () => {
  const userId = "admin-uid";

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountsRetrieve.mockResolvedValue({
      id: "acct_platform",
      capabilities: {},
      requirements: {},
    });
    mockBalanceRetrieve.mockResolvedValue({});
    mockChargesList.mockResolvedValue({
      data: [
        { id: "ch_1", status: "succeeded", amount: 1200 },
        { id: "ch_2", status: "failed", amount: 500 },
      ],
    });
    mockCustomersList.mockResolvedValue({ data: [{ id: "cus_1" }] });
    mockSubscriptionsList.mockResolvedValue({
      data: [
        { id: "sub_1", status: "active" },
        { id: "sub_2", status: "trialing" },
        { id: "sub_3", status: "canceled" },
      ],
    });
    mockProductsList.mockResolvedValue({ data: [] });
    mockPricesList.mockResolvedValue({ data: [] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(makeRequest(null, false)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws permission-denied without superAdmin claim", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(makeRequest(userId, false)),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws invalid-argument for a malformed startDate", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(
        makeRequest(userId, true, { startDate: "not-a-date" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when startDate is after endDate", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await expect(
      (getStripeAccountMetrics as any)(
        makeRequest(userId, true, {
          startDate: "2026-06-01",
          endDate: "2026-01-01",
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("defaults to a 30-day window when no dates are given", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    const range = result.data.summary.dateRange;
    const spanDays =
      (new Date(range.end).getTime() - new Date(range.start).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(spanDays).toBeCloseTo(30, 0);
  });

  it("computes charge success/failure counts and total revenue from successful charges only", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.charges).toMatchObject({
      total: 2,
      successful: 1,
      failed: 1,
      totalAmount: 1200,
    });
    expect(result.data.summary.totalRevenue).toBe(1200);
    expect(result.data.summary.successRate).toBe(50);
  });

  it("splits subscriptions into active/trialing/canceled buckets", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    const result = await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, {}),
    );

    expect(result.data.subscriptions).toMatchObject({
      total: 3,
      active: 1,
      trialing: 1,
      canceled: 1,
    });
  });

  it("scopes every Stripe list call to the given accountId", async () => {
    jest.resetModules();
    const { getStripeAccountMetrics } =
      await import("../callable/getStripeAccountMetrics");
    await (getStripeAccountMetrics as any)(
      makeRequest(userId, true, { accountId: "acct_XYZ789" }),
    );

    expect(mockChargesList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_XYZ789" }),
    );
    expect(mockCustomersList).toHaveBeenCalledWith(
      expect.objectContaining({ stripeAccount: "acct_XYZ789" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest getStripeAccountMetrics`
Expected: FAIL (no prior test file)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest getStripeAccountMetrics`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/getStripeAccountMetrics.test.ts
git commit -m "test(homegroups-functions): add coverage for getStripeAccountMetrics"
```

---

### Task 4: createStripePaymentIntent

**Files:**

- Create: `homegroups/functions/src/__tests__/createStripePaymentIntent.test.ts`

**Interfaces:**

- Consumes: `createStripePaymentIntent = onCall(async (request: CallableRequest<{ groupId: string; amount: number }>) => ...)` — `amount` in cents, `50 <= amount <= 100_000`. Uses the **single-arg** mock shape.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockCustomersCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: { create: mockCustomersCreate },
    paymentIntents: { create: mockPaymentIntentsCreate },
  },
  PLATFORM_FEE_PERCENT: 0.05,
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockUserUpdate = jest.fn().mockResolvedValue(undefined);
const mockDonationSet = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockUserUpdate,
    collection: (_sub: string) => ({
      doc: () => ({ id: "donation-auto-id", set: mockDonationSet }),
    }),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(
  uid: string | null,
  email: string | null,
  data: Record<string, any> = {},
): any {
  return { auth: uid ? { uid, token: { email } } : null, data };
}

describe("createStripePaymentIntent", () => {
  const groupId = "group-donate-1";
  const userId = "donor-1";
  const userEmail = "donor@example.com";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, { name: "Donation Group" });
    setDoc("users", userId, { displayName: "Donor One" });
    mockCustomersCreate.mockResolvedValue({ id: "cus_new_donor" });
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test_1",
      client_secret: "pi_test_1_secret",
    });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(null, null, { groupId, amount: 500 }),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument when amount is below the $0.50 minimum", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 10 }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when amount exceeds the $1,000 maximum", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 200_000 }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await expect(
      (createStripePaymentIntent as any)(
        makeRequest(userId, userEmail, { groupId, amount: 500 }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("creates a Stripe customer for a first-time donor and persists stripeCustomerId", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: userEmail,
        metadata: { firebaseUID: userId },
      }),
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_new_donor" }),
    );
  });

  it("reuses an existing stripeCustomerId without calling customers.create", async () => {
    setDoc("users", userId, {
      displayName: "Donor One",
      stripeCustomerId: "cus_existing",
    });
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockCustomersCreate).not.toHaveBeenCalled();
    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.customer).toBe("cus_existing");
  });

  it("routes funds via transfer_data and computes application_fee_amount when group has a Connect account", async () => {
    setDoc("groups", groupId, {
      name: "Donation Group",
      stripeConnectAccountId: "acct_connected_1",
    });
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 1000 }),
    );

    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.transfer_data).toEqual({ destination: "acct_connected_1" });
    expect(piArgs.application_fee_amount).toBe(50); // 5% of 1000
  });

  it("omits transfer_data when the group has no Connect account", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 1000 }),
    );

    const piArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(piArgs.transfer_data).toBeUndefined();
  });

  it("passes the pre-generated donation doc ID as the Stripe idempotency key", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    const [, opts] = mockPaymentIntentsCreate.mock.calls[0];
    expect(opts).toEqual({ idempotencyKey: "donation-auto-id" });
  });

  it("writes a pending donation doc and returns clientSecret + donationId", async () => {
    jest.resetModules();
    const { createStripePaymentIntent } =
      await import("../callable/createStripePaymentIntent");
    const result = await (createStripePaymentIntent as any)(
      makeRequest(userId, userEmail, { groupId, amount: 500 }),
    );

    expect(mockDonationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        amount: 500,
        status: "pending",
        transactionId: "pi_test_1",
      }),
    );
    expect(result).toEqual({
      clientSecret: "pi_test_1_secret",
      donationId: "donation-auto-id",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest createStripePaymentIntent`
Expected: FAIL (no prior test file)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest createStripePaymentIntent`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/createStripePaymentIntent.test.ts
git commit -m "test(homegroups-functions): add coverage for createStripePaymentIntent"
```

---

### Task 5: reactivateGroupSubscription + createCustomerPortalSession

**Files:**

- Create: `homegroups/functions/src/__tests__/reactivateGroupSubscription.test.ts`
- Create: `homegroups/functions/src/__tests__/createCustomerPortalSession.test.ts`

**Interfaces:**

- Consumes: `reactivateGroupSubscription = onCall({ cpu, memory, timeoutSeconds, region }, async (request: CallableRequest<{ groupId; paymentMethodId? }>) => ...)`. Uses the **options-object** mock shape.
- Consumes: `createCustomerPortalSession = onCall({ cpu, memory, timeoutSeconds, region }, async (request: CallableRequest<{ groupId }>) => ...)`. Uses the **options-object** mock shape.

- [ ] **Step 1: Write the failing test**

`reactivateGroupSubscription.test.ts`:

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      delete: () => "__FIELD_DELETE__",
    },
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockCustomersRetrieve = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockPaymentMethodsAttach = jest.fn();
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_annual");

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: {
      retrieve: mockCustomersRetrieve,
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
      create: mockSubscriptionsCreate,
    },
    paymentMethods: { attach: mockPaymentMethodsAttach },
  },
  productIdGroup: "prod_group",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockDocUpdate,
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("reactivateGroupSubscription", () => {
  const groupId = "group-reactivate-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockGetDefaultPriceForProduct.mockResolvedValue("price_group_annual");
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not an admin", async () => {
    setDoc("groups", groupId, { admins: ["someone-else"] });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("resumes a subscription that is cancel_at_period_end instead of creating a new one", async () => {
    setDoc("groups", groupId, {
      admins: [userId],
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: "cus_1",
      deleted: false,
      invoice_settings: { default_payment_method: "pm_1" },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
    });
    mockSubscriptionsUpdate.mockResolvedValue({
      id: "sub_1",
      status: "active",
    });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    const result = await (reactivateGroupSubscription as any)(
      makeRequest(userId, { groupId }),
    );

    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, action: "resumed" });
  });

  it("throws failed-precondition when no customer and no paymentMethodId are available", async () => {
    setDoc("groups", groupId, { admins: [userId] });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    await expect(
      (reactivateGroupSubscription as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("creates a brand-new subscription when the old one is fully canceled, using the day-stamped idempotency key", async () => {
    setDoc("groups", groupId, {
      admins: [userId],
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_old",
      subscriptionStatus: "canceled",
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: "cus_1",
      deleted: false,
      invoice_settings: { default_payment_method: "pm_1" },
    });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_new",
      status: "active",
      items: { data: [{ id: "si_1" }] },
      current_period_end: 1750000000,
    });
    jest.resetModules();
    const { reactivateGroupSubscription } =
      await import("../callable/reactivateGroupSubscription");
    const result = await (reactivateGroupSubscription as any)(
      makeRequest(userId, { groupId }),
    );

    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    const [, opts] = mockSubscriptionsCreate.mock.calls[0];
    expect(opts.idempotencyKey).toContain(
      `reactivate-${groupId}-${userId}-subscription-`,
    );
    expect(result).toMatchObject({
      success: true,
      action: "created",
      subscriptionId: "sub_new",
    });
  });
});
```

`createCustomerPortalSession.test.ts` — same mock header as above (options-object shape), mocking only `stripe.billingPortal.sessions.create` and `../utils/appConfig` `APP_BASE_URL`:

```ts
export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

const mockPortalSessionsCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: { billingPortal: { sessions: { create: mockPortalSessionsCreate } } },
}));

jest.mock("../utils/appConfig", () => ({
  APP_BASE_URL: "https://homegroups-app.com",
}));

let docStore: Record<string, Record<string, any> | null> = {};

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("createCustomerPortalSession", () => {
  const groupId = "group-portal-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session/abc",
    });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not an admin", async () => {
    setDoc("groups", groupId, { admins: ["someone-else"] });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws failed-precondition if the group has no stripeCustomerId", async () => {
    setDoc("groups", groupId, { admins: [userId] });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("returns a portal url with return_url containing the groupId", async () => {
    setDoc("groups", groupId, { admins: [userId], stripeCustomerId: "cus_1" });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    const result = await (createCustomerPortalSession as any)(
      makeRequest(userId, { groupId }),
    );

    expect(result).toMatchObject({ success: true, url: expect.any(String) });
    const args = mockPortalSessionsCreate.mock.calls[0][0];
    expect(args.customer).toBe("cus_1");
    expect(args.return_url).toContain(`groupId=${groupId}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest reactivateGroupSubscription createCustomerPortalSession`
Expected: FAIL (no prior test files)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest reactivateGroupSubscription createCustomerPortalSession`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/reactivateGroupSubscription.test.ts homegroups/functions/src/__tests__/createCustomerPortalSession.test.ts
git commit -m "test(homegroups-functions): add coverage for reactivateGroupSubscription and createCustomerPortalSession"
```

---

### Task 6: initiateTreasurerHandoff

**Files:**

- Create: `homegroups/functions/src/__tests__/initiateTreasurerHandoff.test.ts`

**Interfaces:**

- Consumes: `initiateTreasurerHandoff = onCall(async (request: CallableRequest<{ groupId; toUserId; message? }>) => ...)`. Uses the **single-arg** mock shape.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockGroupUpdate = jest.fn().mockResolvedValue(undefined);
let membersQueryEmpty = false;
const mockSendEachForMulticast = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockGroupUpdate,
  };
}

const mockMembersQuery = {
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockImplementation(async () => ({ empty: membersQueryEmpty })),
};

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => {
    if (name === "members") return mockMembersQuery;
    return { doc: (id: string) => buildDocRef(name, id) };
  }),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("initiateTreasurerHandoff", () => {
  const groupId = "group-handoff-1";
  const fromUserId = "treasurer-1";
  const toUserId = "member-2";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    membersQueryEmpty = false;
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
    });
    setDoc("users", fromUserId, { displayName: "Fran Treasurer" });
    setDoc("users", toUserId, { displayName: "Nia New", fcmTokens: ["tok1"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(null, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if toUserId is missing", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when transferring to yourself", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId: fromUserId }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not a treasurer", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: ["someone-else"],
    });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws failed-precondition if a handoff is already pending", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
      pendingTreasurerHandoff: { fromUserId, toUserId: "someone-else" },
    });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws failed-precondition if toUserId is not a member of the group", async () => {
    membersQueryEmpty = true;
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("writes pendingTreasurerHandoff onto the group doc with both display names", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, {
        groupId,
        toUserId,
        message: "Time to pass it on",
      }),
    );

    expect(mockGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingTreasurerHandoff: expect.objectContaining({
          fromUserId,
          toUserId,
          fromUserName: "Fran Treasurer",
          toUserName: "Nia New",
          message: "Time to pass it on",
        }),
      }),
    );
  });

  it("notifies the target user's FCM tokens", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId, toUserId }),
    );

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok1"] }),
    );
  });

  it("does not throw when the target user has no FCM tokens", async () => {
    setDoc("users", toUserId, { displayName: "Nia New" });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("returns success with the pendingHandoff summary", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    const result = await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId, toUserId }),
    );
    expect(result).toMatchObject({
      success: true,
      pendingHandoff: { fromUserId, toUserId },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest initiateTreasurerHandoff`
Expected: FAIL (no prior test file)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest initiateTreasurerHandoff`
Expected: PASS. If a field name (e.g. `treasurers` vs `treasurerIds`) doesn't match the real doc shape, read `src/callable/initiateTreasurerHandoff.ts` and correct the test's `setDoc` fixtures — do not change production code in this task.

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/initiateTreasurerHandoff.test.ts
git commit -m "test(homegroups-functions): add coverage for initiateTreasurerHandoff"
```

---

### Task 7: completeTreasurerHandoff

**Files:**

- Create: `homegroups/functions/src/__tests__/completeTreasurerHandoff.test.ts`

**Interfaces:**

- Consumes: `completeTreasurerHandoff = onCall(async (request: CallableRequest<{ groupId }>) => ...)`. Uses the **single-arg** mock shape. Runs inside `db.runTransaction`.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      delete: () => "__FIELD_DELETE__",
    },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockTransactionUpdate = jest.fn();
const mockTransactionSet = jest.fn();
const mockSendEachForMulticast = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
  };
}

function buildCollectionRef(name: string): any {
  return {
    doc: (id?: string) => buildDocRef(name, id || "audit-auto-id"),
  };
}

const mockTransaction = {
  get: jest.fn().mockImplementation(async (ref: any) => ref.get()),
  update: mockTransactionUpdate,
  set: mockTransactionSet,
};

const mockDb = {
  collection: jest
    .fn()
    .mockImplementation((name: string) => buildCollectionRef(name)),
  runTransaction: jest.fn(async (fn: (tx: any) => Promise<any>) =>
    fn(mockTransaction),
  ),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("completeTreasurerHandoff", () => {
  const groupId = "group-handoff-2";
  const fromUserId = "treasurer-old";
  const toUserId = "treasurer-new";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
      pendingTreasurerHandoff: {
        fromUserId,
        toUserId,
        fromUserName: "Old Treasurer",
        toUserName: "New Treasurer",
      },
    });
    setDoc("users", fromUserId, { fcmTokens: ["tok-old"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition if there is no pending handoff", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
    });
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws permission-denied if caller is not the designated target", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(
        makeRequest("random-user", { groupId }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("swaps treasurers atomically: removes fromUserId, adds toUserId", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    const [, updateArgs] = mockTransactionUpdate.mock.calls[0];
    expect(updateArgs.treasurers).toEqual([toUserId]);
    expect(updateArgs.pendingTreasurerHandoff).toBe("__FIELD_DELETE__");
  });

  it("writes a treasurer_handoff_completed audit log entry within the transaction", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "treasurer_handoff_completed",
        fromUserId,
        toUserId,
        performedBy: toUserId,
      }),
    );
  });

  it("notifies the old treasurer's FCM tokens after the transaction commits", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok-old"] }),
    );
  });

  it("returns success with the new treasurer's id and name", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    const result = await (completeTreasurerHandoff as any)(
      makeRequest(toUserId, { groupId }),
    );
    expect(result).toMatchObject({
      success: true,
      newTreasurerId: toUserId,
      newTreasurerName: "New Treasurer",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest completeTreasurerHandoff`
Expected: FAIL (no prior test file)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest completeTreasurerHandoff`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/completeTreasurerHandoff.test.ts
git commit -m "test(homegroups-functions): add coverage for completeTreasurerHandoff"
```

---

### Task 8: cancelTreasurerHandoff

**Files:**

- Create: `homegroups/functions/src/__tests__/cancelTreasurerHandoff.test.ts`

**Interfaces:**

- Consumes: `cancelTreasurerHandoff = onCall(async (request: CallableRequest<{ groupId }>) => ...)`. Uses the **single-arg** mock shape.

- [ ] **Step 1: Write the failing test**

```ts
export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      delete: () => "__FIELD_DELETE__",
    },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockGroupUpdate = jest.fn().mockResolvedValue(undefined);
const mockAuditLogSet = jest.fn().mockResolvedValue(undefined);
const mockSendEachForMulticast = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockGroupUpdate,
    collection: (_sub: string) => ({
      doc: () => ({ set: mockAuditLogSet }),
    }),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("cancelTreasurerHandoff", () => {
  const groupId = "group-handoff-3";
  const fromUserId = "treasurer-old";
  const toUserId = "treasurer-new";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, {
      name: "Handoff Group",
      pendingTreasurerHandoff: {
        fromUserId,
        toUserId,
        fromUserName: "Old Treasurer",
        toUserName: "New Treasurer",
      },
    });
    setDoc("users", fromUserId, { fcmTokens: ["tok-old"] });
    setDoc("users", toUserId, { fcmTokens: ["tok-new"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition if there is no pending handoff to cancel", async () => {
    setDoc("groups", groupId, { name: "Handoff Group" });
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws permission-denied if caller is neither the initiator nor the target", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest("random-user", { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows the initiator (fromUserId) to withdraw the handoff", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    const result = await (cancelTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId }),
    );
    expect(result.message).toContain("withdrawn");
    expect(mockGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ pendingTreasurerHandoff: "__FIELD_DELETE__" }),
    );
  });

  it("allows the target (toUserId) to decline the handoff", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    const result = await (cancelTreasurerHandoff as any)(
      makeRequest(toUserId, { groupId }),
    );
    expect(result.message).toContain("declined");
  });

  it("notifies the other party — target's tokens when initiator cancels", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId }));
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok-new"] }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest cancelTreasurerHandoff`
Expected: FAIL (no prior test file)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest cancelTreasurerHandoff`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add homegroups/functions/src/__tests__/cancelTreasurerHandoff.test.ts
git commit -m "test(homegroups-functions): add coverage for cancelTreasurerHandoff"
```

---

### Task 9: transactionsSlice — updateTransaction and deleteTransaction thunks

**Note:** there is no separate Cloud Functions callable for treasury update/delete/list — `TreasuryModel.updateTransaction`, `.deleteTransaction`, and `.getTransactions` (`homegroups/mobile/src/models/TreasuryModel.ts:255,347,66`) write directly to Firestore from the mobile client, gated by `firestore.rules`. This matches the documented client-writes-directly pattern in `homegroups/mobile/CLAUDE.md`. This task is Redux-slice-level only, mirroring the existing `addTransaction` test's mock pattern.

**Files:**

- Create: `homegroups/mobile/src/store/slices/__tests__/transactionsSlice.crud.test.ts`

**Interfaces:**

- Consumes: `updateTransaction = createAsyncThunk<Transaction, { transactionId; groupId; updates: Partial<{ type, amount, category, description }> }, { rejectValue: string }>('transactions/update', ...)` from `../transactionsSlice`
- Consumes: `deleteTransaction = createAsyncThunk('transactions/delete', async ({ groupId, transactionId }, ...) => ...)` from `../transactionsSlice`
- Consumes: `fetchGroupTransactions` (existing thunk, used only to seed `groupTransactionIds` state for the delete-removes-from-bucket test)

- [ ] **Step 1: Write the failing test**

```ts
import { configureStore } from "@reduxjs/toolkit";
import transactionsReducer, {
  updateTransaction,
  deleteTransaction,
  fetchGroupTransactions,
} from "../transactionsSlice";

const mockUpdateTransaction = jest.fn();
const mockDeleteTransaction = jest.fn();
const mockGetTransactions = jest.fn();

jest.mock("../../../models/TreasuryModel", () => ({
  TreasuryModel: {
    createTransaction: jest.fn(),
    getTransactions: (...args: any[]) => mockGetTransactions(...args),
    updateTransaction: (...args: any[]) => mockUpdateTransaction(...args),
    deleteTransaction: (...args: any[]) => mockDeleteTransaction(...args),
    getTreasuryStats: jest.fn(),
  },
}));

jest.mock("../../../services/activityTracker", () => ({
  trackActivity: jest.fn(),
}));

jest.mock("@react-native-firebase/auth", () => {
  const mockAuth = {
    currentUser: { uid: "test-uid" },
    onAuthStateChanged: jest.fn(() => jest.fn()),
  };
  return () => mockAuth;
});

function buildStore() {
  return configureStore({ reducer: { transactions: transactionsReducer } });
}

function makeFakeTransaction(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: "tx-abc",
    groupId: "group-1",
    type: "expense",
    amount: 40,
    category: "Rent",
    description: "March rent",
    createdBy: "test-uid",
    createdAt: 1736899200000,
    ...overrides,
  };
}

describe("updateTransaction thunk", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls TreasuryModel.updateTransaction with transactionId and the updates object", async () => {
    mockUpdateTransaction.mockResolvedValue(
      makeFakeTransaction({ amount: 55 }),
    );
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: "tx-abc",
        groupId: "group-1",
        updates: { amount: 55 },
      }),
    );

    expect(mockUpdateTransaction).toHaveBeenCalledWith("tx-abc", {
      amount: 55,
    });
  });

  it("upserts the updated transaction into the entity store on success", async () => {
    mockUpdateTransaction.mockResolvedValue(
      makeFakeTransaction({ amount: 55 }),
    );
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: "tx-abc",
        groupId: "group-1",
        updates: { amount: 55 },
      }),
    );

    const state = store.getState().transactions;
    expect(state.status).toBe("succeeded");
    expect(state.transactions.entities["tx-abc"]?.amount).toBe(55);
  });

  it("does not duplicate the groupTransactionIds bucket on update (only add/delete mutate it)", async () => {
    mockUpdateTransaction.mockResolvedValue(
      makeFakeTransaction({ amount: 55 }),
    );
    const store = buildStore();
    await store.dispatch(
      updateTransaction({
        transactionId: "tx-abc",
        groupId: "group-1",
        updates: { amount: 55 },
      }),
    );
    expect(
      store.getState().transactions.groupTransactionIds["group-1"],
    ).toBeUndefined();
  });

  it("sets status to failed and stores the error message when the model throws", async () => {
    mockUpdateTransaction.mockRejectedValue(new Error("Transaction not found"));
    const store = buildStore();
    const result = await store.dispatch(
      updateTransaction({
        transactionId: "tx-missing",
        groupId: "group-1",
        updates: { amount: 10 },
      }),
    );

    expect(result.type).toBe("transactions/update/rejected");
    const state = store.getState().transactions;
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Transaction not found");
  });

  it("falls back to a generic error message when the thrown error has no message", async () => {
    mockUpdateTransaction.mockRejectedValue({});
    const store = buildStore();
    const result = await store.dispatch(
      updateTransaction({
        transactionId: "tx-abc",
        groupId: "group-1",
        updates: { amount: 10 },
      }),
    );
    expect((result as any).payload).toBe("Failed to update transaction");
  });
});

describe("deleteTransaction thunk", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls TreasuryModel.deleteTransaction with only the transactionId", async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();
    await store.dispatch(
      deleteTransaction({ groupId: "group-1", transactionId: "tx-abc" }),
    );
    expect(mockDeleteTransaction).toHaveBeenCalledWith("tx-abc");
  });

  it("removes the transaction from the entity store and its group bucket on success", async () => {
    mockGetTransactions.mockResolvedValue([makeFakeTransaction()]);
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();

    await store.dispatch(fetchGroupTransactions({ groupId: "group-1" }));
    expect(
      store.getState().transactions.groupTransactionIds["group-1"],
    ).toContain("tx-abc");

    await store.dispatch(
      deleteTransaction({ groupId: "group-1", transactionId: "tx-abc" }),
    );
    const state = store.getState().transactions;
    expect(state.transactions.entities["tx-abc"]).toBeUndefined();
    expect(state.groupTransactionIds["group-1"]).not.toContain("tx-abc");
  });

  it("sets status to failed and stores the error message when the model throws", async () => {
    mockDeleteTransaction.mockRejectedValue(new Error("Transaction not found"));
    const store = buildStore();
    const result = await store.dispatch(
      deleteTransaction({ groupId: "group-1", transactionId: "tx-missing" }),
    );
    expect(result.type).toBe("transactions/delete/rejected");
    const state = store.getState().transactions;
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Transaction not found");
  });

  it("is a no-op on groupTransactionIds for a group that was never fetched", async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    const store = buildStore();
    await expect(
      store.dispatch(
        deleteTransaction({ groupId: "never-fetched", transactionId: "tx-x" }),
      ),
    ).resolves.toMatchObject({ type: "transactions/delete/fulfilled" });
    expect(
      store.getState().transactions.groupTransactionIds["never-fetched"],
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/mobile && npx jest transactionsSlice.crud`
Expected: FAIL (no prior test file for this describe scope)

- [ ] **Step 3: Run test to verify it passes**

Run: `cd homegroups/mobile && npx jest transactionsSlice.crud`
Expected: PASS. If action-type strings or state-shape assertions don't match (e.g. `entities`/`ids` normalization differs), read `homegroups/mobile/src/store/slices/transactionsSlice.ts` directly and correct the test — do not change production code in this task.

- [ ] **Step 4: Commit**

```bash
git add homegroups/mobile/src/store/slices/__tests__/transactionsSlice.crud.test.ts
git commit -m "test(homegroups-mobile): add coverage for updateTransaction and deleteTransaction thunks"
```

---

### Task 10: homegroups/web CI job

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `homegroups/web/package.json` `"test": "react-scripts test"` (CRA/Jest, no custom `setupTests.js` — CRA's built-in Jest config is used as-is)

- [ ] **Step 1: Read the current `homegroups-mobile` job to confirm its exact position and style**

Run: `grep -n "homegroups-mobile:" -A 20 .github/workflows/ci.yml`

- [ ] **Step 2: Insert the new job immediately after the `homegroups-mobile` job block**

```yaml
homegroups-web:
  name: homegroups/web — test
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
        cache-dependency-path: homegroups/web/package-lock.json
    - name: Install dependencies
      run: cd homegroups/web && npm ci
    - name: Test
      run: cd homegroups/web && CI=true npm test -- --watchAll=false
```

This exercises the three existing-but-never-run files: `src/pages/__tests__/PrivacyPage.test.js`, `AboutPage.test.js`, `TermsPage.test.js`.

- [ ] **Step 3: Verify locally before committing (no local way to "run CI" outside GitHub Actions)**

Run: `cd homegroups/web && npm ci && CI=true npm test -- --watchAll=false`
Expected: the three existing test files run and PASS. If any fails, read the failing test and the component it covers to determine whether the test or the component has drifted — fix the test only in this task; if the component itself is broken, stop and flag it rather than silently patching production code.

- [ ] **Step 4: Validate the YAML is well-formed**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(homegroups-web): add CI job to run existing but never-executed web tests"
```

---

### Task 11: Final verification sweep

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full homegroups functions suite**

Run: `cd homegroups/functions && npm test`
Expected: PASS, with 9 new suites (Tasks 1-8, note Task 2 and 5 each add two files) added to the prior 60/694 baseline.

- [ ] **Step 2: Typecheck functions**

Run: `cd homegroups/functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the full homegroups mobile suite**

Run: `cd homegroups/mobile && npm test`
Expected: PASS, with 1 new suite (Task 9) added to the prior 18/89 baseline.

- [ ] **Step 4: Confirm CI workflow YAML is still valid**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID`

No commit for this task — it's a verification gate before merge/PR.

---

## Bugs Found (do not fix inline — flag for a follow-up decision)

1. **`getStripeAccountDetails`/`getStripeAccountInfo`/`getStripeAccountMetrics` trust the `superAdmin` custom claim alone**, with no group scoping, no rate limiting, and no audit-log write — unlike the group-scoped callables which check `groupData.admins`. If `superAdmin` claim-setting is ever exposed to a broader admin tier than intended, these three callables leak full platform Stripe account/customer/subscription data with no additional guardrail. Worth a follow-up security review.
2. **`createStripeAccountLink` checks `admins || adminUids`**, but `reactivateGroupSubscription`/`createCustomerPortalSession`/`initiateTreasurerHandoff` only check `admins`. If any group only populates `adminUids`, its admin can connect a Stripe account but then get `permission-denied` trying to reactivate a subscription or manage billing via the portal. Worth reconciling to one field name.
