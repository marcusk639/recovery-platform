import { useState, type FormEvent } from 'react';
import { useDispatch } from 'react-redux';
import { login } from '@mobile/state/slices/userSlice';
import { selectHouseById } from '@mobile/state/slices/housesSlice';

export function SignIn({ houseId, onSignedIn }: { houseId: string; onSignedIn: () => void }) {
  const dispatch = useDispatch<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);
    try {
      await dispatch(login({ email, password })).unwrap();
      dispatch(selectHouseById(houseId));
      onSignedIn();
    } catch {
      setFailed(true);
    }
  };

  return (
    <form id="sign-in-form" onSubmit={submit} style={{ margin: 'auto', display: 'grid', gap: 8, width: 300 }}>
      <input id="sign-in-email" aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input id="sign-in-password" aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button id="sign-in-submit" type="submit">Sign in</button>
      {failed && <p role="alert">Could not sign in.</p>}
    </form>
  );
}
