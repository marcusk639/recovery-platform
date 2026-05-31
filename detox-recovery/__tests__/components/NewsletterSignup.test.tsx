import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsletterSignup } from "@/components/nav/NewsletterSignup";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});
afterEach(() => {
  jest.resetAllMocks();
});

describe("NewsletterSignup", () => {
  it("renders email input and subscribe button", () => {
    render(<NewsletterSignup />);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /subscribe/i }),
    ).toBeInTheDocument();
  });

  it("shows confirmation after successful subscription", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(<NewsletterSignup />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => {
      expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
    });
  });

  it("has an accessible label for the email input", () => {
    render(<NewsletterSignup />);
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
  });

  it("shows an error message when the subscription request fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Subscription failed." }),
    });
    render(<NewsletterSignup />);
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong/i,
      );
    });
  });
});
