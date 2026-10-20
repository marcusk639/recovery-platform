// src/services/__tests__/operator-setup.test.ts
//
// finishOperatorSetupIfNeeded asks the server to finish an operator's setup
// only when the user doc records owned houses and setup is incomplete. It
// never throws: on failure login falls through to the normal (wizard) route.

const mockCallable = jest.fn();
jest.mock("../../../firebase-setup", () => ({
  functions: { httpsCallable: jest.fn(() => mockCallable) },
}));

jest.mock("../../util/logging", () => ({
  logException: jest.fn(),
}));

import { functions } from "../../../firebase-setup";
import { logException } from "../../util/logging";
import {
  finishOperatorSetupIfNeeded,
  needsSetupRecovery,
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

describe("finishOperatorSetupIfNeeded", () => {
  it("does not call the server when the operator owns no houses", async () => {
    const user = incompleteOperator({ housesOwned: [], subscriptionMetadata: {} });
    await expect(finishOperatorSetupIfNeeded(user)).resolves.toBe(false);
    expect(functions.httpsCallable).not.toHaveBeenCalled();
  });

  it("does not call the server when setup is already completed", async () => {
    const user = incompleteOperator({ orgSetupCompleted: true });
    await expect(finishOperatorSetupIfNeeded(user)).resolves.toBe(false);
    expect(functions.httpsCallable).not.toHaveBeenCalled();
  });

  it("calls finishOperatorSetup with no input and reports completion", async () => {
    mockCallable.mockResolvedValueOnce({ data: { completed: true, houseIds: ["h1"] } });
    await expect(finishOperatorSetupIfNeeded(incompleteOperator())).resolves.toBe(true);
    expect(functions.httpsCallable).toHaveBeenCalledWith("finishOperatorSetup");
    expect(mockCallable).toHaveBeenCalledWith();
  });

  it("returns false when the server had nothing to finish", async () => {
    mockCallable.mockResolvedValueOnce({ data: { completed: false } });
    await expect(finishOperatorSetupIfNeeded(incompleteOperator())).resolves.toBe(false);
    expect(logException).not.toHaveBeenCalled();
  });

  it("returns false and logs (without throwing) when the callable fails", async () => {
    const err = Object.assign(new Error("Houses were created but access could not be granted."), {
      code: "internal",
    });
    mockCallable.mockRejectedValueOnce(err);
    await expect(finishOperatorSetupIfNeeded(incompleteOperator())).resolves.toBe(false);
    expect(logException).toHaveBeenCalledWith(err, expect.any(String));
  });
});
