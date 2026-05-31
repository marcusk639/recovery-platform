import { REFERRAL_CONDITIONS } from "@/lib/referral-conditions";

export function ReferralTriggers() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-2 text-lg font-bold text-amber-900">
        When I will refer you out immediately
      </h2>
      <p className="mb-4 text-sm text-amber-800">
        If any of the following are present, I will direct you to seek medical
        evaluation, licensed care, urgent care, or emergency care right away.
        These require professional medical attention — not a support call.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {REFERRAL_CONDITIONS.map((condition) => (
          <li
            key={condition}
            className="flex items-start gap-2 text-sm text-amber-900"
          >
            <span className="mt-0.5 shrink-0 font-bold text-amber-600">→</span>
            <span className="capitalize">{condition}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-amber-700">
        If you are in crisis now, call 988 (Suicide &amp; Crisis Lifeline), 911,
        or go to your nearest emergency room.
      </p>
    </div>
  );
}
