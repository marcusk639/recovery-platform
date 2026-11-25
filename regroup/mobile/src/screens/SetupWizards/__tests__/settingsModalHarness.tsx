/**
 * Shared harness (not a suite: no .test. in the name) for the House Settings
 * modal suites. It opens a screen the way HouseSettings.tsx does:
 *
 *   showFormModal(<X {...setupProps()} />, null, true)
 *
 * setupProps() passes no `navigation`, and the form modal sits inside the
 * app's NavigationContainer with no navigator around it, so useNavigation()
 * returns the container's root object (canGoBack() is false) rather than
 * throwing. Everything here is real: the store's reducers, a QueryClient,
 * the NavigationContainer and the ModalProvider. Suites mock react-native-modal
 * (native) themselves, as the ModalContext suites do.
 */
import React, { useEffect } from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureStore } from '@reduxjs/toolkit';
import setupReducer, { startHouseSetup } from '../../../state/slices/setupSlice';
import adminReducer from '../../../state/slices/adminSlice';
import userReducer from '../../../state/slices/userSlice';
import { ModalProvider, useModal } from '../../../context';
import { House } from '../../../entities/House';
import { Guests, Admins } from '../../../types';

/** A house that passes houseSchema and the address check as it stands. */
export const buildSettingsHouse = (overrides: Partial<House> = {}): House => ({
  ...new House(),
  id: 'house-1',
  name: 'Maple House',
  phoneNumber: '(555) 123-4567',
  gender: 'male',
  street: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
  lat: 39.78,
  lng: -89.65,
  ownerId: 'owner-1',
  adminIds: ['owner-1'],
  superAdminIds: ['owner-1'],
  pendingGuestInvites: [],
  pendingAdminInvites: [],
  ...overrides,
});

/**
 * Exactly the keys setupProps() returns (HouseSettings.tsx), as jest.fn
 * handlers. No navigation: setupProps() has none.
 */
export const buildSetupProps = (house: House) => ({
  selectedHouse: house,
  handleSubmit: jest.fn(),
  onSubmit: jest.fn(),
  forSettings: true,
  onPrevPress: jest.fn(),
  handlePhaseSubmit: jest.fn(),
  handleChoreSubmit: jest.fn(),
  initializeHouseSetup: jest.fn(),
});

/**
 * The real reducers the screens read, seeded the way HouseSettings'
 * initializeHouseSetup() seeds them (startHouseSetup).
 */
export const buildSettingsStore = (
  house: House,
  guests: Guests = {},
  admins: Admins = {},
) => {
  const store = configureStore({
    reducer: { setup: setupReducer, admin: adminReducer, user: userReducer },
    // House entities hold class instances (PhaseConfiguration, Chore); the
    // app's store logs them too. Not what these suites are about.
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(startHouseSetup({ house, guests, admins }));
  return store;
};

const OpenInFormModal = ({ element }: { element: React.ReactElement }) => {
  const { showFormModal } = useModal();
  useEffect(() => {
    // The same call HouseSettings makes (title null, fullScreen true).
    showFormModal(element, null as unknown as string, true);
  }, [element, showFormModal]);
  return null;
};

/** Opens `element` in the app's form modal, with no screen navigator. */
export const renderInSettingsModal = (
  element: React.ReactElement,
  store = buildSettingsStore(buildSettingsHouse()),
) =>
  render(
    <Provider store={store}>
      <QueryClientProvider client={new QueryClient()}>
        <NavigationContainer>
          <ModalProvider>
            <OpenInFormModal element={element} />
          </ModalProvider>
        </NavigationContainer>
      </QueryClientProvider>
    </Provider>,
  );
