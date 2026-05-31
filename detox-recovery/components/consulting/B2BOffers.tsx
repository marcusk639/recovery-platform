import { B2B_OFFERS } from "@/lib/consulting-data";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export function B2BOffers() {
  return (
    <Section>
      <h2 className="mb-8 text-2xl font-bold text-slate-900">
        How I can help your program
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {B2B_OFFERS.map((offer) => (
          <Card key={offer.id} className="flex flex-col">
            <h3 className="font-semibold text-slate-900">{offer.name}</h3>
            <p className="mt-2 text-sm text-slate-600">{offer.description}</p>
            <ul className="mt-3 flex-1 space-y-1">
              {offer.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-xs text-slate-600">
                  <span className="mt-0.5 text-teal-500">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button href={offer.ctaHref} variant="ghost">
                {offer.cta} →
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
