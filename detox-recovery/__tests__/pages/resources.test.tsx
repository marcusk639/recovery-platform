import { render, screen } from "@testing-library/react";
import ResourcesPage from "@/app/resources/page";
import { PRODUCTS } from "@/lib/products-data";

describe("Resources Page", () => {
  it("renders a card for each product", () => {
    render(<ResourcesPage />);
    PRODUCTS.forEach((product) => {
      expect(screen.getAllByText(product.name).length).toBeGreaterThan(0);
    });
  });

  it('renders the free lead magnets with "Get the free guide" CTA', () => {
    render(<ResourcesPage />);
    const freeCtas = screen.getAllByRole("link", {
      name: /get the free guide/i,
    });
    expect(freeCtas.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the newsletter section", () => {
    render(<ResourcesPage />);
    expect(
      screen.getAllByText(/withdrawal field notes/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders a donation option", () => {
    render(<ResourcesPage />);
    expect(
      screen.getByRole("link", { name: /make a donation/i }),
    ).toBeInTheDocument();
  });
});
