/**
 * Parity test for the canonical non-clinical scope-of-practice copy.
 *
 * `lib/scope-of-practice.ts` is the single source of truth. Both
 * `TrustSignals` and `WhatICanHelp` must render every item — drift
 * here would re-introduce the legal/clinical risk identified in
 * Phase 1 (H1 / A-L2) of the comprehensive review.
 *
 * If this test fails, do NOT loosen the assertions. Re-sync the
 * offending component to import from `lib/scope-of-practice.ts`.
 */

import { render, screen } from "@testing-library/react";
import { TrustSignals } from "@/components/home/TrustSignals";
import { WhatICanHelp } from "@/components/services/WhatICanHelp";
import { CAN_HELP_WITH, CANNOT_HELP_WITH } from "@/lib/scope-of-practice";

describe("scope-of-practice parity", () => {
  describe("TrustSignals", () => {
    it.each(CAN_HELP_WITH)("renders can-help item: %s", (item) => {
      render(<TrustSignals />);
      expect(screen.getByText(item)).toBeInTheDocument();
    });

    it.each(CANNOT_HELP_WITH)("renders cannot-help item: %s", (item) => {
      render(<TrustSignals />);
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  describe("WhatICanHelp", () => {
    it.each(CAN_HELP_WITH)("renders can-help item: %s", (item) => {
      render(<WhatICanHelp />);
      expect(screen.getByText(item)).toBeInTheDocument();
    });

    it.each(CANNOT_HELP_WITH)("renders cannot-help item: %s", (item) => {
      render(<WhatICanHelp />);
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  describe("canonical constants", () => {
    it("CAN_HELP_WITH is non-empty", () => {
      expect(CAN_HELP_WITH.length).toBeGreaterThan(0);
    });

    it("CANNOT_HELP_WITH is non-empty", () => {
      expect(CANNOT_HELP_WITH.length).toBeGreaterThan(0);
    });

    it("CANNOT_HELP_WITH includes the high-risk clinical disclaimers", () => {
      // These three items are the highest-stakes disclaimers — they were
      // previously missing from TrustSignals (Phase 1 H1). If any of them
      // disappear from the canonical list, this test fails loudly.
      expect(CANNOT_HELP_WITH).toContain(
        "Determining whether someone is medically safe to detox at home",
      );
      expect(CANNOT_HELP_WITH).toContain(
        "Diagnosing withdrawal severity or predicting medical risk",
      );
      expect(CANNOT_HELP_WITH).toContain(
        "Prescribing, recommending, adjusting, or advising on medications",
      );
    });

    it("CAN_HELP_WITH and CANNOT_HELP_WITH do not share items", () => {
      const overlap = (CAN_HELP_WITH as readonly string[]).filter((c) =>
        (CANNOT_HELP_WITH as readonly string[]).includes(c),
      );
      expect(overlap).toEqual([]);
    });
  });
});
