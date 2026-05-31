import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { CAN_HELP_WITH, CANNOT_HELP_WITH } from "@/lib/scope-of-practice";

export function TrustSignals() {
  return (
    <Section>
      <h2 className="mb-8 text-2xl font-bold text-slate-900">
        What this is — and what it isn&apos;t
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-semibold text-teal-700">
            What I can help with
          </h3>
          <ul className="space-y-2">
            {CAN_HELP_WITH.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-700">
                <span aria-hidden="true" className="mt-0.5 text-teal-600">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-4 font-semibold text-slate-700">
            What I cannot help with
          </h3>
          <ul className="space-y-2">
            {CANNOT_HELP_WITH.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-600">
                <span aria-hidden="true" className="mt-0.5 text-slate-400">
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Section>
  );
}
