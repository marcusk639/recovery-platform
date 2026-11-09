import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import GracePeriodBanner from '@mobile/components/subscription/GracePeriodBanner';
import { useSubscriptionGate } from '@mobile/hooks/useSubscriptionGate';
import { WEB_PORTAL_URL } from '@mobile/screens/Subscription/SubscriptionRequiredScreen';
import { getRolesFromClaims } from '@mobile/util/roles';
import { accessFor, type AccessUser } from './access';
import { signOutAndReset } from './session';
import { useClaimsRefresh } from './useClaimsRefresh';
import { useIdleSignOut } from './useIdleSignOut';

const page = {
  margin: 'auto',
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  font: '15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

function Notice({ title, testId, children }: { title: string; testId?: string; children?: ReactNode }) {
  return (
    <div data-testid={testId} style={page}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{title}</h1>
      {children}
      <p>
        <button id="sign-out" type="button" onClick={() => signOutAndReset()}>
          Sign out
        </button>
      </p>
    </div>
  );
}

// Uses the phone's gate logic rather than its SubscriptionGate component, because
// that screen's Sign out button runs the phone's logout, which signs in anonymously.
function SubscriptionCheck({ children }: { children: ReactNode }) {
  const result = useSubscriptionGate();
  if (result.status === 'loading') return <p role="status" style={page}>Loading...</p>;
  if (result.status === 'subscription_required' || result.status === 'grace_expired') {
    return (
      <Notice title="Your subscription has ended" testId="subscription-required-screen">
        <p>To continue managing your house, renew your subscription on the Regroup website.</p>
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

export function AccessGate({ children }: { children: ReactNode }) {
  useIdleSignOut();
  useClaimsRefresh();
  const user = useSelector((state: any) => state.user.user) as AccessUser | null;
  const claims = useSelector((state: any) => state.user.token?.claims);
  const access = accessFor(user, claims ? getRolesFromClaims(claims) : {});

  if (access === 'operator') return <SubscriptionCheck>{children}</SubscriptionCheck>;
  if (access === 'setup-incomplete') {
    return (
      <Notice title="Almost there">
        <p>Finish setting up your houses in the Regroup app on your phone, then come back.</p>
      </Notice>
    );
  }
  return (
    <Notice title="Use the phone app">
      <p>The Regroup portal is for house operators and staff. Please use the Regroup app on your phone.</p>
    </Notice>
  );
}
