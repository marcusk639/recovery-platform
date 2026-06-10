import { render, screen } from "@testing-library/react";
import { HeroSection } from "@/components/home/HeroSection";
import { SERVICE_TIERS } from "@/lib/services-data";

describe("HeroSection support-call CTA", () => {
  it("shows the support-call price from SERVICE_TIERS (no hardcoded drift)", () => {
    const supportCall = SERVICE_TIERS.find((t) => t.id === "support-call");
    expect(supportCall).toBeDefined();

    render(<HeroSection />);

    expect(
      screen.getByText(new RegExp(supportCall!.price.replace("$", "\\$"))),
    ).toBeInTheDocument();
  });
});
