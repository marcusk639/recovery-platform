import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ServiceTier } from "@/lib/services-data";

interface ServiceCardProps {
  tier: ServiceTier;
}

export function ServiceCard({ tier }: ServiceCardProps) {
  return (
    <Card id={tier.id} className="scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">
          Tier {tier.tier}
        </span>
        <div className="flex gap-2">
          {tier.betaLabel && <Badge color="amber">{tier.betaLabel}</Badge>}
          {tier.status === "coming-soon" && (
            <Badge color="slate">Coming soon</Badge>
          )}
        </div>
      </div>
      <h2 className="mt-2 text-xl font-bold text-slate-900">{tier.name}</h2>
      <div className="mt-1 text-2xl font-semibold text-teal-700">
        {tier.price}
      </div>
      <p className="mt-3 text-slate-600">{tier.purpose}</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          href={tier.ctaHref}
          variant={tier.status === "available" ? "primary" : "secondary"}
        >
          {tier.cta}
        </Button>
        {tier.calendarHref && (
          <a
            href={tier.calendarHref}
            className="rounded text-sm font-medium text-teal-700 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            Check availability <span aria-hidden="true">→</span>
          </a>
        )}
      </div>
    </Card>
  );
}
