/**
 * Test Utilities for Redux Toolkit + React Query
 *
 * Provides test wrappers and helpers for testing components with:
 * - Redux store
 * - React Query client
 * - Mock data
 */

import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { NavigationContainer } from "@react-navigation/native";

// Import reducers
import authReducer from "../slices/authSlice";
import themeReducer from "../slices/themeSlice";

// Mock NotificationProvider to avoid requiring context setup in tests
jest.mock("../../context/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useNotification: () => ({
    showNotification: jest.fn(),
    hideNotification: jest.fn(),
    notification: null,
  }),
}));

/**
 * Create a fresh React Query client for each test
 * Prevents test pollution and ensures isolated tests
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
        gcTime: 0, // Don't cache in tests
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Create a test Redux store
 * Can be customized with preloaded state
 */
export function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      // Add mock reducers for old state if needed
      user: (state: any = { user: null, loggedIn: false }) => state,
      guests: (state: any = { requestingGuests: false }) => state,
      houses: (state: any = { selectedHouse: null }) => state,
      // RTK slice reducers used by components (inline mock to avoid import chain issues)
      houses: (
        state: any = {
          selectedHouse: null,
          houses: {},
          searchedHouses: [],
          requestingHouse: false,
          requestingHouseFailed: false,
          requestingHouses: false,
          requestingHousesSuccessful: false,
          requestingHousesFailed: false,
          searchingHouses: false,
          searchingHousesSuccessful: false,
          searchingHousesFailed: false,
          creatingHouse: false,
          creatingHouseSuccessful: false,
          creatingHouseFailed: false,
          updatingHouse: false,
          updatingHouseSuccessful: false,
          updatingHouseFailed: false,
          error: null,
        }
      ) => state,
      guests: (
        state: any = {
          guests: {},
          loading: false,
          error: null,
          requestingGuests: false,
        }
      ) => state,
      user: (
        state: any = {
          user: null,
          loading: false,
          error: null,
          loggedIn: false,
          loggingIn: false,
          loggingInFailed: false,
          signingUp: false,
          signingUpFailed: false,
        }
      ) => state,
    },
    preloadedState,
  });
}

/**
 * Wrapper component that provides Redux and React Query context
 */
interface AllTheProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
  store?: any;
}

export function AllTheProviders({
  children,
  queryClient,
  store,
}: AllTheProvidersProps) {
  const testQueryClient = queryClient || createTestQueryClient();
  const testStore = store || createTestStore();

  return (
    <NavigationContainer>
      <Provider store={testStore}>
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      </Provider>
    </NavigationContainer>
  );
}

/**
 * Custom render function that wraps components with providers
 */
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  store?: any;
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient, store, ...renderOptions }: CustomRenderOptions = {}
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AllTheProviders queryClient={queryClient} store={store}>
      {children}
    </AllTheProviders>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: queryClient || createTestQueryClient(),
    store: store || createTestStore(),
  };
}

/**
 * Wait for React Query to finish loading
 */
export async function waitForLoadingToFinish() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Re-export everything from React Testing Library
export * from "@testing-library/react-native";
