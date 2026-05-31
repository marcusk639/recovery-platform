import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export default function NotFound() {
  return (
    <Section className="py-32 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        404
      </p>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-4 text-slate-600">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <div className="mt-8">
        <Button href="/" variant="primary">
          Go back home
        </Button>
      </div>
    </Section>
  );
}
