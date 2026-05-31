import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppSelector, useAppDispatch } from '../state/store';
import { logException } from '../util/logging';
import { House } from '../entities/House';
import { Guest } from '../entities/Guest';
import Admin from '../entities/Admin';
import { User } from '../entities/User';
import { selectHouseById } from '../state/slices/housesSlice';
import { selectGuestById } from '../state/slices/guestsSlice';
import { houseKeys } from '../state/queries/houseQueries';
import { guestKeys } from '../state/queries/guestQueries';
import { adminKeys } from '../state/queries/adminQueries';
import * as houseService from '../services/house';
import * as guestService from '../services/guest';
import * as adminService from '../services/admin';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useSelectedHouse } from '../hooks/useSelectedHouse';
import { useSelectedGuest } from '../hooks/useSelectedGuest';
import { useSelectedAdmin } from '../hooks/useSelectedAdmin';

/**
 * Data Context Types
 */
interface DataContextType {
  // Current User (Partial because RTK state stores Partial<User>)
  currentUser: Partial<User> | null;

  // Current Entities (based on user role)
  currentHouse: House | null;
  currentGuest: Guest | null;
  currentAdmin: Admin | null;

  // Loading States
  loading: boolean;
  housesLoading: boolean;
  guestsLoading: boolean;
}

/**
 * Data Context
 */
const DataContext = createContext<DataContextType | undefined>(undefined);

/**
 * Data Provider Props
 */
interface DataProviderProps {
  children: ReactNode;
}

/**
 * Data Provider Component
 *
 * Provides common data from RTK state to the entire app.
 * Replaces prop drilling and makes current user/house/guest/admin easily accessible.
 *
 * This context pulls from RTK slices and provides a convenient interface
 * for accessing the most commonly needed data throughout the app.
 */
export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  // Composite dedup key: includes every id that gates a branch of
  // fetchInitialData, so a later-arriving claim (adminId/houseId/guestId)
  // retriggers the fetch instead of being short-circuited.
  const lastFetchedKey = useRef<string | null>(null);

  // User State
  const currentUser = useAppSelector(state => state.user.user);
  const userLoading = useAppSelector(state => state.user.loading);
  const loggedIn = useAppSelector(state => state.user.loggedIn);

  // Redux-persisted selection — read once for gating first-run house auto-select
  const selectedHouseId = useAppSelector(state => state.houses.selectedHouseId);

  // House, Guest, and Admin all via React Query hooks
  const { house: currentHouse, isLoading: housesLoading } = useSelectedHouse();
  const { guest: currentGuest, isLoading: guestsLoading } = useSelectedGuest();
  const { admin: currentAdmin } = useSelectedAdmin();

  // Aggregate Loading State
  const loading = userLoading || housesLoading || guestsLoading;

  // Wire up offline-queue auto-flush. The hook listens for AppState foreground
  // transitions and (if @react-native-community/netinfo is installed) network
  // reconnect events, then flushes any queued activities to Firestore.
  // pendingCount is unused here but available if the UI ever wants a badge.
  useOfflineSync();

  // Fetch initial data when user logs in
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!currentUser || !loggedIn) {
        return;
      }
      const fetchKey = [
        currentUser.id ?? '',
        currentUser.adminId ?? '',
        currentUser.houseId ?? '',
        currentUser.guestId ?? '',
        currentUser.isAdmin ? 'a' : '',
        currentUser.isGuest ? 'g' : '',
      ].join('|');
      if (lastFetchedKey.current === fetchKey) {
        return;
      }

      lastFetchedKey.current = fetchKey;

      try {
        if (currentUser.isAdmin && currentUser.adminId) {
          // Parallel fetch: houses + admin data are independent
          const [houses] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: houseKeys.list({
                attribute: 'adminIds',
                value: currentUser.adminId,
              }),
              queryFn: () =>
                houseService.getHouses(
                  'adminIds',
                  'array-contains',
                  currentUser.adminId!,
                ),
            }),
            queryClient.fetchQuery({
              queryKey: adminKeys.detail(currentUser.adminId),
              queryFn: () => adminService.getAdmin(currentUser.adminId!),
            }),
          ]);

          // Sequential: select house → fetch guests (depends on house).
          // Gate on the Redux-persisted selection, not on the RQ-derived
          // currentHouse, because RQ may not have populated yet on first
          // render after login (stale-closure hazard).
          if (!selectedHouseId && houses) {
            const houseIds = Object.keys(houses);
            if (houseIds.length > 0) {
              const firstHouse = houses[houseIds[0]];
              dispatch(selectHouseById(firstHouse.id));

              const guests = await queryClient.fetchQuery({
                queryKey: guestKeys.list(firstHouse.id),
                queryFn: () => guestService.getGuests('houseId', firstHouse.id),
              });

              if (guests) {
                const userAsGuest = Object.values(guests).find(
                  g => g.userId === currentUser.id,
                );
                if (userAsGuest) {
                  dispatch(selectGuestById(userAsGuest.id));
                }
              }
            }
          }
        }

        // Guest users: house + guest can also load in parallel
        if (currentUser.isGuest && currentUser.houseId) {
          await Promise.all([
            queryClient.fetchQuery({
              queryKey: houseKeys.detail(currentUser.houseId),
              queryFn: () => houseService.getHouse(currentUser.houseId!),
            }),
            currentUser.guestId
              ? queryClient.fetchQuery({
                  queryKey: guestKeys.detail(currentUser.guestId),
                  queryFn: () => guestService.getGuest(currentUser.guestId!),
                })
              : Promise.resolve(null),
          ]);

          // Write to ID fields — React Query cache handles entity data
          dispatch(selectHouseById(currentUser.houseId));
          if (currentUser.guestId) {
            dispatch(selectGuestById(currentUser.guestId));
          }
        }
      } catch (error) {
        logException(error);
      }
    };

    fetchInitialData();
    // selectedHouseId is read inside the effect only as a first-run gate; it
    // is intentionally NOT in deps to prevent re-runs after auto-selection.
    // The dedup ref (lastFetchedKey) is the real guard against duplicate fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUser?.id,
    currentUser?.adminId,
    currentUser?.houseId,
    currentUser?.guestId,
    currentUser?.isAdmin,
    currentUser?.isGuest,
    loggedIn,
    dispatch,
    queryClient,
  ]);

  // Context Value
  const value: DataContextType = {
    currentUser,
    currentHouse,
    currentGuest,
    currentAdmin,
    loading,
    housesLoading,
    guestsLoading,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

/**
 * useData Hook
 *
 * Custom hook to access data context
 *
 * @example
 * const { currentUser, currentHouse, currentGuest } = useData();
 * if (!currentHouse) return <LoadingIndicator />;
 * return <HouseInfo house={currentHouse} />;
 */
export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
