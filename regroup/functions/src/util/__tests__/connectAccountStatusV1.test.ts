/**
 * connectAccountStatusV1.test.ts
 *
 * The Accounts v1 half of the house Connect status mapping, and the dispatch
 * that picks v1 or v2 per house. Houses are destination-charge recipients with
 * no on_behalf_of, so the v1 `transfers` capability decides whether rent can
 * land; charges_enabled / payouts_enabled are carried for display only.
 */

import type Stripe from 'stripe';
import { logger } from 'firebase-functions';
import {
  fetchConnectAccountStatus,
  houseAccountApi,
  mapV1AccountStatus,
} from '../connectAccountStatus';

type CapabilityStatus = 'active' | 'inactive' | 'pending';

function v1Account(
  transfers: CapabilityStatus | undefined,
  overrides: Record<string, unknown> = {},
): Stripe.Account {
  return {
    id: 'acct_v1_1',
    object: 'account',
    charges_enabled: false,
    payouts_enabled: false,
    capabilities: transfers === undefined ? {} : { card_payments: transfers, transfers },
    requirements: { currently_due: [], past_due: [], eventually_due: [], disabled_reason: null },
    ...overrides,
  } as unknown as Stripe.Account;
}

describe('mapV1AccountStatus', () => {
  it('is active when the transfers capability is active, whatever charges_enabled says', () => {
    // Rent is a destination charge without on_behalf_of: the house only ever
    // receives a transfer, so charges_enabled is not the signal that gates it.
    const result = mapV1AccountStatus(v1Account('active', { charges_enabled: false }));

    expect(result.status).toBe('active');
    expect(result.transfersEnabled).toBe(true);
    expect(result.transfersStatus).toBe('active');
  });

  it('reports the real charges_enabled and payouts_enabled for display', () => {
    const result = mapV1AccountStatus(
      v1Account('active', { charges_enabled: true, payouts_enabled: false }),
    );

    expect(result.chargesEnabled).toBe(true);
    expect(result.payoutsEnabled).toBe(false);
  });

  it('is pending while Stripe is still reviewing the transfers capability', () => {
    const result = mapV1AccountStatus(v1Account('pending'));

    expect(result.status).toBe('pending');
    expect(result.transfersEnabled).toBe(false);
  });

  it('is restricted when Stripe has disabled the account', () => {
    // card_payments and transfers are coupled: if either is inactive both are
    // disabled, so disabled_reason is the operator's cue whichever one failed.
    const result = mapV1AccountStatus(
      v1Account('inactive', {
        requirements: {
          currently_due: [],
          past_due: ['external_account'],
          eventually_due: [],
          disabled_reason: 'requirements.past_due',
        },
      }),
    );

    expect(result.status).toBe('restricted');
    expect(result.pastDue).toEqual(['external_account']);
  });

  it('is restricted when the operator owes information, even before Stripe disables it', () => {
    const result = mapV1AccountStatus(
      v1Account('inactive', {
        requirements: {
          currently_due: ['individual.ssn_last_4'],
          past_due: [],
          eventually_due: ['individual.id_number'],
          disabled_reason: null,
        },
      }),
    );

    expect(result.status).toBe('restricted');
    expect(result.currentlyDue).toEqual(['individual.ssn_last_4']);
    expect(result.eventuallyDue).toEqual(['individual.id_number']);
  });

  it.each(['requirements.pending_verification', 'under_review', 'listed'])(
    'is pending, not restricted, while Stripe itself is reviewing (%s)',
    (reason) => {
      // These disabled reasons mean the operator has nothing left to do;
      // telling them "Stripe needs more information" would send them back
      // into onboarding for nothing.
      const result = mapV1AccountStatus(
        v1Account('inactive', {
          requirements: {
            currently_due: [],
            past_due: [],
            eventually_due: [],
            pending_verification: ['individual.verification.document'],
            disabled_reason: reason,
          },
        }),
      );

      expect(result.status).toBe('pending');
      expect(result.transfersEnabled).toBe(false);
    },
  );

  it('is restricted when Stripe is reviewing but the operator also owes information', () => {
    const result = mapV1AccountStatus(
      v1Account('inactive', {
        requirements: {
          currently_due: [],
          past_due: ['external_account'],
          eventually_due: [],
          disabled_reason: 'requirements.pending_verification',
        },
      }),
    );

    expect(result.status).toBe('restricted');
  });

  it('is restricted when Stripe has rejected the account, with nothing due', () => {
    const result = mapV1AccountStatus(
      v1Account('inactive', {
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: 'rejected.fraud',
        },
      }),
    );

    expect(result.status).toBe('restricted');
  });

  it('treats null requirement lists as empty', () => {
    const result = mapV1AccountStatus(
      v1Account('pending', {
        requirements: {
          currently_due: null,
          past_due: null,
          eventually_due: null,
          disabled_reason: null,
        },
      }),
    );

    expect(result.status).toBe('pending');
    expect(result.currentlyDue).toEqual([]);
  });

  it('never reports active when the transfers capability is missing', () => {
    const result = mapV1AccountStatus(v1Account(undefined));

    expect(result.status).toBe('pending');
    expect(result.transfersStatus).toBe('absent');
    expect(result.transfersEnabled).toBe(false);
  });

  it('is never closed — v1 has no closed state, a deleted account fails to retrieve', () => {
    expect(mapV1AccountStatus(v1Account('active')).closed).toBe(false);
  });
});

