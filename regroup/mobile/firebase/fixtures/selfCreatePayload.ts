/**
 * One fixture for the invited self-create rule (firestore.rules
 * isInvitedSelfCreate), shared by the rules suite
 * (firebase/__tests__/admissionTicket.rules.test.ts) and the SignUp drift
 * guard (src/screens/SignUp/__tests__/selfCreatePayload.test.ts), which runs
 * the app's real builder (buildSelfCreateGuest) against it.
 *
 * SELF_CREATE_FIXED_VALUES are the values the rule requires. The payload is
 * what this build sends; `legacy: true` drops createdBy/updatedBy, as builds
 * before it send none.
 */
export const SELF_CREATE_FIXED_VALUES = {
  status: 'active',
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  version: 0,
  step: 1,
  infoEntered: false,
  hasJob: false,
  supporters: [] as unknown[],
  jobs: [] as unknown[],
};

export function selfCreatePayload(
  uid: string,
  houseId: string,
  extra: Record<string, unknown> = {},
  opts: { legacy?: boolean } = {},
): Record<string, unknown> {
  return {
    id: 'g1',
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
    ...(opts.legacy ? {} : { createdBy: uid, updatedBy: uid }),
    userId: uid,
    houseId,
    displayName: '',
    firstName: 'New',
    lastName: 'Resident',
    email: 'new@example.com',
    phoneNumber: '555-0100',
    sobrietyDate: '',
    drugOfChoice: '',
    phase: '',
    isAdmin: false,
    ...SELF_CREATE_FIXED_VALUES,
    ...extra,
  };
}
