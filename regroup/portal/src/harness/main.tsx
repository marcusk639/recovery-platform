import '../adapter/preload';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getIdToken } from 'firebase/auth';
import { auth, storage } from '../adapter/firebase-setup';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';
import { Nav } from './Nav';
import { Providers } from './Providers';
import { Screens } from './routes';
import { SignIn } from './SignIn';

(window as any).__portalTest = {
  refreshToken: () => getIdToken(auth.currentUser!, true),
  // The rules have no document path yet, so tests prove uploads through temp/.
  uploadToTemp: async (localUri: string) => {
    const reference = ref(storage, `temp/${auth.currentUser!.uid}/probe.pdf`);
    await putFile(reference, localUri, { contentType: 'application/pdf' });
    return getDownloadURL(reference);
  },
};

const houseId = new URLSearchParams(location.search).get('house') ?? 'test-house-123';

function Harness() {
  const [signedIn, setSignedIn] = useState(false);
  if (!signedIn) return <SignIn houseId={houseId} onSignedIn={() => setSignedIn(true)} />;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Nav houseId={houseId} />
      {/* Screens collapse to zero height without a flex column here. */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <Screens />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <Providers>
    <Harness />
  </Providers>,
);
