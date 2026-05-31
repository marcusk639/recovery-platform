export interface Product {
  id: string;
  name: string;
  type:
    | "guide"
    | "worksheet"
    | "workshop"
    | "newsletter"
    | "lead-magnet"
    | "donation";
  price: string | "free";
  description: string;
  cta: string;
  ctaHref: string;
  availability?: "available" | "coming-soon";
}

export const PRODUCTS: Product[] = [
  {
    id: "family-survival-guide",
    name: "Family Survival Guide",
    type: "guide",
    price: "$19.99",
    description:
      "A practical guide for family members navigating a loved one's withdrawal — what to watch for, what to say, and when to act.",
    cta: "Get the guide",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL ?? "#",
  },
  {
    id: "appointment-prep",
    name: "Appointment Preparation Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "Step-by-step worksheet to prepare for a medical or treatment appointment — questions to ask, history to gather, goals to set.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL ?? "#",
  },
  {
    id: "withdrawal-safety-checklist",
    name: "Withdrawal Safety Checklist",
    type: "worksheet",
    price: "$9.99",
    description:
      "A structured checklist for assessing withdrawal severity and identifying when professional medical care is needed.",
    cta: "Download the checklist",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL ?? "#",
  },
  {
    id: "treatment-comparison",
    name: "Detox/Treatment Center Comparison Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "Evaluate treatment options side-by-side across key criteria: medical supervision, insurance, availability, and approach.",
    cta: "Download the worksheet",
    ctaHref:
      process.env.NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL ?? "#",
  },
  {
    id: "relapse-prevention-plan",
    name: "Post-Withdrawal Relapse-Prevention Planning Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "A structured planning tool for the first 30–90 days after acute withdrawal — triggers, support, contingency plans.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL ?? "#",
  },
  {
    id: "family-workshop",
    name: "Low-Cost Group Workshop for Families",
    type: "workshop",
    price: "paid",
    description:
      "A live group session for family members — practical support, community, and actionable next steps.",
    cta: "Join the waitlist",
    ctaHref: "/contact",
  },
  {
    id: "withdrawal-field-notes",
    name: "Withdrawal Field Notes",
    type: "newsletter",
    price: "free",
    description:
      "A practical newsletter on withdrawal, treatment navigation, and recovery — written from lived experience.",
    cta: "Subscribe free",
    ctaHref: "#",
  },
  {
    id: "lead-magnet-unsafe",
    name: "What to Do When Withdrawal Starts Feeling Unsafe",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide on recognizing danger signs during withdrawal and what to do — for the person going through it.",
    cta: "Get the free guide",
    ctaHref: "#",
  },
  {
    id: "lead-magnet-family",
    name: "How to Help Someone in Withdrawal Without Making It Worse",
    type: "lead-magnet",
    price: "free",
    description:
      "A free guide for family and friends — how to support without shaming, enabling, or escalating crisis.",
    cta: "Get the free guide",
    ctaHref: "#",
  },
  {
    id: "donation",
    name: "Support a Low-Cost Call",
    type: "donation",
    price: "free",
    description:
      "Donate to fund sliding-scale support calls for people who cannot afford full-price sessions.",
    cta: "Make a donation",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_DONATION_URL ?? "#",
  },
];
