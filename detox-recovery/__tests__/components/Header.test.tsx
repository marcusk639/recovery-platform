// __tests__/components/Header.test.tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Header } from "@/components/nav/Header";

describe("Header mobile navigation", () => {
  it("renders a hamburger button", () => {
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it("shows mobile nav links after clicking hamburger", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const mobileNav = screen.getByRole("navigation", { name: /mobile/i });
    expect(within(mobileNav).getByText("Services")).toBeInTheDocument();
    expect(within(mobileNav).getByText("For Clinicians")).toBeInTheDocument();
    expect(within(mobileNav).getByText("Resources")).toBeInTheDocument();
  });

  it("hamburger button label switches to close when menu is open", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(
      screen.getByRole("button", { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it("collapses mobile nav after clicking close", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it("closes mobile nav on Escape key", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });
});
