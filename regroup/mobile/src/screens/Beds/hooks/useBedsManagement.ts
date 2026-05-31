/**
 * useBedsManagement - Custom hook for beds and room management logic
 *
 * Phase 4.1: Extracted from Beds.tsx (776 LOC)
 * Contains all business logic: room CRUD, bed assignment, guest management
 */
import { useState, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../../../state/store';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests } from '../../../state/queries/guestQueries';
import { useModal, useNotification } from '../../../context';
import { useUpdateHouse } from '../../../state/queries/houseQueries';
import { Room, Bed, Rooms } from '../../../entities/Room';
import { Guest } from '../../../entities/Guest';
import { House } from '../../../entities/House';
import { getCurrentTime } from '../../../util/display';
import { findGuestBed } from '../../../util/house';
import { cloneDeep } from 'lodash';
import { Alert } from 'react-native';

export interface SelectedBed {
  roomId: string;
  bed: Bed;
}

interface BedsManagementState {
  selectedBeds: {
    bed1?: SelectedBed;
    bed2?: SelectedBed;
  };
  error: string | null;
  searchTerm: string;
  filters: any;
  submitting: boolean;
}

export const useBedsManagement = () => {
  // Context hooks
  const { showFormModal, dismissFormModal } = useModal();
  const { notify } = useNotification();

  // Redux
  const dispatch = useAppDispatch();
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const rooms = house?.rooms;
  const user = useAppSelector(state => state.user.user);
  const admins = useAppSelector(state => state.admin.houseAdmins);

  // React Query mutation — replaces the old updateHouseThunk that no
  // longer exists in housesSlice (Phase C cleanup). Every room/bed write
  // goes through this mutation which handles optimistic updates + cache
  // invalidation of houseKeys.detail(houseId).
  const updateHouseMutation = useUpdateHouse();
  const updatingHouse = updateHouseMutation.isPending;
  const updatingHouseSuccessful = updateHouseMutation.isSuccess;

  // Local state
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBeds, setSelectedBeds] = useState<{
    bed1?: SelectedBed;
    bed2?: SelectedBed;
  }>({});

  // Clear selected beds
  const clearBeds = useCallback(() => {
    setSelectedBeds({});
  }, []);

  // Check if two beds are equal
  const bedsAreEqual = useCallback(
    (bed: SelectedBed, bedKey: 'bed1' | 'bed2') => {
      return (
        selectedBeds[bedKey] &&
        selectedBeds[bedKey]?.bed &&
        selectedBeds[bedKey]?.roomId === bed.roomId &&
        selectedBeds[bedKey]?.bed.id === bed.bed.id
      );
    },
    [selectedBeds],
  );

  // Select a bed (for swapping)
  const selectBed = useCallback(
    (bed: Bed, roomId: string) => {
      setSelectedBeds(prevState => {
        const isBed1 = bedsAreEqual({ roomId, bed }, 'bed1');
        const isBed2 = bedsAreEqual({ roomId, bed }, 'bed2');

        if (isBed1 || isBed2) {
          return {
            bed1: isBed1 ? undefined : prevState.bed1,
            bed2: isBed2 ? undefined : prevState.bed2,
          };
        }

        if (prevState.bed1) {
          return { bed1: prevState.bed1, bed2: { bed, roomId } };
        }

        return { bed1: { bed, roomId }, bed2: undefined };
      });
    },
    [bedsAreEqual],
  );

  // Check if bed is selected
  const bedIsSelected = useCallback(
    (bed: Bed, roomId: string) => {
      const isBed1 = bedsAreEqual({ roomId, bed }, 'bed1');
      const isBed2 = bedsAreEqual({ roomId, bed }, 'bed2');
      return isBed1 || isBed2;
    },
    [bedsAreEqual],
  );

  // Handle room submission (create/update/delete)
  const handleRoomSubmission = useCallback(
    async (values: { room: Room }, deleteRoom: boolean = false) => {
      if (!house) return;

      setError(null);
      try {
        dismissFormModal();

        if (deleteRoom) {
          const roomsClone = cloneDeep(house.rooms);
          delete roomsClone[values.room.id];
          await updateHouseMutation.mutateAsync({
            houseId: house.id,
            values: { rooms: roomsClone },
          });
          notify(
            'Removed Room',
            `Removed ${values.room.id} from the house`,
            [],
            'succeed',
          );
        } else {
          const room = new Room(values.room.id, values.room.beds);
          await updateHouseMutation.mutateAsync({
            houseId: house.id,
            values: {
              rooms: {
                ...house.rooms,
                [room.id]: room,
              },
            },
          });
        }
      } catch (error) {
        setError('Something went wrong');
      }
    },
    [house, dismissFormModal, notify, updateHouseMutation],
  );

  // Handle bed submission (add bed)
  const handleBedSubmission = useCallback(
    async (values: { id: string; roomId: string }) => {
      if (!house) return;

      setError(null);
      try {
        dismissFormModal();
        const bed = new Bed(values.id, '');
        await updateHouseMutation.mutateAsync({
          houseId: house.id,
          values: {
            rooms: {
              ...house.rooms,
              [values.roomId]: {
                ...house.rooms[values.roomId],
                updatedAt: getCurrentTime(),
                beds: {
                  ...house.rooms[values.roomId].beds,
                  [values.id]: bed,
                },
              },
            },
          },
        });
      } catch (error) {
        setError('Something went wrong');
      }
    },
    [house, dismissFormModal, updateHouseMutation],
  );

  // Move guest between beds (swap)
  const moveGuest = useCallback(
    async (bed1: SelectedBed, bed2: SelectedBed) => {
      if (!house) return;

      const roomsClone = cloneDeep(house.rooms);
      roomsClone[bed1.roomId].beds[bed1.bed.id].guestId = bed2.bed.guestId;
      roomsClone[bed2.roomId].beds[bed2.bed.id].guestId = bed1.bed.guestId;
      return updateHouseMutation.mutateAsync({
        houseId: house.id,
        values: { rooms: roomsClone },
      });
    },
    [house, updateHouseMutation],
  );

  // Remove guest from bed
  const removeGuest = useCallback(
    async (selectedBed: SelectedBed) => {
      if (!house) return;

      const guestId = selectedBed.bed.guestId;
      try {
        await updateHouseMutation.mutateAsync({
          houseId: house.id,
          values: {
            rooms: {
              ...house.rooms,
              [selectedBed.roomId]: {
                ...house.rooms[selectedBed.roomId],
                beds: {
                  ...house.rooms[selectedBed.roomId].beds,
                  [selectedBed.bed.id]: { ...selectedBed.bed, guestId: null },
                },
              },
            },
          },
        });

        if (guestId) {
          const guest = guests[guestId];
          if (guest) {
            notify(
              'Removed Guest',
              `Removed ${guest.firstName} ${guest.lastName} from ${selectedBed.bed.id}`,
              [],
              'succeed',
            );
          }
        }
        clearBeds();
      } catch (error) {
        setError('Failed to remove guest');
      }
    },
    [house, guests, updateHouseMutation, notify, clearBeds],
  );

  // Assign guest to bed
  const assignGuest = useCallback(
    async (guest: Guest, selectedBed: SelectedBed) => {
      if (!house) return;

      const roomsClone = cloneDeep(house.rooms);
      const currentGuestBed = findGuestBed(guest.id, roomsClone);

      // Remove guest from current bed if exists
      if (currentGuestBed) {
        roomsClone[currentGuestBed.roomId].beds[
          currentGuestBed.bed.id
        ].guestId = null;
      }

      // Assign to new bed
      const roomBeds = roomsClone[selectedBed.roomId].beds;
      const currentGuestId = roomBeds[selectedBed.bed.id].guestId;
      roomBeds[selectedBed.bed.id].guestId = guest.id;

      // If bed was occupied, move that guest to old bed
      if (currentGuestId && currentGuestBed) {
        roomsClone[currentGuestBed.roomId].beds[
          currentGuestBed.bed.id
        ].guestId = currentGuestId;
      }

      try {
        await updateHouseMutation.mutateAsync({
          houseId: house.id,
          values: { rooms: roomsClone },
        });

        dismissFormModal();
        notify(
          'Assigned Guest',
          `Assigned ${guest.firstName} to ${selectedBed.bed.id}`,
          [],
          'succeed',
        );
        clearBeds();
      } catch (error) {
        setError('Failed to assign guest');
      }
    },
    [house, updateHouseMutation, dismissFormModal, notify, clearBeds],
  );

  // Prompt for room deletion
  const promptForDeletion = useCallback(
    (room: Room) => {
      Alert.alert(
        'Delete Room',
        `Are you sure you want to delete ${room.id}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleRoomSubmission({ room }, true),
          },
        ],
      );
    },
    [handleRoomSubmission],
  );

  // Prompt for guest removal
  const promptGuestRemoval = useCallback(
    (selectedBed: SelectedBed) => {
      const guestId = selectedBed.bed.guestId;
      const guest = guestId ? guests[guestId] : null;
      Alert.alert(
        'Remove Guest',
        `Remove ${guest?.firstName} ${guest?.lastName} from ${selectedBed.bed.id}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeGuest(selectedBed),
          },
        ],
      );
    },
    [guests, removeGuest],
  );

  return {
    // State
    guests,
    house,
    rooms,
    user,
    admins,
    updatingHouse,
    updatingHouseSuccessful,
    error,
    searchTerm,
    filters,
    submitting,
    selectedBeds,

    // Actions
    setSearchTerm,
    setFilters,
    selectBed,
    clearBeds,
    bedIsSelected,
    bedsAreEqual,
    handleRoomSubmission,
    handleBedSubmission,
    moveGuest,
    removeGuest,
    assignGuest,
    promptForDeletion,
    promptGuestRemoval,

    // Context
    showFormModal,
    dismissFormModal,
    notify,
    dispatch,
  };
};
