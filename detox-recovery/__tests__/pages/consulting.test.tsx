import { render, screen } from "@testing-library/react";
import ConsultingPage from "@/app/consulting/page";
import { B2B_OFFERS } from "@/lib/consulting-data";

describe("Consulting Page", () => {
  it("renders the page title", () => {
    render(<ConsultingPage />);
    expect(
      screen.getByText(/patient-experience consulting for withdrawal care/i),
    ).toBeInTheDocument();
  });

  it("renders the positioning statement", () => {
    render(<ConsultingPage />);
    expect(
      screen.getByText(/patient experience of withdrawal/i),
    ).toBeInTheDocument();
  });

  it("renders a heading for each B2B offer", () => {
    render(<ConsultingPage />);
    B2B_OFFERS.forEach((offer) => {
      expect(screen.getByText(offer.name)).toBeInTheDocument();
    });
  });

  it("renders the lead magnet CTA", () => {
    render(<ConsultingPage />);
    expect(
      screen.getByText(/10 ways detox programs lose patient trust/i),
    ).toBeInTheDocument();
  });

  it("does NOT claim to teach clinical protocols", () => {
    render(<ConsultingPage />);
    expect(screen.queryByText(/teach doctors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/clinical authority/i)).not.toBeInTheDocument();
  });

  it("consulting CTA links include interest query params", () => {
    render(<ConsultingPage />);
    const trainingLinks = screen.getAllByRole("link", {
      name: /discuss staff training/i,
    });
    expect(trainingLinks[0].getAttribute("href")).toContain("interest=");
  });
});
