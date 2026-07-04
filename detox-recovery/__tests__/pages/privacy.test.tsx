import { render, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";

describe("Privacy page", () => {
  it("renders the page heading", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("heading", { name: /privacy policy/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("links to the Terms of Service page", () => {
    render(<PrivacyPage />);
    const links = screen.getAllByRole("link", { name: /terms of service/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/terms");
    }
  });

  it("states the non-clinical scope disclaimer", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByText(/non-clinical peer support navigation practice/i),
    ).toBeInTheDocument();
  });
});
