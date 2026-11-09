// Only in builds made with --e2e. tools/check-bundle.mjs refuses this in any other.
import { getIdToken } from 'firebase/auth';
import { navigationRef } from '@mobile/navigation/service';
import { Routes } from '@mobile/navigation/types';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import store from '@mobile/state/store';
import { auth, callHttpsFunction, storage } from '../adapter/firebase-setup';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';

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
