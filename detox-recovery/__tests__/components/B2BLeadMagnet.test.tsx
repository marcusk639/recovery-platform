import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { B2BLeadMagnet } from "@/components/consulting/B2BLeadMagnet";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});
afterEach(() => {
  jest.resetAllMocks();
});

describe("B2BLeadMagnet", () => {
  it("renders the guide title and an email input", () => {
    render(<B2BLeadMagnet />);
    expect(
      screen.getByText(/10 ways detox programs lose patient trust/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/work email/i)).toBeInTheDocument();
  });

  it("shows confirmation after successful subscription", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(<B2BLeadMagnet />);
    fireEvent.change(screen.getByPlaceholderText(/work email/i), {
      target: { value: "director@clinic.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
  });
});
