import { render, screen } from "@testing-library/react";
import ServicesPage from "@/app/services/page";
import { REFERRAL_CONDITIONS } from "@/lib/referral-conditions";
import { SERVICE_TIERS } from "@/lib/services-data";

describe("Services Page", () => {
  it("renders a heading for each service tier", () => {
    render(<ServicesPage />);
    SERVICE_TIERS.forEach((tier) => {
      expect(screen.getAllByText(tier.name).length).toBeGreaterThan(0);
    });
  });

  it("renders the comparison table", () => {
    render(<ServicesPage />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it('renders "When I refer you out immediately" section', () => {
    render(<ServicesPage />);
    expect(
      screen.getByText(/when I will refer you out immediately/i),
    ).toBeInTheDocument();
  });

  it("renders all referral conditions on the page", () => {
    render(<ServicesPage />);
    REFERRAL_CONDITIONS.forEach((condition) => {
      expect(screen.getByText(new RegExp(condition, "i"))).toBeInTheDocument();
    });
  });

  it('uses "medical evaluation" language — never "clear you"', () => {
    render(<ServicesPage />);
    expect(screen.queryByText(/I will clear you/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/determine whether you are safe/i),
    ).not.toBeInTheDocument();
  });

  it("shows a scheduling link for tiers that have a calendarHref", () => {
    render(<ServicesPage />);
    expect(screen.getAllByText(/check availability/i).length).toBeGreaterThan(
      0,
    );
  });
});
