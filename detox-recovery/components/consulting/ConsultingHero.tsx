import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function ConsultingHero() {
  return (
    <Section className="bg-gradient-to-b from-slate-900 to-slate-800 py-24 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-teal-400">
          For treatment programs &amp; healthcare teams
        </p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Patient-Experience Consulting for Withdrawal Care
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          I help treatment teams understand the patient experience of withdrawal
          so they can improve trust, engagement, communication, and retention.
        </p>
        <p className="mt-4 text-slate-400">
          This is patient-side insight and lived-experience pattern recognition
          — not clinical protocol instruction. The value is in the communication
          improvement, workflow friction reduction, and patient education review
          that only someone who has been on the patient side can provide.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Button href="/contact?interest=Patient-Experience%20Training">
            Discuss staff training
          </Button>
          <Button
            href="/contact?interest=Withdrawal%20Journey%20Mapping"
            variant="ghost"
            className="border-slate-400 text-white hover:text-teal-300"
          >
            Request a patient-experience review
          </Button>
        </div>
      </div>
    </Section>
  );
}
