import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { SERVICE_TIERS } from "@/lib/services-data";

export function HeroSection() {
  const supportCall = SERVICE_TIERS.find((t) => t.id === "support-call");
  const supportCallLabel = supportCall
    ? `Book a support call — ${supportCall.price}${
        supportCall.betaLabel ? " beta" : ""
      }`
    : "Book a support call";

  return (
    <Section className="bg-gradient-to-b from-teal-50 to-white py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-teal-700">
          Non-clinical withdrawal support
        </p>
        <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
          I help people find the next safe step when withdrawal makes everything
          feel impossible.
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          This is not medical care. It is support for what comes next —
          navigating treatment options, preparing for appointments, and making
          sense of what is happening.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button href="/services#fit-check" variant="primary">
            Request a free fit check
          </Button>
          <Button href="/services#support-call" variant="secondary">
            {supportCallLabel}
          </Button>
        </div>
      </div>
    </Section>
  );
}
