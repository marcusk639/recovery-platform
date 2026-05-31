import type { Product } from "@/lib/products-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const isComingSoon = product.availability === "coming-soon";

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <Badge color={product.price === "free" ? "teal" : "slate"}>
          {product.price === "free" ? "Free" : product.price}
        </Badge>
        {isComingSoon && <Badge color="slate">Coming soon</Badge>}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{product.name}</h3>
      <p className="mt-2 flex-1 text-sm text-slate-600">
        {product.description}
      </p>
      <div className="mt-4">
        {isComingSoon ? (
          <span className="inline-block cursor-not-allowed rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400">
            Available soon
          </span>
        ) : (
          <Button
            href={product.ctaHref}
            variant={product.price === "free" ? "primary" : "secondary"}
          >
            {product.cta}
          </Button>
        )}
      </div>
    </Card>
  );
}
