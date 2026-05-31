import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/products-data";
import { Section } from "@/components/ui/Section";
import { LeadMagnetForm } from "@/components/resources/LeadMagnetForm";
import { ProductCard } from "@/components/resources/ProductCard";

export const metadata: Metadata = {
  title: "Resources — Withdrawal Support",
  description:
    "Free guides, practical worksheets, and tools for navigating withdrawal, treatment, and early recovery.",
};

const paidProducts = PRODUCTS.filter(
  (p) => p.price !== "free" && p.type !== "newsletter" && p.type !== "donation",
);
const freeProducts = PRODUCTS.filter(
  (p) => p.price === "free" && p.type === "lead-magnet",
);
const newsletter = PRODUCTS.find((p) => p.type === "newsletter")!;
const donation = PRODUCTS.find((p) => p.id === "donation")!;

export default function ResourcesPage() {
  return (
    <>
      <Section className="bg-slate-50 py-20">
        <h1 className="text-3xl font-bold text-slate-900">Resources</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Guides, worksheets, and tools to help you navigate withdrawal,
          treatment, and early recovery — whether you&apos;re going through it
          or supporting someone who is.
        </p>
      </Section>

      <Section>
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Free guides</h2>
        <p className="mb-8 text-slate-600">Download and share freely.</p>
        <div className="grid gap-6 md:grid-cols-2">
          {freeProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </Section>

      <Section className="bg-teal-50">
        <h2 className="mb-8 text-2xl font-bold text-slate-900">
          Get free guides in your inbox
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <LeadMagnetForm
            title="What to Do When Withdrawal Starts Feeling Unsafe"
            description="A guide for recognizing danger signs during withdrawal and what to do about them."
            tag="lead-magnet-unsafe"
          />
          <LeadMagnetForm
            title="How to Help Someone in Withdrawal Without Making It Worse"
            description="For family and friends — how to support without shaming, enabling, or escalating crisis."
            tag="lead-magnet-family"
          />
        </div>
      </Section>

      <Section>
        <h2 className="mb-2 text-2xl font-bold text-slate-900">
          Worksheets &amp; paid tools
        </h2>
        <p className="mb-8 text-slate-600">
          Practical tools for navigating treatment and early recovery.
        </p>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {paidProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </Section>

      <Section className="bg-slate-50">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              {newsletter.name}
            </h2>
            <p className="mb-6 text-slate-600">{newsletter.description}</p>
            <LeadMagnetForm
              title={newsletter.name}
              description="Practical notes on withdrawal, treatment navigation, and recovery — from lived experience."
              tag="newsletter-withdrawal-field-notes"
              buttonLabel="Subscribe free"
            />
          </div>
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">
              {donation.name}
            </h2>
            <p className="mb-4 text-slate-600">{donation.description}</p>
            <a
              href={donation.ctaHref}
              className="inline-block rounded-md border border-teal-600 px-6 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
            >
              {donation.cta}
            </a>
          </div>
        </div>
      </Section>

      {/* TODO: Add group workshop signup section when workshop is scheduled */}
      {/* TODO: Add testimonials section when real consented testimonials are available */}
      {/* TODO: Add analytics events for PDF downloads and lead magnet conversions */}
    </>
  );
}
