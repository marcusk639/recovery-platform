import '../adapter/preload';
import '@mobile/../i18n';
import { createRoot } from 'react-dom/client';
import { getIdToken } from 'firebase/auth';
import { auth, callHttpsFunction, storage } from '../adapter/firebase-setup';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';
import { Routes } from '@mobile/navigation/types';
import { navigationRef } from '@mobile/navigation/service';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import store from '@mobile/state/store';
import { installUnhandledFeatureAlerts } from '../adapter/unhandled';
import { AccessGate } from './AccessGate';
import { useRestoreSession } from './session';
import { Providers } from './Providers';
import { Shell } from './Shell';
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

function App() {
  const phase = useRestoreSession();
  if (phase === 'checking') return <p role="status" style={{ margin: 'auto' }}>Loading...</p>;
  if (phase === 'signed-out') return <SignIn />;
  return (
    <AccessGate>
      <Shell />
    </AccessGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <Providers>
    <App />
  </Providers>,
);
