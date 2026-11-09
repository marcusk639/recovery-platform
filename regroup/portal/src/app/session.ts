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

export const SIGN_OUT_REASON_KEY = 'portal-signout-reason';

// The full page load is the point: it wipes the Redux store and the query cache,
// so nothing about residents stays in memory. Don't use the phone's logout thunk,
// which signs in anonymously afterward.
export async function signOutAndReset(reason?: 'idle'): Promise<void> {
  await signOut(auth);
  if (reason) sessionStorage.setItem(SIGN_OUT_REASON_KEY, reason);
  location.replace('/');
}
