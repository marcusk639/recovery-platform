import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { accessFor, type AccessUser } from './access';
import { Notice } from './Notice';
import { signOutAndReset } from './session';
import { useClaimsRefresh } from './useClaimsRefresh';
import { useIdleSignOut } from './useIdleSignOut';
import { useRoles } from './useRoles';

function SignOutButton() {
  return (
    <p>
      <button id="sign-out" type="button" onClick={() => signOutAndReset()}>
        Sign out
      </button>
    </p>
  );
}

export function AccessGate({ children }: { children: ReactNode }) {
  useIdleSignOut();
  useClaimsRefresh();
  const user = useSelector((state: any) => state.user.user) as AccessUser | null;
  const access = accessFor(user, useRoles());

  if (access === 'operator') return <>{children}</>;
  if (access === 'setup-incomplete') {
    return (
      <Notice title="Almost there">
        <p>Finish setting up your houses in the Regroup app on your phone, then come back.</p>
        <SignOutButton />
      </Notice>
    );
  }
  return (
    <Notice title="Use the phone app">
      <p>The Regroup portal is for house operators and staff. Please use the Regroup app on your phone.</p>
      <SignOutButton />
    </Notice>
  );
}
