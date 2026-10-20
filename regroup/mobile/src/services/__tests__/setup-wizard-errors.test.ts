// toCreateHousesError: which createHouses rejections reach the operator
// verbatim, which get a generic message, and the distinct subscription kind.
import {
  CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE,
  CREATE_HOUSES_RETRY_MESSAGE,
  HOUSES_CREATED_RESTART_MESSAGE,
  isSubscriptionRequiredError,
  SUBSCRIPTION_REQUIRED_CODE,
  SUBSCRIPTION_REQUIRED_MESSAGE,
  toCreateHousesError,
} from '../setup-wizard-errors';

const fnError = (code: unknown, message: unknown) =>
  Object.assign(new Error(), { code, message });

describe('toCreateHousesError', () => {
  it.each(['failed-precondition', 'invalid-argument', 'functions/failed-precondition'])(
    'passes a safe %s message through',
    (code) => {
      const err = fnError(code, '  Property limit reached for your plan ');
      const mapped = toCreateHousesError(err);
      expect(mapped.message).toBe('Property limit reached for your plan');
      expect((mapped as any).cause).toBe(err);
    },
  );

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['non-string', 42],
    ['missing', undefined],
  ])('falls back to the generic message for a safe code with a %s message', (_l, message) => {
    expect(toCreateHousesError(fnError('failed-precondition', message)).message).toBe(
      CREATE_HOUSES_RETRY_MESSAGE,
    );
  });

  it.each([
    ['already-exists', 'A house with this id already exists'],
    ['permission-denied', 'Admin profile does not belong to this user'],
    ['functions/already-exists', 'A house with this id already exists'],
  ])('shows the contact-support message, not the server text, for %s', (code, message) => {
    const mapped = toCreateHousesError(fnError(code, message));
    expect(mapped.message).toBe(CREATE_HOUSES_CONTACT_SUPPORT_MESSAGE);
    expect(mapped.message).not.toContain(message);
  });

  it.each(['failed-precondition', 'functions/failed-precondition'])(
    'maps the %s subscription refusal to the subscription-required kind',
    (code) => {
      const mapped = toCreateHousesError(
        fnError(code, 'An active subscription is required to create a house'),
      );
      expect(mapped.message).toBe(SUBSCRIPTION_REQUIRED_MESSAGE);
      expect((mapped as any).code).toBe(SUBSCRIPTION_REQUIRED_CODE);
      expect(isSubscriptionRequiredError(mapped)).toBe(true);
    },
  );

  it('does not tag other failed-precondition refusals as subscription-required', () => {
    const mapped = toCreateHousesError(
      fnError('failed-precondition', 'Property limit reached for your plan'),
    );
    expect(isSubscriptionRequiredError(mapped)).toBe(false);
    expect((mapped as any).code).toBeUndefined();
  });

  it.each(['internal', 'functions/internal'])(
    'maps %s "Houses were created…" to the restart message',
    (code) => {
      const mapped = toCreateHousesError(
        fnError(code, 'Houses were created but access could not be granted. Try again.'),
      );
      expect(mapped.message).toBe(HOUSES_CREATED_RESTART_MESSAGE);
    },
  );

  it.each([
    ['internal (other message)', fnError('internal', 'INTERNAL')],
    ['unavailable', fnError('unavailable', 'Network error')],
    ['plain Error', new Error('boom')],
    ['string', 'boom'],
    ['null', null],
  ])('uses the generic retry message for %s', (_l, err) => {
    expect(toCreateHousesError(err).message).toBe(CREATE_HOUSES_RETRY_MESSAGE);
  });
});
