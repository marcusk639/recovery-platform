import { render, screen } from "@testing-library/react";
import ContactPage from "@/app/contact/page";

describe("Contact page", () => {
  it("renders the page heading", async () => {
    render(await ContactPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { name: /get in touch/i }),
    ).toBeInTheDocument();
  });

  it("renders the contact form", async () => {
    render(await ContactPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("button", { name: /send message/i }),
    ).toBeInTheDocument();
  });

  it("pre-selects interest when passed as query param", async () => {
    render(
      await ContactPage({
        searchParams: Promise.resolve({
          interest: "Patient-Experience Training",
        }),
      }),
    );
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("Patient-Experience Training");
  });

  it("leaves interest blank for an unrecognised query param value", async () => {
    render(
      await ContactPage({
        searchParams: Promise.resolve({ interest: "Unknown Service" }),
      }),
    );
    const select = screen.getByLabelText(
      /area of interest/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
  });
});
