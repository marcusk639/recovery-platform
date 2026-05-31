import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact — Withdrawal Support",
  description:
    "Reach out about patient-experience consulting, staff training, startup advisory, or other B2B inquiries.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ interest?: string }>;
}) {
  const { interest = "" } = await searchParams;

  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Get in touch</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          For consulting, staff training, or startup advisory inquiries, use the
          form below. I respond to all B2B inquiries within 2 business days.
        </p>
      </Section>
      <Section>
        <div className="mx-auto max-w-xl">
          <ContactForm defaultInterest={interest} />
        </div>
      </Section>
    </>
  );
}
