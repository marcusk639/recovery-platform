import { render, screen } from "@testing-library/react";
import TermsPage from "@/app/terms/page";
import { CAN_HELP_WITH, CANNOT_HELP_WITH } from "@/lib/scope-of-practice";

describe("Terms page", () => {
  it("renders the page heading", () => {
    render(<TermsPage />);
    expect(
      screen.getByRole("heading", { name: /terms of service/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("links to the Privacy Policy page", () => {
    render(<TermsPage />);
    expect(
      screen.getByRole("link", { name: /privacy policy/i }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("renders every CAN_HELP_WITH item from the canonical scope-of-practice list", () => {
    render(<TermsPage />);
    for (const item of CAN_HELP_WITH) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("renders every CANNOT_HELP_WITH item from the canonical scope-of-practice list", () => {
    render(<TermsPage />);
    for (const item of CANNOT_HELP_WITH) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("shows the emergency disclaimer", () => {
    render(<TermsPage />);
    expect(screen.getByText(/call 911/i)).toBeInTheDocument();
  });
});
