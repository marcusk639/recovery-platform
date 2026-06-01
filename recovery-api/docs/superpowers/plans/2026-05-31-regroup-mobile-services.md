# regroup/mobile — Shared Platform Service Layer Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sharedProfile` and `referrals` service modules to `regroup/mobile/` that route through regroup-functions callables to the shared platform, and migrate the existing `users` service to stop writing shared profile fields directly to local Firestore.

**Architecture:** All shared-platform calls route through regroup-functions (not directly to recovery-platform) so the RN app stays pointed at a single Firebase project. `src/services/sharedProfile.ts` and `src/services/referrals.ts` call regroup-functions callables via `@react-native-firebase/functions`. The existing `src/services/users.tsx` is audited and any writes to `sobrietyDate`, `displayName`, or `homeApp` are delegated to `sharedProfile.ts` instead.

**Tech Stack:** React Native 0.72, TypeScript, `@react-native-firebase/functions`, Jest

**All files are under `recovery-platform/regroup/mobile/` unless noted.**

**Spec:** `recovery-api/docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md`

**Dependency:** regroup-functions integration plan must be deployed before smoke-testing.

---

## File Structure

```
src/services/
├── sharedProfile.ts         CREATE — getUserProfile, updateUserProfile via callable
├── sharedProfile.test.ts    CREATE
├── referrals.ts             CREATE — createReferral, getReferrals, getReferral via callable
├── referrals.test.ts        CREATE
└── users.tsx                MODIFY — remove direct Firestore writes for shared profile fields
```

---

### Task 1: Audit users.tsx for shared profile writes

Before writing new code, identify every direct Firestore write that touches shared profile fields. These callsites get migrated in Task 4.

**Files:**

- Read: `src/services/users.tsx` (audit only, no changes)

- [ ] **Step 1: Find all direct writes to shared profile fields**

```bash
cd recovery-platform/regroup/mobile
grep -n "sobrietyDate\|displayName\|homeApp\|userCollection\|\.update\|\.set" \
  src/services/users.tsx
```

Record every line number returned. These are the callsites to migrate in Task 4.

- [ ] **Step 2: Check existing callable invocation pattern**

```bash
grep -rn "httpsCallable\|functions()" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "__tests__" | grep -v ".test." | head -10
```

Note the import style used. Tasks 2 and 3 follow the same pattern.

---

### Task 2: Create src/services/sharedProfile.ts

**Files:**

- Create: `src/services/sharedProfile.ts`
- Create: `src/services/sharedProfile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/sharedProfile.test.ts`:

```typescript
import { getUserProfile, updateUserProfile } from "./sharedProfile";

const mockHttpsCallable = jest.fn();
jest.mock("@react-native-firebase/functions", () =>
  jest.fn(() => ({ httpsCallable: mockHttpsCallable })),
);

describe("getUserProfile", () => {
  it("calls getUserProfile callable and returns null when no profile", async () => {
    const mockFn = jest.fn().mockResolvedValue({ data: { profile: null } });
    mockHttpsCallable.mockReturnValue(mockFn);

    const result = await getUserProfile();

    expect(mockHttpsCallable).toHaveBeenCalledWith("getUserProfile");
    expect(mockFn).toHaveBeenCalledWith({});
    expect(result).toBeNull();
  });

  it("returns profile data when present", async () => {
    const profile = { uid: "uid123", appId: "sober-living", email: "u@t.com" };
    const mockFn = jest.fn().mockResolvedValue({ data: { profile } });
    mockHttpsCallable.mockReturnValue(mockFn);

    const result = await getUserProfile();
    expect(result).toEqual(profile);
  });
});

describe("updateUserProfile", () => {
  it("calls updateUserProfile callable with the provided data", async () => {
    const mockFn = jest.fn().mockResolvedValue({ data: { updated: true } });
    mockHttpsCallable.mockReturnValue(mockFn);

    await updateUserProfile({ displayName: "Jane" });

    expect(mockHttpsCallable).toHaveBeenCalledWith("updateUserProfile");
    expect(mockFn).toHaveBeenCalledWith({ displayName: "Jane" });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest src/services/sharedProfile.test.ts --no-coverage
```

