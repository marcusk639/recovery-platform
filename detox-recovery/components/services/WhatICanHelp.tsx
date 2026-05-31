import { CAN_HELP_WITH, CANNOT_HELP_WITH } from "@/lib/scope-of-practice";

export function WhatICanHelp() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h3 className="mb-4 text-lg font-semibold text-teal-700">
          What I can help with
        </h3>
        <ul className="space-y-3">
          {CAN_HELP_WITH.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-slate-700">
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-teal-500"
              >
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-700">
          What I cannot help with
        </h3>
        <ul className="space-y-3">
          {CANNOT_HELP_WITH.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-slate-600">
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-slate-400"
              >
                ✕
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
