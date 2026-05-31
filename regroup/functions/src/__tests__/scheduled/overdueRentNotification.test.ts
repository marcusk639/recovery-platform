import { runOverdueRentCheck } from "../../scheduled/overdueRentNotification";
import { sendFcmToHouseAdmins } from "../../util/notifications";

jest.mock("../../util/notifications", () => ({
  sendFcmToHouseAdmins: jest.fn(),
}));

// Mock guestCollection
jest.mock("../../api/firestore", () => {
  const mockGet = jest.fn();
  const mockWhere = jest.fn().mockReturnThis();
  mockGet.mockResolvedValue({
    empty: false,
    size: 1,
    docs: [
      {
        data: () => ({
          houseId: "house-1",
          firstName: "Alice",
          lastName: "Smith",
          balance: 150,
          rentDueDate: "2020-01-01", // far in the past — clearly overdue
        }),
      },
    ],
  });
  return {
    guestCollection: { where: mockWhere, get: mockGet },
  };
});

describe("runOverdueRentCheck", () => {
  beforeEach(() => jest.clearAllMocks());

  it("notifies admins for houses with overdue guests", async () => {
    const mockSendFcm = sendFcmToHouseAdmins as jest.MockedFunction<
      typeof sendFcmToHouseAdmins
    >;
    mockSendFcm.mockResolvedValue();

    await runOverdueRentCheck();

    expect(mockSendFcm).toHaveBeenCalledWith(
      "house-1",
      "Rent Overdue",
      expect.stringContaining("overdue")
    );
  });

  it("skips guests with no rentDueDate", async () => {
    const { guestCollection } = require("../../api/firestore");
    guestCollection.get.mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [
        {
          data: () => ({
            houseId: "house-1",
            firstName: "Bob",
            lastName: "Jones",
            balance: 100,
          }),
        },
      ],
    });
    const mockSendFcm = sendFcmToHouseAdmins as jest.MockedFunction<
      typeof sendFcmToHouseAdmins
    >;
    mockSendFcm.mockResolvedValue();
    await runOverdueRentCheck();
    expect(mockSendFcm).not.toHaveBeenCalled();
  });
});
