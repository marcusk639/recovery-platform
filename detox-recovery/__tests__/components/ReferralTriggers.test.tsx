import { REFERRAL_CONDITIONS } from "@/lib/referral-conditions";

describe("REFERRAL_CONDITIONS", () => {
  const required = [
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
  ];

  required.forEach((condition) => {
    it(`includes "${condition}"`, () => {
      expect(REFERRAL_CONDITIONS).toContain(condition);
    });
  });
});