Expected: FAIL — `./sharedProfile` not found.

- [ ] **Step 3: Write src/services/sharedProfile.ts**

```typescript
import functions from "@react-native-firebase/functions";

export interface SharedUserProfile {
  uid: string;
  appId: "sober-living";
  email: string;
  displayName?: string;
  sobrietyDate?: string; // ISO date "YYYY-MM-DD"
  homeApp?: string;
}

export interface UpdateProfileData {
  displayName?: string;
  sobrietyDate?: string;
  homeApp?: string;
}

const fn = functions();

/**
 * Fetch the shared platform profile for the current user.
 * Routes through regroup-functions → recovery-platform.
 * No second Firebase app needed — uses the default regroup Firebase project.
 */
export async function getUserProfile(): Promise<SharedUserProfile | null> {
  const callable = fn.httpsCallable("getUserProfile");
  const result = await callable({});
  return (result.data as { profile: SharedUserProfile | null }).profile;
}

/**
 * Update shared profile fields. Partial — only provided fields are written.
 * Routes through regroup-functions → recovery-platform.
 */
export async function updateUserProfile(
  data: UpdateProfileData,
): Promise<void> {
  const callable = fn.httpsCallable("updateUserProfile");
  await callable(data);
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx jest src/services/sharedProfile.test.ts --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/sharedProfile.ts src/services/sharedProfile.test.ts
git commit -m "feat(regroup/mobile): add sharedProfile service (getUserProfile, updateUserProfile)"
```

---

### Task 3: Create src/services/referrals.ts

**Files:**

- Create: `src/services/referrals.ts`
- Create: `src/services/referrals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/referrals.test.ts`:

```typescript
import { createReferral, getReferrals, getReferral } from "./referrals";

const mockHttpsCallable = jest.fn();
jest.mock("@react-native-firebase/functions", () =>
  jest.fn(() => ({ httpsCallable: mockHttpsCallable })),
);

const referralInput = {
  toApp: "homegroups" as const,
  clientName: "Jane Doe",
  clientEmail: "jane@example.com",
};

describe("createReferral", () => {
  it("calls createReferral callable and returns id + status", async () => {
    const mockFn = jest
      .fn()
      .mockResolvedValue({ data: { id: "ref1", status: "pending" } });
    mockHttpsCallable.mockReturnValue(mockFn);

    const result = await createReferral(referralInput);

    expect(mockHttpsCallable).toHaveBeenCalledWith("createReferral");
    expect(mockFn).toHaveBeenCalledWith(referralInput);
    expect(result).toEqual({ id: "ref1", status: "pending" });
  });
});

describe("getReferrals", () => {
  it("calls getReferrals callable and returns array", async () => {
    const mockFn = jest.fn().mockResolvedValue({ data: { referrals: [] } });
    mockHttpsCallable.mockReturnValue(mockFn);

    const result = await getReferrals();
    expect(mockFn).toHaveBeenCalledWith({});
    expect(result).toEqual([]);
  });
});

describe("getReferral", () => {
  it("calls getReferral callable with id and returns referral", async () => {
    const referral = { id: "ref1", status: "pending", clientName: "Jane" };
    const mockFn = jest.fn().mockResolvedValue({ data: referral });
    mockHttpsCallable.mockReturnValue(mockFn);

    const result = await getReferral("ref1");
    expect(mockFn).toHaveBeenCalledWith({ id: "ref1" });
    expect(result).toEqual(referral);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest src/services/referrals.test.ts --no-coverage
```

Expected: FAIL — `./referrals` not found.

- [ ] **Step 3: Write src/services/referrals.ts**

