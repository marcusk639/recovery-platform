export const REFERRAL_CONDITIONS = [
  "alcohol withdrawal",
  "benzodiazepine withdrawal",
  "barbiturate withdrawal",
  "GHB or GBL withdrawal",
  "phenibut withdrawal",
  "history of seizures",
  "hallucinations",
  "delirium or acute confusion",
  "pregnancy",
  "suicidal ideation",
  "chest pain",
  "fainting or loss of consciousness",
  "severe dehydration",
  "unstable vital signs",
  "severe psychiatric symptoms",
  "complex polysubstance withdrawal",
] as const;

export type ReferralCondition = (typeof REFERRAL_CONDITIONS)[number];
