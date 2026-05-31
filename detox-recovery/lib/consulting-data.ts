export interface B2BOffer {
  id: string;
  name: string;
  description: string;
  bullets: string[];
  cta: string;
  ctaHref: string;
}

export const B2B_OFFERS: B2BOffer[] = [
  {
    id: "patient-experience-training",
    name: "Patient-Experience Training",
    description: "Staff learn the withdrawal experience from the patient side.",
    bullets: [
      "What withdrawal feels like from the patient side",
      "Why patients panic, leave detox, or disengage",
      "How shame and distrust affect treatment engagement",
    ],
    cta: "Discuss staff training",
    ctaHref: "/contact?interest=Patient-Experience%20Training",
  },
  {
    id: "journey-mapping",
    name: "Withdrawal Journey Mapping",
    description:
      "Map the patient experience from first call to post-discharge.",
    bullets: [
      "Map the experience from first call to intake, acute withdrawal, discharge, and relapse-risk period",
      "Identify friction points and trust breaks",
    ],
    cta: "Request a patient-experience review",
    ctaHref: "/contact?interest=Withdrawal%20Journey%20Mapping",
  },
  {
    id: "communication-workshops",
    name: "Communication Workshops",
    description:
      "Practical language that reduces shame, fear, and defensiveness.",
    bullets: [
      "How staff can speak to patients in withdrawal without escalating shame, fear, or defensiveness",
      "Practical language examples and anti-patterns",
    ],
    cta: "Discuss staff training",
    ctaHref: "/contact?interest=Communication%20Workshops",
  },
  {
    id: "dropout-analysis",
    name: "Dropout / Friction Analysis",
    description:
      "Identify where patients abandon care and recommend improvements.",
    bullets: [
      "Review where patients abandon care",
      "Recommend non-clinical workflow improvements",
    ],
    cta: "Request a patient-experience review",
    ctaHref: "/contact?interest=Dropout%20%2F%20Friction%20Analysis",
  },
  {
    id: "patient-education-review",
    name: "Patient Education Review",
    description: "Evaluate materials for clarity, empathy, and usefulness.",
    bullets: [
      "Review handouts, website copy, onboarding materials, and discharge instructions for clarity, empathy, and usefulness",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "/contact?interest=Patient%20Education%20Review",
  },
  {
    id: "startup-advisory",
    name: "Digital Health / Recovery Startup Advisory",
    description:
      "Patient-experience and product design advisory for recovery startups.",
    bullets: [
      "Advise recovery, MOUD, detox-navigation, peer-support, and behavioral health startups on patient experience and product design",
    ],
    cta: "Bring lived-experience insight to your program",
    ctaHref: "/contact?interest=Digital%20Health%20Startup%20Advisory",
  },
];
