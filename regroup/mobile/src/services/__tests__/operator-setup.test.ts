// src/services/__tests__/operator-setup.test.ts
//
// finishOperatorSetupIfNeeded asks the server to finish an operator's setup
// only when the user doc records owned houses and setup is incomplete, and
// reports not-needed / completed / incomplete / failed. It never throws: a
// failed call is surfaced by the caller as a blocking retry state.

const mockCallable = jest.fn();
jest.mock("../../../firebase-setup", () => ({
  functions: { httpsCallable: jest.fn(() => mockCallable) },
}));

jest.mock("../../util/logging", () => ({
  logException: jest.fn(),
}));

import * as Sentry from "@sentry/react-native";
import { functions } from "../../../firebase-setup";
import { logException } from "../../util/logging";
import {
  finishOperatorSetupIfNeeded,
  loadRecoveredUser,
  needsSetupRecovery,
  OPERATOR_SETUP_FIELDS,
} from "../operator-setup";

const incompleteOperator = (extra: Record<string, unknown> = {}): any => ({
  id: "op-uid",
  potentialSuperAdmin: true,
  orgSetupCompleted: false,
  housesOwned: ["h1"],
  subscriptionMetadata: { houses: { h1: {} } },
  ...extra,
});

describe("needsSetupRecovery", () => {
  it.each([
    ["no user", null, false],
    ["setup already completed", incompleteOperator({ orgSetupCompleted: true }), false],
    ["anonymous user", incompleteOperator({ isAnonymous: true }), false],
    [
      "no owned houses",
      incompleteOperator({ housesOwned: [], subscriptionMetadata: { houses: {} } }),
      false,
    ],
    ["houses in housesOwned only", incompleteOperator({ subscriptionMetadata: {} }), true],
    ["houses in the subscription map only", incompleteOperator({ housesOwned: undefined }), true],
    ["orgSetupCompleted missing", incompleteOperator({ orgSetupCompleted: undefined }), true],
  ])("%s → %s", (_label, user, expected) => {
    expect(needsSetupRecovery(user)).toBe(expected);
  });
});

describe("needsSetupRecovery for a completed operator", () => {
  const completed = incompleteOperator({ orgSetupCompleted: true });
  const granted = { admin: { h1: true }, superAdmin: { h1: true } };
  it.each([
    ["no claims available", undefined, false],
    ["every map house has both roles", granted, false],
    ["a map house has no roles", {}, true],
    ["a map house has admin but not superAdmin", { admin: { h1: true } }, true],
    ["claims set to non-objects", { admin: true, superAdmin: "h1" }, true],
  ])("%s → %s", (_label, claims, expected) => {
    expect(needsSetupRecovery(completed, claims as any)).toBe(expected);
  });

  it("ignores housesOwned entries missing from the subscription map", () => {
    const user = incompleteOperator({
      orgSetupCompleted: true,
      housesOwned: ["h1", "stale"],
    });
    expect(needsSetupRecovery(user, granted)).toBe(false);
  });

  it.each([
    ["a completed operator's repair", true, "not-needed"],
    ["an incomplete setup (the user doc may lag the server)", false, "completed"],
  ])("treats an empty grant for %s as %s", async (_label, completedSetup, expected) => {
    mockCallable.mockResolvedValueOnce({ data: { completed: true, houseIds: [] } });
    const user = incompleteOperator({ orgSetupCompleted: completedSetup });
    await expect(finishOperatorSetupIfNeeded(user, {})).resolves.toBe(expected);
  });

  it("calls the server when a completed operator's map house lacks claims", async () => {
    mockCallable.mockResolvedValueOnce({ data: { completed: true, houseIds: ["h1"] } });
    await expect(finishOperatorSetupIfNeeded(completed, {})).resolves.toBe("completed");
    expect(functions.httpsCallable).toHaveBeenCalledWith("finishOperatorSetup");
  });
});

