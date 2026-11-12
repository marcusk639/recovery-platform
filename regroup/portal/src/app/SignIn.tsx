import { useState, type FormEvent } from 'react';
import { WEB_BASE_URL } from '@mobile/screens/Subscription/SubscriptionRequiredScreen';
import { signInErrorMessage } from './access';
import { SIGN_OUT_REASON_KEY, useSignIn } from './session';

const field = { padding: 8, font: 'inherit' };

export function SignIn() {
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOutIdle] = useState(() => {
    const idle = sessionStorage.getItem(SIGN_OUT_REASON_KEY) === 'idle';
    sessionStorage.removeItem(SIGN_OUT_REASON_KEY);
    return idle;
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (failure) {
      setError(signInErrorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <form
      id="sign-in-form"
      onSubmit={submit}
      style={{ margin: 'auto', display: 'grid', gap: 12, width: 320, font: '15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Regroup</h1>
      {signedOutIdle && <p role="status" style={{ margin: 0 }}>You were signed out after 15 minutes of inactivity.</p>}
      <label style={{ display: 'grid', gap: 4 }}>
        Email
        <input id="sign-in-email" type="email" autoComplete="username" required style={field} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        Password
        <input id="sign-in-password" type="password" autoComplete="current-password" required style={field} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button id="sign-in-submit" type="submit" disabled={busy} style={{ padding: 10, font: 'inherit' }}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
      {error && <p role="alert" style={{ margin: 0, color: '#b53f22' }}>{error}</p>}
      <a href={`${WEB_BASE_URL}/reset`}>Forgot password?</a>
    </form>
  );
}
