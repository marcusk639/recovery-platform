// src/__tests__/callable/invitationEmailSecret.test.ts
//
// createInvitation sends the invitation email itself (util/inviteEmails ->
// util/email), and util/email reads SENDGRID_API_KEY from process.env. A v2
// function gets a Secret Manager value in process.env only when it binds the
// secret, and sendEmail swallows the SendGrid failure, so an unbound function
// still returns a token while no email is ever sent. invitations.test.ts
// stubs onCall and drops its options, so this file loads the real onCall and
// reads the deployed binding from the function's endpoint.

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(), increment: jest.fn() },
    Timestamp: { now: jest.fn(), fromMillis: jest.fn(), fromDate: jest.fn() },
  }),
}));
// api/firestore opens collections when it is imported; nothing here runs a query.
jest.mock('../../api/firestore', () => ({}));

import { createInvitation } from '../../callable/invitations';

type Endpoint = { secretEnvironmentVariables?: Array<{ key: string }> };

describe('createInvitation secret bindings', () => {
  it('binds SENDGRID_API_KEY so the invitation email can be sent', () => {
    const endpoint = (createInvitation as unknown as { __endpoint: Endpoint }).__endpoint;
    const keys = (endpoint.secretEnvironmentVariables ?? []).map((s) => s.key);
    expect(keys).toContain('SENDGRID_API_KEY');
  });
});