```typescript
import functions from "@react-native-firebase/functions";

export type ReferralTargetApp =
  | "treatment-center"
  | "phoenix-cleanhouse"
  | "homegroups"
  | "sober-living";

export interface CreateReferralInput {
  toApp: ReferralTargetApp;
  clientName: string;
  clientEmail: string;
  condition?: string;
  notes?: string;
}

export interface Referral {
  id: string;
  fromApp: string;
  toApp: ReferralTargetApp;
  clientName: string;
  clientEmail: string;
  condition?: string;
  notes?: string;
  status: "pending" | "accepted" | "declined";
}

const fn = functions();

/**
 * Create a cross-app referral. Routes through regroup-functions → recovery-platform.
 */
export async function createReferral(
  data: CreateReferralInput,
): Promise<{ id: string; status: "pending" }> {
  const callable = fn.httpsCallable("createReferral");
  const result = await callable(data);
  return result.data as { id: string; status: "pending" };
}

/**
 * List all referrals created by the current user.
 */
export async function getReferrals(): Promise<Referral[]> {
  const callable = fn.httpsCallable("getReferrals");
  const result = await callable({});
  return (result.data as { referrals: Referral[] }).referrals;
}

/**
 * Fetch a single referral by ID.
 */
export async function getReferral(id: string): Promise<Referral> {
  const callable = fn.httpsCallable("getReferral");
  const result = await callable({ id });
  return result.data as Referral;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx jest src/services/referrals.test.ts --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/referrals.ts src/services/referrals.test.ts
git commit -m "feat(regroup/mobile): add referrals service (createReferral, getReferrals, getReferral)"
```

---

### Task 4: Migrate users.tsx — delegate shared profile writes

**Files:**

- Modify: `src/services/users.tsx`

- [ ] **Step 1: Import updateUserProfile at the top of users.tsx**

Add to the imports section of `src/services/users.tsx`:

```typescript
import { updateUserProfile } from "./sharedProfile";
```

- [ ] **Step 2: Replace each shared-field Firestore write with updateUserProfile**

For each callsite identified in Task 1, apply this transformation.

**Before (any variation of direct Firestore write with shared fields):**

```typescript
await firestore()
  .collection("users")
  .doc(uid)
  .update({ sobrietyDate: date, displayName: name, homeApp: app });
```

**After:**

```typescript
await updateUserProfile({
  sobrietyDate: date,
  displayName: name,
  homeApp: app,
});
```

If the Firestore call mixes shared fields with regroup-only fields (e.g., `houseId`, `role`, `status`), split into two calls:

```typescript
// Shared fields → platform
await updateUserProfile({ sobrietyDate: date, displayName: name });
// Regroup-only fields → local Firestore
await firestore().collection("users").doc(uid).update({ houseId, role });
```

- [ ] **Step 3: Run existing users tests**

```bash
npx jest --testPathPattern=users --no-coverage
```

Expected: All pre-existing tests pass.

- [ ] **Step 4: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass including 6 new service tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/users.tsx
git commit -m "refactor(regroup/mobile): delegate shared profile field writes to sharedProfile service"
```

---

### Task 5: Add Phase 2 environment variable

**Files:**

- Modify: environment config (`.env`, `app.json`, or equivalent — check output of step 1)

- [ ] **Step 1: Find the environment config file**

```bash
find . -maxdepth 3 \( -name ".env" -o -name ".env.example" -o -name "app.json" \) \
  | grep -v node_modules | head -5
```

- [ ] **Step 2: Add RECOVERY_PLATFORM_PROJECT_ID**

In the environment config file found above, add:

```
# Phase 2 — used when the RN client initializes a direct callable
# connection to recovery-platform via custom token exchange.
# Not consumed in Phase 1: regroup-functions proxies all calls.
RECOVERY_PLATFORM_PROJECT_ID=recovery-platform
```

- [ ] **Step 3: Commit**

```bash
git add .env  # or the file updated in step 2
git commit -m "chore(regroup/mobile): add RECOVERY_PLATFORM_PROJECT_ID for Phase 2 preparation"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                                             | Task                                         |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| `src/services/sharedProfile.ts` — getUserProfile, updateUserProfile     | Task 2                                       |
| `src/services/referrals.ts` — createReferral, getReferrals, getReferral | Task 3                                       |
| Audit + migrate `users.tsx` direct Firestore writes for shared fields   | Tasks 1, 4                                   |
| `RECOVERY_PLATFORM_PROJECT_ID` env var for Phase 2                      | Task 5                                       |
| All calls route through regroup-functions (no second Firebase app)      | Tasks 2 & 3 — `functions()` uses default app |

**Out of scope (per spec):** Referral UI screens and navigation — "will be designed separately."
