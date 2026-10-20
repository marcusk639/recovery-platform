// The no-active-plan createHouses refusal is kept as a distinct error kind so
// OrgSetup can offer the plan screen instead of a generic failure.
jest.mock('../../../services/house', () => ({}));
jest.mock('../../../services/organization', () => ({}));
jest.mock('../../../services/setup-wizard', () => ({ initializeHouses: jest.fn() }));

import { configureStore } from '@reduxjs/toolkit';
import { initializeHouses } from '../../../services/setup-wizard';
import {
  SUBSCRIPTION_REQUIRED_MESSAGE,
  toCreateHousesError,
} from '../../../services/setup-wizard-errors';
import setupReducer, {
  resetSubmissionState,
  selectSetupErrorKind,
  submitHouseSetup,
} from '../setupSlice';

const arg = { houses: {}, operator: { id: 'op' } as any };
const makeStore = () => configureStore({ reducer: { setup: setupReducer } });
const reject = (err: unknown) => (initializeHouses as jest.Mock).mockRejectedValueOnce(err);
const fnError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('setupSlice errorKind', () => {
  it('records subscription-required when initializeHouses rejects with that kind', async () => {
    reject(
      toCreateHousesError(
        fnError('failed-precondition', 'An active subscription is required to create a house'),
      ),
    );
    const store = makeStore();
    await store.dispatch(submitHouseSetup(arg));

    expect(store.getState().setup.submittingFailed).toBe(true);
    expect(store.getState().setup.error).toBe(SUBSCRIPTION_REQUIRED_MESSAGE);
    expect(selectSetupErrorKind(store.getState())).toBe('subscription-required');
  });

  it('leaves errorKind null for any other failure', async () => {
    reject(
      toCreateHousesError(fnError('failed-precondition', 'Property limit reached for your plan')),
    );
    const store = makeStore();
    await store.dispatch(submitHouseSetup(arg));
    expect(selectSetupErrorKind(store.getState())).toBeNull();
  });

  it('is cleared by a new submission and by resetSubmissionState', async () => {
    reject(
      toCreateHousesError(fnError('failed-precondition', 'An active subscription is required')),
    );
    const store = makeStore();
    await store.dispatch(submitHouseSetup(arg));
    store.dispatch(resetSubmissionState());
    expect(selectSetupErrorKind(store.getState())).toBeNull();

    reject(
      toCreateHousesError(fnError('failed-precondition', 'An active subscription is required')),
    );
    await store.dispatch(submitHouseSetup(arg));
    store.dispatch(submitHouseSetup.pending('', arg));
    expect(selectSetupErrorKind(store.getState())).toBeNull();
  });
});
