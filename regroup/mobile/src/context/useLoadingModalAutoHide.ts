import { useEffect, useRef } from 'react';

/** How long a finished save's success or error stays up, as RatsLoadingModal shows it. */
export const LOADING_MODAL_HIDE_MS = 1000;

/**
 * Hides the loading modal in the provider once a save finishes.
 *
 * RatsLoadingModal hides itself 1 s after `loading` goes true -> false, but only
 * in its own state; the context kept `visible: true`. On iOS the modals move
 * between hosts (the top sheet's ScreenModalHost or the root) whenever a sheet
 * opens or closes, which remounts RatsLoadingModal: the new instance mounted
 * visible with nothing left to hide it, and blocked the app. Clearing
 * `visible` here, on the same schedule, makes every later mount hidden, and
 * lets the next save show the modal again.
 */
export function useLoadingModalAutoHide(
  loading: boolean,
  visible: boolean,
  hide: () => void,
): void {
  const wasLoading = useRef(loading);

  useEffect(() => {
    const finished = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!finished || !visible) {
      return;
    }
    const timer = setTimeout(hide, LOADING_MODAL_HIDE_MS);
    return () => clearTimeout(timer);
  }, [loading, visible, hide]);
}
