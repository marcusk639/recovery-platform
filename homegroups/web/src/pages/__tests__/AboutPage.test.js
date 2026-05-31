import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AboutPage from "../AboutPage";

// Mock framer-motion and react-intersection-observer to avoid animation state issues
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));
jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: () => {}, inView: true }),
}));
jest.mock("../../components/NewsletterSignup", () => () => (
  <div data-testid="newsletter" />
));

describe("AboutPage — content integrity", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
  });

  test("does not contain fictional team member names", () => {
    expect(screen.queryByText(/James Wilson/i)).toBeNull();
    expect(screen.queryByText(/Sarah Chen/i)).toBeNull();
    expect(screen.queryByText(/Michael Davis/i)).toBeNull();
  });

  test("does not contain fabricated user statistics", () => {
    expect(screen.queryByText(/hundreds of recovery groups/i)).toBeNull();
    expect(screen.queryByText(/thousands of users/i)).toBeNull();
    expect(screen.queryByText(/multiple countries/i)).toBeNull();
  });

  test("does not reference the fictional founder by name", () => {
    // The story prose previously named "James" as founder
    expect(screen.queryByText(/our founder James/i)).toBeNull();
    expect(screen.queryByText(/James envisions/i)).toBeNull();
  });

  test("founder section is present and identifies an actual person", () => {
    // Passes once we replace fictional bios with real content
    expect(screen.getByText("The Founder")).toBeInTheDocument();
    expect(screen.getByText(/Marcus/i)).toBeInTheDocument();
  });
});