describe("finishOperatorSetupIfNeeded", () => {
  it("does not call the server when the operator owns no houses", async () => {
    const user = incompleteOperator({ housesOwned: [], subscriptionMetadata: {} });
    await expect(finishOperatorSetupIfNeeded(user)).resolves.toBe("not-needed");
    expect(functions.httpsCallable).not.toHaveBeenCalled();
  });

  it("does not call the server when setup is already completed", async () => {
    const user = incompleteOperator({ orgSetupCompleted: true });
    await expect(finishOperatorSetupIfNeeded(user)).resolves.toBe("not-needed");
    expect(functions.httpsCallable).not.toHaveBeenCalled();
  });

  it("calls finishOperatorSetup with no input and reports completion", async () => {
    mockCallable.mockResolvedValueOnce({ data: { completed: true, houseIds: ["h1"] } });
    await expect(finishOperatorSetupIfNeeded(incompleteOperator())).resolves.toBe("completed");
    expect(functions.httpsCallable).toHaveBeenCalledWith("finishOperatorSetup");
    expect(mockCallable).toHaveBeenCalledWith();
  });

  it("returns incomplete and reports a PII-free Sentry message when the server had nothing to finish", async () => {
    mockCallable.mockResolvedValueOnce({ data: { completed: false } });
    const user = incompleteOperator({ email: "op@example.com", firstName: "Op" });
    await expect(finishOperatorSetupIfNeeded(user)).resolves.toBe("incomplete");
    expect(logException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [, context] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
    expect(context).toEqual({
      level: "warning",
      tags: { reason: "setup-recovery-incomplete" },
      extra: { uid: "op-uid" },
    });
    const logged = JSON.stringify((Sentry.captureMessage as jest.Mock).mock.calls);
    expect(logged).not.toContain("example.com");
    expect(logged).not.toContain('"Op"');
  });

  it("returns failed and logs (without throwing) when the callable fails", async () => {
    const err = Object.assign(new Error("Houses were created but access could not be granted."), {
      code: "internal",
    });
    mockCallable.mockRejectedValueOnce(err);
    await expect(finishOperatorSetupIfNeeded(incompleteOperator())).resolves.toBe("failed");
    expect(logException).toHaveBeenCalledWith(err, expect.any(String));
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("loadRecoveredUser", () => {
  const firstRead = incompleteOperator();
  const completedDoc = { ...firstRead, ...OPERATOR_SETUP_FIELDS, adminId: "a1" };

  it("refreshes the token, then returns the reloaded user", async () => {
    const order: string[] = [];
    const refreshToken = jest.fn(async () => order.push("token"));
    const reloadUser = jest.fn(async () => {
      order.push("reload");
      return completedDoc;
    });
    await expect(loadRecoveredUser(firstRead, { refreshToken, reloadUser })).resolves.toBe(
      completedDoc,
    );
    expect(order).toEqual(["token", "reload"]);
  });

  it("logs and ignores a token-refresh failure", async () => {
    const err = new Error("token");
    const user = await loadRecoveredUser(firstRead, {
      refreshToken: jest.fn(async () => Promise.reject(err)),
      reloadUser: jest.fn(async () => completedDoc),
    });
    expect(user).toBe(completedDoc);
    expect(logException).toHaveBeenCalledWith(err, expect.any(String));
  });

  it("falls back to the first read with the setup flags when the reload throws", async () => {
    const err = new Error("reload");
    const user = await loadRecoveredUser(firstRead, {
      refreshToken: jest.fn(async () => undefined),
      reloadUser: jest.fn(async () => Promise.reject(err)),
    });
    expect(user).toEqual({ ...firstRead, ...OPERATOR_SETUP_FIELDS });
    expect(logException).toHaveBeenCalledWith(err, expect.any(String));
  });

  it.each([
    ["orgSetupCompleted false (replica lag)", { ...firstRead }],
    ["no doc", undefined],
  ])("falls back to the first read with the setup flags when the reload has %s", async (_l, doc) => {
    const user = await loadRecoveredUser(firstRead, {
      refreshToken: jest.fn(async () => undefined),
      reloadUser: jest.fn(async () => doc as any),
    });
    expect(user).toEqual({ ...firstRead, ...OPERATOR_SETUP_FIELDS });
  });

  it("mirrors the server's onboarding flags", () => {
    expect(OPERATOR_SETUP_FIELDS).toEqual({
      orgSetupCompleted: true,
      isAdmin: true,
      isSuperAdmin: true,
    });
  });
});
