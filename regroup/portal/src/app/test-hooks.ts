// Only in builds made with --e2e. tools/check-bundle.mjs refuses this in any other.
import { getIdToken } from 'firebase/auth';
import { navigationRef } from '@mobile/navigation/service';
import { Routes } from '@mobile/navigation/types';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import store from '@mobile/state/store';
import { auth, callHttpsFunction, firestore, storage } from '../adapter/firebase-setup';
import { collection, doc, updateDoc } from '../adapter/firebase/firestore';
import { getDownloadURL, putFile, ref } from '../adapter/firebase/storage';
import { disputeActivity, resolveDispute } from '@mobile/services/activity';
import { reopenDispute } from '@mobile/services/reopenDispute';

// The id the phone's dispute hooks pass: the signed-in user in the store.
async function storeUserId(): Promise<string> {
  for (let i = 0; i < 100 && !store.getState().user.user?.id; i++) await new Promise((r) => setTimeout(r, 100));
  const id = store.getState().user.user?.id;
  if (!id) throw new Error('no signed-in user in the store');
  return id;
}

// The phone's own dispute writes, unchanged, reporting how each ended.
async function attempt(write: (uid: string) => Promise<void>) {
  try {
    await write(await storeUserId());
    return { ok: true };
  } catch (error) {
    const e = error as { message?: string; code?: string; cause?: { code?: string } };
    return { ok: false, message: String(e.message), code: e.code ?? e.cause?.code };
  }
}

(window as any).__portalTest = {
  refreshToken: () => getIdToken(auth.currentUser!, true),
  uid: () => auth.currentUser?.uid ?? null,
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
  // Opens the e2e-only screen that throws, for the crash-recovery journeys.
  openCrash: () => navigationRef.current?.navigate('portalTestCrash' as never),
  // The rules have no document path yet, so tests prove uploads through temp/.
  disputes: {
    raise: (id: string, reason: string) => attempt((uid) => disputeActivity(id, reason, uid)),
    decide: (id: string, outcome: 'approve' | 'reject') => attempt((uid) => resolveDispute(id, uid, outcome)),
    reopen: (id: string) => attempt((uid) => reopenDispute(id, uid)),
  },
  uploadToTemp: async (localUri: string) => {
    const reference = ref(storage, `temp/${auth.currentUser!.uid}/probe.pdf`);
    await putFile(reference, localUri, { contentType: 'application/pdf' });
    return getDownloadURL(reference);
  },
};
