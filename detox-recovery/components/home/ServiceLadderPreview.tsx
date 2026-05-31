import { SERVICE_TIERS } from "@/lib/services-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

export function ServiceLadderPreview() {
  const featured = SERVICE_TIERS.slice(0, 3);

  return (
    <Section className="bg-slate-50">
      <h2 className="mb-2 text-2xl font-bold text-slate-900">
        How we can work together
      </h2>
      <p className="mb-8 text-slate-600">
        Start with a free fit check — no commitment required.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        {featured.map((tier) => (
          <Card key={tier.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">
                Tier {tier.tier}
              </span>
              {tier.betaLabel && <Badge color="amber">{tier.betaLabel}</Badge>}
              {tier.status === "coming-soon" && (
                <Badge color="slate">Coming soon</Badge>
              )}
            </div>
            <h3 className="mt-3 font-semibold text-slate-900">{tier.name}</h3>
            <p className="mt-2 flex-1 text-sm text-slate-600">{tier.purpose}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-lg font-bold text-slate-900">
                {tier.price}
              </span>
              <Button
                href={tier.ctaHref}
                variant={tier.status === "available" ? "primary" : "ghost"}
              >
                {tier.cta}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <a
          href="/services"
          className="font-medium text-teal-700 hover:underline"
        >
          See all services including family calls, navigation packages, and
          sliding-scale slots →
        </a>
      </p>
    </Section>
  );
}
