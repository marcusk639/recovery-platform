import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Thank You — Withdrawal Support",
  description: "Your purchase is confirmed.",
};

const FIT_CHECK_URL =
  process.env.NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL ?? "/contact";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isCall = type === "call";

  return (
    <>
      <Section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-xl text-center">
          <div className="mb-6 flex justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-3xl text-teal-700">
              ✓
            </span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {isCall ? "You're booked." : "You're all set."}
          </h1>
          <p className="mt-4 text-slate-600">
            {isCall
              ? "Check your email for your Calendly confirmation and any prep instructions. I look forward to talking with you."
              : "Check your email — your guide is on its way. If it doesn't arrive within a few minutes, check your spam folder."}
          </p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-xl">
          <h2 className="mb-2 text-xl font-bold text-slate-900">
            What would you like to do next?
          </h2>
          <p className="mb-8 text-slate-600">
            {isCall
              ? "While you wait for your call, take a look at the free guides — they're useful for the conversation."
              : "A free 10-minute fit check is the fastest way to figure out if a support call makes sense for your situation."}
          </p>
          <div className="flex flex-wrap gap-4">
            {!isCall && (
              <Button href={FIT_CHECK_URL} variant="primary">
                Book a free fit check
              </Button>
            )}
            <Button
              href="/resources"
              variant={isCall ? "primary" : "secondary"}
            >
              Browse free resources
            </Button>
          </div>
        </div>
      </Section>

      <Section className="bg-teal-50">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-2 text-lg font-bold text-slate-900">
            Stay in the loop
          </h2>
          <p className="mb-4 text-slate-600">
            Withdrawal Field Notes is a practical newsletter on withdrawal,
            treatment navigation, and recovery — written from lived experience.
            Free, and you can unsubscribe anytime.
          </p>
          <Button href="/resources#newsletter" variant="ghost">
            Subscribe to the newsletter
          </Button>
        </div>
      </Section>
    </>
  );
}
