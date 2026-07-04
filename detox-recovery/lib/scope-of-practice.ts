/**
 * Canonical non-clinical scope-of-practice copy.
 *
 * These lists ARE the legal/clinical boundary of this site. They are
 * rendered by `components/home/TrustSignals.tsx`, `components/services/WhatICanHelp.tsx`,
 * and `app/terms/page.tsx`. Any drift between these surfaces is a compliance
 * risk — that's why all three import from this single source.
 *
 * Edits here are a clinical-safety change. They must be reviewed under
 * the same care as `lib/referral-conditions.ts`. The
 * `__tests__/lib/scope-of-practice.test.ts` parity test will fail if a
 * component diverges from these constants.
 *
 * Do not add items that imply medical advice, diagnosis, or treatment.
 * Do not remove items that disclaim clinical capability.
 */

export const CAN_HELP_WITH = [
  "Understanding what withdrawal typically involves for your specific substance",
  "Finding the right level of care — outpatient, inpatient, medical detox, or MAT",
  "Preparing questions and history before a medical or treatment appointment",
  "Navigating treatment options when you don't know where to start",
  "Helping a family member understand what their loved one is going through",
  "Planning practical next steps when acute withdrawal is winding down",
  "Understanding what to expect from the post-acute recovery period",
] as const;

export const CANNOT_HELP_WITH = [
  "Medical detox supervision, monitoring, or management",
  "Crisis intervention or emergency mental health care",
  "Diagnosing withdrawal severity or predicting medical risk",
  "Prescribing, recommending, adjusting, or advising on medications",
  "Providing clinical treatment of any kind",
  "Replacing a licensed counselor, therapist, nurse, or physician",
  "Determining whether someone is medically safe to detox at home",
] as const;

export type CanHelpItem = (typeof CAN_HELP_WITH)[number];
export type CannotHelpItem = (typeof CANNOT_HELP_WITH)[number];