describe('houseAccountApi', () => {
  it.each([
    ['v2', 'v2'],
    ['v1', 'v1'],
    [undefined, 'v1'],
    ['V2', 'v1'],
    [2, 'v1'],
  ])('maps a stored %p to %p', (stored, expected) => {
    // Houses connected before this field existed were all created on v1.
    expect(houseAccountApi(stored)).toBe(expected);
  });
});

describe('houseAccountApi warnings', () => {
  afterEach(() => jest.restoreAllMocks());

  it('warns when a stored value is neither v1, v2 nor absent', () => {
    // Read as v1 regardless — but a v2 house mis-recorded as "V2" would be
    // unlinked without being closed, so the mismatch must be visible.
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    expect(houseAccountApi('V2')).toBe('v1');
    expect(warn).toHaveBeenCalledWith(expect.any(String), { stored: 'V2' });
  });

  it.each([[undefined], ['v1'], ['v2']])('stays quiet for %p', (stored) => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    houseAccountApi(stored);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('fetchConnectAccountStatus', () => {
  function stripeWith(v1Retrieve: jest.Mock, v2Retrieve: jest.Mock): Stripe {
    return {
      accounts: { retrieve: v1Retrieve },
      v2: { core: { accounts: { retrieve: v2Retrieve } } },
    } as unknown as Stripe;
  }

  it('reads a v1 house through the v1 accounts resource only', async () => {
    // This platform rejects v1 accounts on v2 endpoints
    // (v1_account_instead_of_v2_account), so the version must be honoured.
    const v1Retrieve = jest.fn().mockResolvedValue(v1Account('active'));
    const v2Retrieve = jest.fn();

    const result = await fetchConnectAccountStatus(
      stripeWith(v1Retrieve, v2Retrieve),
      'acct_v1_1',
      'v1',
    );

    expect(v1Retrieve).toHaveBeenCalledWith('acct_v1_1');
    expect(v2Retrieve).not.toHaveBeenCalled();
    expect(result.status).toBe('active');
  });

  it('reads a v2 house through v2.core.accounts only', async () => {
    const v1Retrieve = jest.fn();
    const v2Retrieve = jest.fn().mockResolvedValue({
      id: 'acct_v2_1',
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } },
      },
    });

    const result = await fetchConnectAccountStatus(
      stripeWith(v1Retrieve, v2Retrieve),
      'acct_v2_1',
      'v2',
    );

    expect(v2Retrieve).toHaveBeenCalled();
    expect(v1Retrieve).not.toHaveBeenCalled();
    expect(result.status).toBe('active');
  });
});
