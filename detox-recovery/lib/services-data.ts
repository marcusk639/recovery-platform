export interface ServiceTier {
  id: string;
  tier: number;
  name: string;
  duration: string;
  price: string;
  betaLabel?: string;
  status: "available" | "coming-soon";
  purpose: string;
  cta: string;
  ctaHref: string;
  calendarHref?: string;
}

export const SERVICE_TIERS: ServiceTier[] = [
  {
    id: "fit-check",
    tier: 1,
    name: "Free 10-Minute Fit Check",
    duration: "10 min",
    price: "Free",
    status: "available",
    purpose:
      "Determine whether the person needs emergency care, medical detox, a licensed clinician, or a non-clinical support call. This is not crisis care, medical triage, diagnosis, or treatment.",
    cta: "Request a fit check",
    ctaHref: process.env.NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL ?? "#",
  },
  {
    id: "support-call",
    tier: 2,
    name: "30-Minute Withdrawal Support Call",
    duration: "30 min",
    price: "$50",
    betaLabel: "Introductory beta pricing",
    status: "available",
    purpose:
      "Non-clinical support, treatment navigation, appointment preparation, and practical next-step planning.",
    cta: "Book a support call",
    ctaHref: process.env.NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL ?? "#",
    calendarHref: process.env.NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL ?? "#",
  },
  {
    id: "family-call",
    tier: 3,
    name: "60-Minute Family / Navigation Call",
    duration: "60 min",
    price: "$125–$175",
    status: "coming-soon",
    purpose:
      "Help family members understand what may be happening, how to communicate supportively, what red flags require urgent care, and how to help the person connect with appropriate care.",
    cta: "Plan support for someone you love",
    ctaHref: "/contact",
  },
  {
    id: "navigation-package",
    tier: 4,
    name: "Two-Week Navigation Package",
    duration: "2 weeks",
    price: "$300–$600",
    status: "coming-soon",
    purpose:
      "Limited-term support around treatment navigation, appointment follow-through, family communication, and post-acute recovery planning. This is not medical monitoring or detox management.",
    cta: "Ask about navigation support",
    ctaHref: "/contact",
  },
  {
    id: "sliding-scale",
    tier: 5,
    name: "Sliding-Scale / Sponsored Slots",
    duration: "Varies",
    price: "Subsidized",
    status: "coming-soon",
    purpose:
      "Some lower-cost slots may be available when funded by donations or sponsor support. Ask about current availability.",
    cta: "Ask about sliding-scale availability",
    ctaHref: "/contact",
  },
];
