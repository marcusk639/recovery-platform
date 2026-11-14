import type Stripe from 'stripe';
import {
  isLaunchCancellation,
  LAUNCH_CANCEL_METADATA_KEY,
  PAYMENT_ACTION_NOTICE,
  trialEndingNotice,
} from '../../webhooks/subscriptionNotices';

const sub = (fields: Record<string, unknown>) =>
  ({ id: 'sub_1', metadata: {}, ...fields }) as unknown as Stripe.Subscription;

describe('isLaunchCancellation', () => {
  it('is true for a subscription the launch cancellation marked', () => {
    expect(LAUNCH_CANCEL_METADATA_KEY).toBe('regroup_launch_cancel');
    expect(isLaunchCancellation(sub({ metadata: { regroup_launch_cancel: 'true' } }))).toBe(true);
  });

  it('is false otherwise', () => {
    expect(isLaunchCancellation(sub({ metadata: {} }))).toBe(false);
    expect(isLaunchCancellation(sub({ metadata: { regroup_launch_cancel: 'false' } }))).toBe(false);
  });
});

describe('trialEndingNotice', () => {
  it('tells the operator the day the trial ends', () => {
    const notice = trialEndingNotice(sub({ trial_end: 1767225600 }));
    expect(notice).toEqual({
      title: 'Your free trial ends soon',
      body: 'Your Regroup free trial ends on January 1. Your card will be charged then unless you cancel.',
    });
  });

  it('is null without a trial end', () => {
    expect(trialEndingNotice(sub({ trial_end: null }))).toBeNull();
  });
});

describe('PAYMENT_ACTION_NOTICE', () => {
  it('asks the operator to confirm the payment', () => {
    expect(PAYMENT_ACTION_NOTICE).toEqual({
      title: 'Confirm your payment',
      body: 'Your bank needs you to confirm your Regroup payment. Open billing in Regroup to finish it.',
    });
  });
});
