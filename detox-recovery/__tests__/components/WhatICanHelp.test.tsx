import { render, screen } from "@testing-library/react";
import { WhatICanHelp } from "@/components/services/WhatICanHelp";

describe("WhatICanHelp", () => {
  it('renders "What I can help with" heading', () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/what I can help with/i)).toBeInTheDocument();
  });

  it('renders "What I cannot help with" heading', () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/what I cannot help with/i)).toBeInTheDocument();
  });

  it("lists treatment navigation as something it can help with", () => {
    render(<WhatICanHelp />);
    expect(
      screen.getByText(/navigating treatment options/i),
    ).toBeInTheDocument();
  });

  it("lists medical detox supervision as something it cannot help with", () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/medical detox supervision/i)).toBeInTheDocument();
  });

  it("does not claim to diagnose or prescribe", () => {
    render(<WhatICanHelp />);
    expect(screen.getByText(/prescribing/i)).toBeInTheDocument();
    expect(screen.getByText(/diagnosing/i)).toBeInTheDocument();
  });
});
