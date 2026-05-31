import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { B2BLeadMagnet } from "@/components/consulting/B2BLeadMagnet";
import { B2BOffers } from "@/components/consulting/B2BOffers";
import { ConsultingHero } from "@/components/consulting/ConsultingHero";

export const metadata: Metadata = {
  title: "Patient-Experience Consulting — Withdrawal Support",
  description:
    "Lived-experience consulting for treatment programs and healthcare teams — improve patient trust, communication, and retention in withdrawal care.",
};

export default function ConsultingPage() {
  return (
    <>
      <ConsultingHero />
      <B2BOffers />
      <B2BLeadMagnet />

      <Section className="bg-slate-50">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold text-slate-900">
            Bring lived-experience insight to your program
          </h2>
          <p className="mt-3 text-slate-600">
            Whether you&apos;re a detox center, MOUD clinic, residential
            program, or behavioral health startup, patient-experience consulting
            can improve the parts of care that clinical training alone
            doesn&apos;t address.
          </p>
          <div className="mt-6">
            <a
              href="/contact"
              className="font-medium text-teal-700 hover:underline"
            >
              Get in touch to discuss how this could work for your program →
            </a>
          </div>
        </div>
      </Section>
    </>
  );
}
