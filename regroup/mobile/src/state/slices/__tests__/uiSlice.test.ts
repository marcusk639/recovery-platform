/**
 * UI Slice Tests
 *
 * Tests for Redux Toolkit UI state management
 */

import uiReducer, {
  showModal,
  hideModal,
  hideAllModals,
  setLoading,
  clearLoading,
  showToast,
  hideToast,
} from '../uiSlice';

describe('uiSlice', () => {
  const initialState = {
    modals: {
      activityForm: false,
      disputeModal: false,
      filterModal: false,
      guestForm: false,
      houseForm: false,
      meetingForm: false,
    },
    loading: {
      global: false,
      action: null,
    },
    toast: {
      message: null,
      type: null,
      duration: 3000,
    },
  };

  describe('Modal Actions', () => {
    it('should show a modal', () => {
      const state = uiReducer(initialState, showModal('activityForm'));
      expect(state.modals.activityForm).toBe(true);
    });

    it('should hide a modal', () => {
      const stateWithModal = {
        ...initialState,
        modals: { ...initialState.modals, activityForm: true },
      };
      const state = uiReducer(stateWithModal, hideModal('activityForm'));
      expect(state.modals.activityForm).toBe(false);
    });

    it('should hide all modals', () => {
      const stateWithModals = {
        ...initialState,
        modals: {
          activityForm: true,
          disputeModal: true,
          filterModal: true,
          guestForm: false,
          houseForm: true,
          meetingForm: false,
        },
      };
      const state = uiReducer(stateWithModals, hideAllModals());

      Object.values(state.modals).forEach((modalState) => {
        expect(modalState).toBe(false);
      });
    });

    it('should handle unknown modal names', () => {
      const state = uiReducer(initialState, showModal('unknownModal'));
      expect(state.modals['unknownModal']).toBe(true);
    });
  });

  describe('Loading Actions', () => {
    it('should set loading with action', () => {
      const state = uiReducer(
        initialState,
        setLoading({ global: true, action: 'Saving...' }),
      );
      expect(state.loading.global).toBe(true);
      expect(state.loading.action).toBe('Saving...');
    });

    it('should set loading without action', () => {
      const state = uiReducer(
        initialState,
        setLoading({ global: true }),
      );
      expect(state.loading.global).toBe(true);
      expect(state.loading.action).toBe(null);
    });

    it('should clear loading', () => {
      const stateWithLoading = {
        ...initialState,
        loading: { global: true, action: 'Loading...' },
      };
      const state = uiReducer(stateWithLoading, clearLoading());
      expect(state.loading.global).toBe(false);
      expect(state.loading.action).toBe(null);
    });
  });

  describe('Toast Actions', () => {
    it('should show success toast', () => {
      const state = uiReducer(
        initialState,
        showToast({ message: 'Success!', type: 'success' }),
      );
      expect(state.toast.message).toBe('Success!');
      expect(state.toast.type).toBe('success');
      expect(state.toast.duration).toBe(3000);
    });

    it('should show error toast', () => {
      const state = uiReducer(
        initialState,
        showToast({ message: 'Error occurred', type: 'error' }),
      );
      expect(state.toast.message).toBe('Error occurred');
      expect(state.toast.type).toBe('error');
    });

    it('should show toast with custom duration', () => {
      const state = uiReducer(
        initialState,
        showToast({ message: 'Info', type: 'info', duration: 5000 }),
      );
      expect(state.toast.duration).toBe(5000);
    });

    it('should hide toast', () => {
      const stateWithToast = {
        ...initialState,
        toast: { message: 'Test', type: 'success' as const, duration: 3000 },
      };
      const state = uiReducer(stateWithToast, hideToast());
      expect(state.toast.message).toBe(null);
      expect(state.toast.type).toBe(null);
      expect(state.toast.duration).toBe(3000); // Duration resets to default
    });
  });

  describe('Initial State', () => {
    it('should return initial state', () => {
      const state = uiReducer(undefined, { type: 'unknown' });
      expect(state).toEqual(initialState);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate the original state', () => {
      const state = uiReducer(initialState, showModal('activityForm'));
      expect(state).not.toBe(initialState);
      expect(initialState.modals.activityForm).toBe(false);
    });
  });
});
