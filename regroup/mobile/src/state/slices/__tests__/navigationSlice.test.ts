/**
 * Navigation Slice Tests
 *
 * Tests for Redux Toolkit navigation state management
 */

import navigationReducer, {
  setTitle,
  setModalShowing,
} from '../navigationSlice';

describe('navigationSlice', () => {
  const initialState = {
    currentTitle: '',
    modalShowing: false,
  };

  // ── Initial State ──────────────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should return initial state on unknown action', () => {
      const state = navigationReducer(undefined, { type: 'unknown' });
      expect(state).toEqual(initialState);
    });
  });

  // ── setTitle ───────────────────────────────────────────────────────────────

  describe('setTitle', () => {
    it('should set the current title', () => {
      const state = navigationReducer(initialState, setTitle('Dashboard'));
      expect(state.currentTitle).toBe('Dashboard');
    });

    it('should update the title when called again', () => {
      const stateWithTitle = { ...initialState, currentTitle: 'Dashboard' };
      const state = navigationReducer(stateWithTitle, setTitle('Reports'));
      expect(state.currentTitle).toBe('Reports');
    });

    it('should set the title to an empty string', () => {
      const stateWithTitle = { ...initialState, currentTitle: 'Dashboard' };
      const state = navigationReducer(stateWithTitle, setTitle(''));
      expect(state.currentTitle).toBe('');
    });

    it('should not change modalShowing when setting title', () => {
      const stateWithModal = { ...initialState, modalShowing: true };
      const state = navigationReducer(stateWithModal, setTitle('Guests'));
      expect(state.modalShowing).toBe(true);
    });
  });

  // ── setModalShowing ────────────────────────────────────────────────────────

  describe('setModalShowing', () => {
    it('should set modalShowing to true', () => {
      const state = navigationReducer(initialState, setModalShowing(true));
      expect(state.modalShowing).toBe(true);
    });

    it('should set modalShowing to false', () => {
      const stateWithModal = { ...initialState, modalShowing: true };
      const state = navigationReducer(stateWithModal, setModalShowing(false));
      expect(state.modalShowing).toBe(false);
    });

    it('should not change currentTitle when toggling modal', () => {
      const stateWithTitle = { ...initialState, currentTitle: 'Home' };
      const state = navigationReducer(stateWithTitle, setModalShowing(true));
      expect(state.currentTitle).toBe('Home');
    });

    it('should be idempotent when setting same value', () => {
      const state = navigationReducer(initialState, setModalShowing(false));
      expect(state.modalShowing).toBe(false);
    });
  });

  // ── State Immutability ─────────────────────────────────────────────────────

  describe('State Immutability', () => {
    it('should not mutate the original state when setting title', () => {
      const state = navigationReducer(initialState, setTitle('New Title'));
      expect(state).not.toBe(initialState);
      expect(initialState.currentTitle).toBe('');
    });

    it('should not mutate the original state when setting modal showing', () => {
      const state = navigationReducer(initialState, setModalShowing(true));
      expect(state).not.toBe(initialState);
      expect(initialState.modalShowing).toBe(false);
    });
  });
});
