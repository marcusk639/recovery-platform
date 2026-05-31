"use client";

import { forwardRef } from "react";

// Hidden field that legitimate users (and screen readers) never interact with.
// Bots that auto-fill inputs by name will populate it; the server treats any
// non-empty value as a bot signal and silently drops the submission.
export const HoneypotInput = forwardRef<HTMLInputElement>(
  function HoneypotInput(_props, ref) {
    return (
      <input
        ref={ref}
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        defaultValue=""
        className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden opacity-0"
      />
    );
  },
);
