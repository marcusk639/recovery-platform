export type OfficerRole =
  | 'president'
  | 'treasurer'
  | 'secretary'
  | 'comptroller';

export interface Officer {
  id: string;
  houseId: string;
  role: OfficerRole;
  isActive: boolean;
  // Set during onboarding; may be a placeholder name until the officer creates an account
  name?: string;
  // Populated after formal election via the app — absent on onboarding-created records
  userId?: string;
  termStartDate?: string;
  termEndDate?: string;
  electedAt?: string;
  createdAt?: string;
}
