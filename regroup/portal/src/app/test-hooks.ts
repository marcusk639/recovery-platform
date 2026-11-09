// Only in builds made with --e2e. tools/check-bundle.mjs refuses this in any other.
import { getIdToken } from 'firebase/auth';
import { navigationRef } from '@mobile/navigation/service';
import { Routes } from '@mobile/navigation/types';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import store from '@mobile/state/store';
import { auth, callHttpsFunction, firestore, storage } from '../adapter/firebase-setup';
import { collection, doc, updateDoc } from '../adapter/firebase/firestore';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';

(window as any).__portalTest = {
  refreshToken: () => getIdToken(auth.currentUser!, true),
  callable: (name: string, payload: unknown) => callHttpsFunction(name, payload),
  goBack: () => navigationRef.current?.goBack(),
  selectedGuestId: () => store.getState().guests.selectedGuestId ?? null,
  // For a test's control: a real write request, whether or not the rules allow it.
  writeProbe: () =>
    updateDoc(doc(collection(firestore, 'users'), auth.currentUser!.uid), { infoEntered: true }).catch(() => undefined),
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
