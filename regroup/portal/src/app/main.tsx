import '../adapter/preload';
import '@mobile/../i18n';
import { createRoot } from 'react-dom/client';
import { installUnhandledFeatureAlerts } from '../adapter/unhandled';
import { AccessGate } from './AccessGate';
import { useRestoreSession } from './session';
import { Providers } from './Providers';
import { Shell } from './Shell';
import { SignIn } from './SignIn';

installUnhandledFeatureAlerts();

if (__E2E__) require('./test-hooks');

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
