const mockGetUsersByEmail = jest.fn();
const mockCreateInviteNotification = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("../../util/user", () => ({
  getUsersByEmail: mockGetUsersByEmail,
}));

jest.mock("../../util/notifications", () => ({
  createInviteNotification: mockCreateInviteNotification,
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { error: mockLoggerError, info: jest.fn(), warn: jest.fn() },
}));

import { notifyAdminsIfTheyExist } from "../../util/invite";
import { InviteEmailPayload } from "../../entities/Email";

const fakeUser = { uid: "u1", email: "admin@test.com" };
const fakeInvite: InviteEmailPayload = {
  email: {
    from: "noreply@test.com",
    to: "admin@test.com",
    subject: "Invite",
    text: "",
  },
  dynamicLink: "https://example.com/invite",
  type: "admin",
};

beforeEach(() => jest.clearAllMocks());

describe("notifyAdminsIfTheyExist", () => {
  it("creates a notification for each found admin", async () => {
    mockGetUsersByEmail.mockResolvedValue({
      docs: [{ exists: true, data: () => fakeUser }],
    });
    mockCreateInviteNotification.mockResolvedValue(undefined);

    await notifyAdminsIfTheyExist(["admin@test.com"], [fakeInvite]);

    expect(mockCreateInviteNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateInviteNotification).toHaveBeenCalledWith(
      fakeUser,
      fakeInvite
    );
  });

  it("skips admin when no user found with that email", async () => {
    mockGetUsersByEmail.mockResolvedValue({ docs: [] });

    await notifyAdminsIfTheyExist(["ghost@test.com"], [fakeInvite]);

    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  it("skips admin when invite email does not match", async () => {
    mockGetUsersByEmail.mockResolvedValue({
      docs: [{ exists: true, data: () => fakeUser }],
    });
    const unmatchedInvite: InviteEmailPayload = {
      email: {
        from: "noreply@test.com",
        to: "other@test.com",
        subject: "",
        text: "",
      },
      dynamicLink: "https://example.com/invite",
      type: "guest",
    };

    await notifyAdminsIfTheyExist(["admin@test.com"], [unmatchedInvite]);

    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  it("skips admin when user doc does not exist", async () => {
    mockGetUsersByEmail.mockResolvedValue({
      docs: [{ exists: false, data: () => fakeUser }],
    });

    await notifyAdminsIfTheyExist(["admin@test.com"], [fakeInvite]);

    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  it("handles multiple admins, notifying only those with matching users and invites", async () => {
    const fakeUser2 = { uid: "u2", email: "second@test.com" };
    const fakeInvite2: InviteEmailPayload = {
      email: {
        from: "noreply@test.com",
        to: "second@test.com",
        subject: "Invite 2",
        text: "",
      },
      dynamicLink: "https://example.com/invite2",
      type: "guest",
    };

    mockGetUsersByEmail
      .mockResolvedValueOnce({ docs: [{ exists: true, data: () => fakeUser }] })
      .mockResolvedValueOnce({
        docs: [{ exists: true, data: () => fakeUser2 }],
      });
    mockCreateInviteNotification.mockResolvedValue(undefined);

    await notifyAdminsIfTheyExist(
      ["admin@test.com", "second@test.com"],
      [fakeInvite, fakeInvite2]
    );

    expect(mockCreateInviteNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateInviteNotification).toHaveBeenCalledWith(
      fakeUser,
      fakeInvite
    );
    expect(mockCreateInviteNotification).toHaveBeenCalledWith(
      fakeUser2,
      fakeInvite2
    );
  });

  it("does not throw when the only admin lookup fails", async () => {
    mockGetUsersByEmail.mockRejectedValueOnce(new Error("Firestore error"));
    mockCreateInviteNotification.mockResolvedValue(undefined);

    await expect(
      notifyAdminsIfTheyExist(["admin@test.com"], [fakeInvite])
    ).resolves.not.toThrow();
    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  // Regression coverage for 2026-07-05: the try/catch previously wrapped the
  // whole loop, so one admin lookup failure exited the loop entirely —
  // despite a comment claiming "continue processing remaining admins" (a
  // caught exception does not resume a for loop). This test has a SECOND
  // admin after the failing one and asserts it still gets notified — the
  // old code would fail this (mockCreateInviteNotification never called).
  it("still notifies a later admin after an earlier admin's lookup fails", async () => {
    const fakeUser2 = { uid: "u2", email: "second@test.com" };
    const fakeInvite2: InviteEmailPayload = {
      email: {
        from: "noreply@test.com",
        to: "second@test.com",
        subject: "Invite 2",
        text: "",
      },
      dynamicLink: "https://example.com/invite2",
      type: "guest",
    };

    mockGetUsersByEmail
      .mockRejectedValueOnce(new Error("Firestore error"))
      .mockResolvedValueOnce({
        docs: [{ exists: true, data: () => fakeUser2 }],
      });
    mockCreateInviteNotification.mockResolvedValue(undefined);

    const result = await notifyAdminsIfTheyExist(
      ["admin@test.com", "second@test.com"],
      [fakeInvite, fakeInvite2]
    );

    expect(mockCreateInviteNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateInviteNotification).toHaveBeenCalledWith(
      fakeUser2,
      fakeInvite2
    );
    expect(mockLoggerError).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("returns an empty array when admin list is empty", async () => {
    const result = await notifyAdminsIfTheyExist([], [fakeInvite]);
    expect(result).toEqual([]);
    expect(mockGetUsersByEmail).not.toHaveBeenCalled();
  });
});
