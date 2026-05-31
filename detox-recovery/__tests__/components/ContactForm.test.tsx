import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "@/components/contact/ContactForm";

const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});
afterEach(() => {
  jest.resetAllMocks();
});

describe("ContactForm", () => {
  it("renders name, email, organization, interest, message, and submit button", () => {
    render(<ContactForm />);
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/area of interest/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send message/i }),
    ).toBeInTheDocument();
  });

  it("shows all B2B interest options in the select", () => {
    render(<ContactForm />);
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain("Patient-Experience Training");
    expect(options).toContain("Digital Health Startup Advisory");
  });

  it("shows success state after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Dr. Smith" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dr@clinic.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Interested in staff training." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/message received/i)).toBeInTheDocument();
    });
  });

  it("shows error message when API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Something went wrong. Please try again." }),
    });
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Dr. Smith" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dr@clinic.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Hello." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it("shows generic error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Dr. Smith" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "dr@clinic.com" },
    });
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Hello." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it("pre-selects interest when defaultInterest matches a known option", () => {
    render(<ContactForm defaultInterest="Patient-Experience Training" />);
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("Patient-Experience Training");
  });

  it("leaves interest blank when defaultInterest does not match any option", () => {
    render(<ContactForm defaultInterest="Unknown Service" />);
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
  });
});
