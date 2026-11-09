import type { ReactNode } from 'react';
import GracePeriodBanner from '@mobile/components/subscription/GracePeriodBanner';
import { useSubscriptionGate } from '@mobile/hooks/useSubscriptionGate';
import { WEB_PORTAL_URL } from '@mobile/screens/Subscription/SubscriptionRequiredScreen';
import { Notice, noticeStyle } from './Notice';

// Uses the phone's gate logic rather than its SubscriptionGate component, because
// that screen's Sign out button runs the phone's logout, which signs in anonymously.
// It sits below HouseGate, so it checks the house in the URL, and the sidebar stays.
export function SubscriptionCheck({ children }: { children: ReactNode }) {
  const result = useSubscriptionGate();
  if (result.status === 'loading') return <p role="status" style={noticeStyle}>Loading...</p>;
  if (result.status === 'subscription_required' || result.status === 'grace_expired') {
    return (
      <Notice title="This house's subscription has ended" testId="subscription-required-screen">
        <p>To continue managing this house, renew your subscription on the Regroup website.</p>
        <p style={{ display: 'flex', gap: 8 }}>
          <a href={WEB_PORTAL_URL} target="_blank" rel="noreferrer">
            Manage subscription
          </a>
          <button type="button" onClick={() => location.reload()}>
            I've subscribed
          </button>
        </p>
      </Notice>
    );
  }
  if (result.status === 'grace_period') {
    return (
      <>
        <GracePeriodBanner endsAt={result.endsAt} />
        {children}
      </>
    );
  }
  return <>{children}</>;
}
