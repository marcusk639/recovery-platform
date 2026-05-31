import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeadMagnetForm } from "@/components/resources/LeadMagnetForm";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});
afterEach(() => {
  jest.resetAllMocks();
});

describe("LeadMagnetForm", () => {
  it("renders email input and submit button in idle state", () => {
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    expect(screen.getByPlaceholderText(/your email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send me the guide/i }),
    ).toBeInTheDocument();
  });

  it("uses custom buttonLabel when provided", () => {
    render(
      <LeadMagnetForm
        title="Newsletter"
        description="Subscribe"
        tag="newsletter-withdrawal-field-notes"
        buttonLabel="Subscribe free"
      />,
    );
    expect(
      screen.getByRole("button", { name: /subscribe free/i }),
    ).toBeInTheDocument();
  });

  it("shows success message after successful API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/you're in/i)).toBeInTheDocument();
    });
  });

  it("shows error message when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Subscription failed. Please try again." }),
    });
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/subscription failed/i)).toBeInTheDocument();
    });
  });

  it("shows generic error when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it("has an accessible label for the email input", () => {
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
  });

  it("has a persistent error region that becomes visible on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Subscription failed. Please try again." }),
    });
    render(
      <LeadMagnetForm
        title="Test Guide"
        description="A description"
        tag="lead-magnet-unsafe"
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send me the guide/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /subscription failed/i,
      );
    });
  });
});
