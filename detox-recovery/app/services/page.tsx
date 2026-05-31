import type { Metadata } from "next";
import { SERVICE_TIERS } from "@/lib/services-data";
import { Section } from "@/components/ui/Section";
import { ReferralTriggers } from "@/components/services/ReferralTriggers";
import { ServiceCard } from "@/components/services/ServiceCard";
import { ServiceComparisonTable } from "@/components/services/ServiceComparisonTable";
import { WhatICanHelp } from "@/components/services/WhatICanHelp";

export const metadata: Metadata = {
  title: "Services — Withdrawal Support",
  description:
    "Non-clinical withdrawal support services: free fit check, 30-minute support calls, family navigation, and more.",
};

export default function ServicesPage() {
  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Services</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Non-clinical support for people navigating withdrawal and the people
          who care about them. Start with a free 10-minute fit check to find the
          right level of support.
        </p>
      </Section>

      <Section>
        <h2 className="mb-6 text-2xl font-bold text-slate-900">
          Compare all services
        </h2>
        <ServiceComparisonTable />
      </Section>

      <Section className="bg-slate-50">
        <div className="space-y-6">
          {SERVICE_TIERS.map((tier) => (
            <ServiceCard key={tier.id} tier={tier} />
          ))}
        </div>
        {/* TODO: Add Stripe Payment Links for each available service tier */}
        {/* TODO: Add Calendly scheduling links to each service card */}
      </Section>

      <Section>
        <h2 className="mb-8 text-2xl font-bold text-slate-900">
          What I can help with
        </h2>
        <WhatICanHelp />
      </Section>

      <Section className="bg-amber-50">
        <ReferralTriggers />
      </Section>

      {/* TODO: Add testimonials section when real consented testimonials are available */}
    </>
  );
}
