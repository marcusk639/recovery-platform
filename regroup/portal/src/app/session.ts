import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useDispatch, useSelector } from 'react-redux';
import { autoLogin, login } from '@mobile/state/slices/userSlice';
import { auth } from '../adapter/firebase-setup';

export type SessionPhase = 'checking' | 'signed-out' | 'signed-in';

// While the form signs in, its login thunk loads the user, so the auth listener
// must not load them a second time.
let interactiveSignIn = false;

export function useRestoreSession(): SessionPhase {
  const dispatch = useDispatch<any>();
  const loggedIn = useSelector((state: any) => state.user.loggedIn);
  const [phase, setPhase] = useState<SessionPhase>('checking');

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setPhase('signed-out');
          return;
        }
        if (interactiveSignIn) return;
        try {
          await dispatch(autoLogin(user)).unwrap();
        } catch {
          await signOut(auth);
          setPhase('signed-out');
        }
      }),
    [dispatch],
  );

  return loggedIn ? 'signed-in' : phase;
}

export function useSignIn(): (email: string, password: string) => Promise<void> {
  const dispatch = useDispatch<any>();
  return async (email, password) => {
    interactiveSignIn = true;
    try {
      await dispatch(login({ email, password })).unwrap();
    } finally {
      interactiveSignIn = false;
    }
  };
}

const CREDENTIAL_ERRORS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

export function signInErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && CREDENTIAL_ERRORS.includes(code)) return "That email or password isn't right.";
  return 'Could not sign in. Check your connection and try again.';
}
