import { useEffect } from 'react';
import { getIdToken } from 'firebase/auth';
import { useDispatch } from 'react-redux';
import { autoLogin } from '@mobile/state/slices/userSlice';
import { auth } from '../adapter/firebase-setup';

export const CLAIMS_REFRESH_MS = 10 * 60 * 1000;

// A token keeps its old claims for up to an hour, and a browser tab can stay open
// far longer than the phone's app-start refresh assumes.
export function useClaimsRefresh(): void {
  const dispatch = useDispatch<any>();
  useEffect(() => {
    let running = false;
    const refresh = async () => {
      const user = auth.currentUser;
      if (running || !user) return;
      running = true;
      try {
        await getIdToken(user, true);
        await dispatch(autoLogin(user)).unwrap();
      } catch {
        // A failed refresh, as when offline, must not end the session.
      } finally {
        running = false;
      }
    };
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, CLAIMS_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', refresh);
      clearInterval(interval);
    };
  }, [dispatch]);
}
