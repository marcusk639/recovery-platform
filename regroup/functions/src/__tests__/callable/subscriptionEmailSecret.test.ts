// src/__tests__/callable/subscriptionEmailSecret.test.ts
//
// createOperatorSubscription emails the new-subscriber notice itself
// (util/email), and util/email reads SENDGRID_API_KEY from process.env. A v2
// function gets a Secret Manager value in process.env only when it binds the
// secret, and sendEmail swallows the SendGrid failure, so an unbound function
// still subscribes the operator while no notice is ever sent. This reads the
// deployed bindings from the function's endpoint with the real onCall.

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(), increment: jest.fn(), delete: jest.fn() },
    Timestamp: { now: jest.fn(), fromMillis: jest.fn(), fromDate: jest.fn() },
  }),
}));
// api/firestore opens collections when it is imported; nothing here runs a query.
jest.mock('../../api/firestore', () => ({}));

import { createOperatorSubscription } from '../../callable/subscriptions';

type Endpoint = { secretEnvironmentVariables?: Array<{ key: string }> };

const boundSecrets = (fn: unknown): string[] =>
  ((fn as { __endpoint: Endpoint }).__endpoint.secretEnvironmentVariables ?? []).map((s) => s.key);

describe('createOperatorSubscription secret bindings', () => {
  it('binds SENDGRID_API_KEY so the new-subscriber notice can be sent', () => {
    expect(boundSecrets(createOperatorSubscription)).toContain('SENDGRID_API_KEY');
  });

  it('still binds STRIPE_SECRET_KEY', () => {
    expect(boundSecrets(createOperatorSubscription)).toContain('STRIPE_SECRET_KEY');
  });
});
