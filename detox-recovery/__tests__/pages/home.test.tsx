import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import RootLayout from "@/app/layout";

describe("Homepage", () => {
  it("renders the core promise headline", () => {
    render(<Home />);
    expect(
      screen.getByText(/help people find the next safe step/i),
    ).toBeInTheDocument();
  });

  it('has a "Request a fit check" CTA', () => {
    render(<Home />);
    expect(
      screen.getAllByRole("link", { name: /request a fit check/i }).length,
    ).toBeGreaterThan(0);
  });

  it('has a "Book a support call" CTA', () => {
    render(<Home />);
    expect(
      screen.getAllByRole("link", { name: /book a support call/i }).length,
    ).toBeGreaterThan(0);
  });

  it("shows the non-clinical disclaimer", () => {
    render(<Home />);
    expect(screen.getByText(/not medical care/i)).toBeInTheDocument();
  });
});

describe("RootLayout", () => {
  it("renders site name in header", () => {
    render(
      <RootLayout>
        <div>content</div>
      </RootLayout>,
    );
    expect(
      screen.getByRole("link", { name: /withdrawal support/i }),
    ).toBeInTheDocument();
  });

  it("renders primary CTA in header", () => {
    render(
      <RootLayout>
        <div>content</div>
      </RootLayout>,
    );
    expect(
      screen.getByRole("link", { name: /request a fit check/i }),
    ).toBeInTheDocument();
  });
});
