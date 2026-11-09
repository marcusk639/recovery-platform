import '../adapter/preload';
import '@mobile/../i18n';
import { useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { getIdToken } from 'firebase/auth';
import { useDispatch, useSelector } from 'react-redux';
import { auth, callHttpsFunction, storage } from '../adapter/firebase-setup';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';
import { Routes } from '@mobile/navigation/types';
import ErrorBoundary from '@mobile/components/ErrorBoundary';
import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { navigationRef } from '@mobile/navigation/service';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import store from '@mobile/state/store';
import { installUnhandledFeatureAlerts } from '../adapter/unhandled';
import { selectHouseById } from '@mobile/state/slices/housesSlice';
import { AccessGate } from './AccessGate';
import { Nav } from './Nav';
import { useRestoreSession } from './session';
import { Providers } from './Providers';
import { Screens } from './routes';
import { SignIn } from './SignIn';

installUnhandledFeatureAlerts();

(window as any).__portalTest = {
  refreshToken: () => getIdToken(auth.currentUser!, true),
  callable: (name: string, payload: unknown) => callHttpsFunction(name, payload),
  // For the screen survey: opens a route by its key in the phone's Routes enum.
  open: (routeKey: string, params?: object) => {
    store.dispatch(selectGuestById('guest-a'));
    navigationRef.current?.navigate(Routes[routeKey], params);
  },
  // The rules have no document path yet, so tests prove uploads through temp/.
  uploadToTemp: async (localUri: string) => {
    const reference = ref(storage, `temp/${auth.currentUser!.uid}/probe.pdf`);
    await putFile(reference, localUri, { contentType: 'application/pdf' });
    return getDownloadURL(reference);
  },
};

const houseId = new URLSearchParams(location.search).get('house') ?? 'test-house-123';

// Disputes.tsx returns before some of its hooks when the house or user is missing,
// so it crashes if it first renders before they load. Screens wait for both.
function WhenHouseLoaded({ children }: { children: ReactNode }) {
  const { house, isLoading } = useSelectedHouse();
  const userId = useSelector((state: any) => state.user.user?.id);
  if (house && userId) return <>{children}</>;
  const message = isLoading ? 'Loading this house...' : 'Could not load this house.';
  return <p role="status" style={{ margin: 'auto' }}>{message}</p>;
}

function Harness() {
  const dispatch = useDispatch();
  const phase = useRestoreSession();
  useEffect(() => {
    if (phase === 'signed-in') dispatch(selectHouseById(houseId));
  }, [phase, dispatch]);
  if (phase === 'checking') return <p role="status" style={{ margin: 'auto' }}>Loading...</p>;
  if (phase === 'signed-out') return <SignIn />;
  return (
    <AccessGate>
    <WhenHouseLoaded>
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Nav houseId={houseId} />
      {/* Screens collapse to zero height without a flex column here. */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary>
          <Screens />
        </ErrorBoundary>
      </main>
    </div>
    </WhenHouseLoaded>
    </AccessGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <Providers>
    <Harness />
  </Providers>,
);
