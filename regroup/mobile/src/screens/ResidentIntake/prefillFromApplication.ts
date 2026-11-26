import type { HouseApplication } from '../../entities/Application';

/** The intake fields an application also collects. */
export interface IntakePrefill {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  sobrietyDate: string;
}

/**
 * The intake form's starting values for an approved application (P5 Task 16).
 * The application holds one name field: the first word is the first name and
 * the rest the last name, which staff can correct before submitting.
 */
export function prefillFromApplication(app: HouseApplication): IntakePrefill {
  const [firstName = '', ...rest] = (app.applicantName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: rest.join(' '),
    email: (app.applicantEmail ?? '').trim(),
    phoneNumber: (app.applicantPhone ?? '').trim(),
    sobrietyDate: (app.sobrietyDate ?? '').trim(),
  };
}
