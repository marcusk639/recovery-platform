import { render, screen } from "@testing-library/react";
import { ServiceComparisonTable } from "@/components/services/ServiceComparisonTable";
import { SERVICE_TIERS } from "@/lib/services-data";

describe("ServiceComparisonTable", () => {
  it("renders a table element", () => {
    render(<ServiceComparisonTable />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders every service tier name in the table", () => {
    render(<ServiceComparisonTable />);
    SERVICE_TIERS.forEach((tier) => {
      expect(screen.getAllByText(tier.name).length).toBeGreaterThan(0);
    });
  });

  it("renders the correct number of Coming soon badges", () => {
    render(<ServiceComparisonTable />);
    const comingSoonCount = SERVICE_TIERS.filter(
      (t) => t.status === "coming-soon",
    ).length;
    expect(screen.getAllByText("Coming soon")).toHaveLength(comingSoonCount);
  });

  it("renders CTA links for each tier", () => {
    render(<ServiceComparisonTable />);
    SERVICE_TIERS.forEach((tier) => {
      expect(
        screen.getAllByRole("link", { name: tier.cta }).length,
      ).toBeGreaterThan(0);
    });
  });

  it("renders column headers: Service, Duration, Price, Status, CTA", () => {
    render(<ServiceComparisonTable />);
    expect(
      screen.getByRole("columnheader", { name: /service/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /duration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /price/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /status/i }),
    ).toBeInTheDocument();
  });
});
