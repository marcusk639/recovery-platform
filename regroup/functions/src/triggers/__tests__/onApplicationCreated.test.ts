// This test verifies the export exists. Full end-to-end behavior requires
// the emulator and is tested manually during integration testing.

describe("notifyOperatorOnApplication", () => {
  it("is exported from the triggers/firestore module", () => {
    jest.resetModules();
    jest.mock("firebase-admin", () => ({
      initializeApp: jest.fn(),
      firestore: jest.fn(() => ({ collection: jest.fn() })),
      apps: [{}],
      app: jest.fn(),
    }));
    jest.mock("firebase-functions/v2/firestore", () => ({
      onDocumentCreated: jest.fn((path: string, handler: any) => handler),
      onDocumentUpdated: jest.fn(),
      onDocumentWritten: jest.fn((path: string, handler: any) => handler),
    }));
    jest.mock("../../util/notifications", () => ({
      sendNotification: jest.fn(),
    }));
    jest.mock("../../util/email", () => ({
      sendEmail: jest.fn(),
      regroupEmail: "test@example.com",
    }));

    const triggers = require("../firestore");
    expect(triggers.notifyOperatorOnApplication).toBeDefined();
  });
});
