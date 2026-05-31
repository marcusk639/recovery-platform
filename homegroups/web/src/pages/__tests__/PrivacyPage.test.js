import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import PrivacyPage from "../PrivacyPage";

jest.mock("../../components/NewsletterSignup", () => () => (
  <div data-testid="newsletter" />
));

describe("PrivacyPage — content integrity", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
  });

  test("does not show the placeholder last-updated date", () => {
    expect(screen.queryByText(/January 1, 2023/i)).toBeNull();
  });

  test("does not contain the fictional placeholder address", () => {
    expect(screen.queryByText(/123 Recovery Way/i)).toBeNull();
    expect(screen.queryByText(/Suite 456/i)).toBeNull();
    expect(screen.queryByText(/San Francisco, CA 94103/i)).toBeNull();
  });

  test("shows a real last-updated date (2024 or later)", () => {
    const lastUpdated = screen.getByText(/Last Updated:/i);
    expect(lastUpdated).toBeInTheDocument();
    const year = parseInt(lastUpdated.textContent.match(/\d{4}/)?.[0], 10);
    expect(year).toBeGreaterThanOrEqual(2024);
  });
});
