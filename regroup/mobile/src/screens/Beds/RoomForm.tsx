import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import { Formik, Field, FieldArray } from 'formik';
import { renderField } from '../../util/form';
import {
  CARD_STYLE,
  STAT_BUTTON_TEXT,
  STAT_BUTTON,
  normalize,
  color,
} from '../../styles/theme';
import ConfirmationButtons from '../../components/confirmation-buttons';
import { Room, Bed } from '../../entities/Room';
import { useUpdateHouse } from '../../state/queries/houseQueries';
import { House } from '../../entities/House';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import RatsButton from '../../components/rats-button/rats-button';
import RatsPicker from '../../components/rats-picker/rats-picker';
import { getPickerItems } from '../../util/display';
import { Guests } from '../../types';
import { cloneDeep, map } from 'lodash';
import * as yup from 'yup';
import RatsScrollView from '../../components/rats-scroll-view';
import SchemaConstants from '../../entities/SchemaConstants';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';

interface NotificationButton {
  label: string;
  action: () => void;
}

interface Props {
  dismissFormModal: () => void;
  room?: Room;
  renderBedItem: (bed: Bed, room: Room, content?: JSX.Element) => JSX.Element;
  action: 'add' | 'edit';
  notify?: (
    header: string,
    content: string,
    buttons?: NotificationButton[],
    status?: 'fail' | 'succeed',
    timedDismiss?: number,
  ) => void;
}

interface FormikRoom {
  beds: Bed[];
  id: string;
}

/**
 * Room Form
 *
 * Form for adding/editing rooms and beds in a house.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action imports (houseActions)
 * - Added RTK import: updateHouse from housesSlice
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 3 selectors to use RTK state (removed 'as any' casts)
 * - Replaced 1 dispatch call with RTK thunk (.unwrap() for error handling)
 */
const RoomForm: React.FC<Props> = props => {
  const { dismissFormModal, room, renderBedItem, action, notify } = props;

  const dispatch = useAppDispatch();
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const error = useAppSelector(state => state.houses.error);
  const updateHouseMutation = useUpdateHouse();

  const [stateError, setStateError] = useState<any>(null);

  const handleRoomSubmission = useCallback(
    async (values: FormikRoom) => {
      if (!house) return;

      const edit = action === 'edit';
      setStateError(null);
      try {
        dismissFormModal();
        const beds = {};
        const rooms = cloneDeep(house.rooms);
        if (action === 'edit' && room) {
          delete rooms[room.id];
        }
        values.beds.forEach(
          bed => ((beds as Record<string, typeof bed>)[bed.id] = bed),
        );
        const newRoom = new Room(values.id, beds);
        // Only pass the rooms delta — don't spread the whole house,
        // which would stomp concurrent server writes to unrelated fields.
        await updateHouseMutation.mutateAsync({
          houseId: house.id,
          values: {
            rooms: {
              ...rooms,
              [newRoom.id]: newRoom,
            },
          },
        });
        if (error) {
          notify?.(
            'Room Update Failed',
            'Failed to update this room',
            [],
            'fail',
          );
        } else {
          notify?.(
            edit ? 'Room Updated' : 'Room Added',
            edit ? 'Updated guest bedroom' : 'Added guest bedroom',
            [],
            'succeed',
          );
        }
      } catch (error) {
        setStateError('Something went wrong');
      }
    },
    [action, dismissFormModal, house, room, error, notify, dispatch],
  );

  const removeBed = useCallback(
    (
        setFieldValue: (field: 'beds', value: Bed[]) => void,
        index: number,
        values: FormikRoom,
      ) =>
      () => {
        const beds = values.beds.slice();
        beds.splice(index, 1);
        setFieldValue('beds', beds);
      },
    [],
  );

  const addBed = useCallback(
    (
        setFieldValue: (field: 'beds', value: Bed[]) => void,
        values: FormikRoom,
      ) =>
      () => {
        const bedName = `Bed ${values.beds.length + 1}`;
        setFieldValue('beds', [...values.beds, new Bed(bedName, '')]);
      },
    [],
  );

  const renderBed = useCallback(
    (
      bed: Bed,
      index: number,
      setFieldValue: (field: 'beds', value: Bed[]) => void,
      values: FormikRoom,
    ) => {
      return renderBedItem(
        bed,
        room as Room,
        <RatsButton
          title="Remove Bed"
          light
          onPress={removeBed(setFieldValue, index, values)}
          style={{ color: color.red }}
          containerStyle={{ borderColor: color.red, marginTop: normalize(10) }}
        />,
      );
    },
    [renderBedItem, room, removeBed],
  );

  const renderBeds = useCallback(
    (
      roomData: FormikRoom,
      setFieldValue: (field: 'beds', value: Bed[]) => void,
    ) => {
      return (
        <View>
          <FieldArray
            name="beds"
            render={arrayHelpers =>
              roomData.beds.map((bed, index) =>
                renderBed(bed, index, setFieldValue, roomData),
              )
            }
          />
        </View>
      );
    },
    [renderBed],
  );

  const bedsArray = room && room.beds ? map(room.beds, bed => bed) : [];
  const validationSchema = yup.object().shape({
    id: yup.string().required(SchemaConstants.REQUIRED),
  });

  return (
    <Formik
      validationSchema={validationSchema}
      initialValues={{
        beds: bedsArray,
        id: room ? room.id : '',
      }}
      onSubmit={handleRoomSubmission}>
      {({ handleSubmit, values, setFieldValue }) => (
        <SafeAreaView style={{ flex: 1 }}>
          <RatsScrollView contentContainerStyle={{}}>
            <View style={[CARD_STYLE, { marginBottom: 2 }]}>
              {renderField(
                'id',
                'Room Name',
                RatsTextInput,
                false,
                'Room Name',
                'string',
              )}
              {renderBeds(values, setFieldValue)}
              <RatsButton
                light
                style={STAT_BUTTON_TEXT}
                containerStyle={{
                  ...STAT_BUTTON,
                  height: normalize(50),
                  alignSelf: 'center',
                  marginVertical: normalize(10),
                }}
                onPress={addBed(setFieldValue, values)}
                title="ADD BED"
              />
            </View>
          </RatsScrollView>
          <ConfirmationButtons
            container={{ ...CARD_STYLE, paddingBottom: normalize(20) }}
            confirm={handleSubmit}
            cancel={dismissFormModal}
          />
        </SafeAreaView>
      )}
    </Formik>
  );
};

export default RoomForm;
