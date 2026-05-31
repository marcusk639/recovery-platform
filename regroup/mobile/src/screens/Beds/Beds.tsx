import React, { Fragment, useCallback } from 'react';
import { Guests, Admins } from '../../types';
import { House } from '../../entities/House';
import {
  ListRenderItemInfo,
  View,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { CardItem, ActivityItem } from '../../components/card-list/card-list';
import { getCurrentTime } from '../../util/display';
import {
  color,
  normalize,
  CARD_STYLE,
  STAT_BUTTON_TEXT,
  STAT_BUTTON,
  fontSize,
  CARD_NO_ELEVATION,
  ROW,
  elevateStyle,
} from '../../styles/theme';
import { RatsFlatList } from '../../components/rats-flat-list';
import { User } from '../../entities/User';
import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import { filter, map, size, sortBy } from 'lodash';
// Phase 3.3: Migrated from 3 HOC layers to Context hooks
// Phase 4.1: Extracted business logic to useBedsManagement hook
// Removed: withFormModal, withNotifier, withPopover
// Added: useModal, useNotification hooks
import { useBedsManagement, SelectedBed } from './hooks/useBedsManagement';
import { Formik } from 'formik';
import { renderField } from '../../util/form';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import ConfirmationButtons from '../../components/confirmation-buttons';
import RatsSearchBar from '../../components/rats-search-bar';
import { Rooms, Room, Bed } from '../../entities/Room';
import RatsButton from '../../components/rats-button/rats-button';
import RoomForm from './RoomForm';
import { Guest } from '../../entities/Guest';
import { RatsText } from '../../components/rats-text';
import { RatsPopover } from '../../components/rats-popover';
import { SafeAreaView } from 'react-native-safe-area-context';
import AssignGuest from './AssignGuest';
import { findGuestBed, countGuestsWithBeds } from '../../util/house';
import { RatsIcon } from '../../components/rats-icon';
import { stringToColour } from '../../components/rats-avatar';
import { AuthConsumer } from '../../context/auth';
import Can from '../../components/auth/can';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useNotification } from '../../context';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Beds Screen
 *
 * Manages room and bed assignments for guests in a house.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 7 'as any' casts)
 *
 * @migrated Phase 3.3 - Replaced HOCs with Context hooks
 * Changes:
 * - Removed 3 HOC layers (withFormModal, withNotifier, withPopover)
 * - Added useModal and useNotification hooks
 */
const BedsScreen: React.FC<Props> = ({ navigation }) => {
  // Use custom hook for all business logic
  const bedsManagement = useBedsManagement();

  // Destructure hook values for cleaner code
  const {
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
    selectedBeds,
    setSearchTerm,
    setFilters,
    selectBed,
    clearBeds,
    bedIsSelected,
    handleRoomSubmission,
    handleBedSubmission,
    moveGuest,
    removeGuest,
    assignGuest,
    promptForDeletion,
    promptGuestRemoval,
    showFormModal,
    dismissFormModal,
    notify,
  } = bedsManagement;

  const { showPopover: showPopoverHelp, setPopoverRef } = useNotification();

  const renderBedItem = useCallback(
    (bed: Bed, room: Room, content?: JSX.Element): JSX.Element => {
      return (
        <ActivityItem
          key={room.id + bed.id}
          avatarStyle={{ borderRadius: normalize(3) }}
          container={{
            marginBottom: normalize(10),
            backgroundColor: color.white,
          }}
          avatarName={
            bed.guestId && guests[bed.guestId]
              ? guests[bed.guestId].firstName +
                ' ' +
                guests[bed.guestId].lastName
              : undefined
          }
          avatarUrl={
            bed.guestId && guests[bed.guestId]
              ? guests[bed.guestId].avatar
              : undefined
          }
          boxedIconName={!bed.guestId ? 'bed' : undefined}
          boxedIconBackground={!bed.guestId ? color.grey : undefined}
          descriptionHeader={
            bed.guestId && guests[bed.guestId]
              ? guests[bed.guestId].firstName +
                ' ' +
                guests[bed.guestId].lastName
              : 'Empty'
          }
          description={bed.id}
          content={content}
          descriptionStyle={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
          }}
          headerStyle={{
            fontSize: fontSize.regular_medium2,
            color: color.black,
            marginBottom: 2,
          }}
        />
      );
    },
    [guests],
  );

  const renderRoomItem = useCallback(
    (room: Room, selectedBed: SelectedBed) => {
      const numberOfBeds = size(room.beds);
      const numberOfBedsFilled = Object.values(room.beds).filter(
        bed => bed.guestId && bed.guestId.length > 0,
      ).length;
      return (
        <CardItem
          container={{ paddingTop: normalize(10), paddingBottom: normalize(5) }}
          itemDescription={`${numberOfBedsFilled} of ${numberOfBeds} beds filled`}
          boxedIconName="person-booth"
          boxedIconBackground={stringToColour(room.id)}
          itemName={room.id}
          activityItems={renderBedItem(room.beds[selectedBed.bed.id], room)}
        />
      );
    },
    [renderBedItem],
  );

  const showAssignGuest = useCallback(
    (
      currentlyAssignedGuest: Guest | undefined,
      bedItem?: JSX.Element,
      selectedBed?: SelectedBed,
    ) => {
      if (!house) return;

      // Wrap moveGuest to return void
      const wrappedMoveGuest = async (
        bed1: SelectedBed,
        bed2: SelectedBed,
      ): Promise<void> => {
        await moveGuest(bed1, bed2);
      };

      showFormModal(
        <AssignGuest
          bedItem={bedItem}
          notify={notify}
          dismissModal={dismissFormModal}
          house={house}
          guests={guests}
          selectedBed={selectedBed}
          reassign={wrappedMoveGuest}
          assign={assignGuest}
          currentlyAssignedGuest={currentlyAssignedGuest!}
          type={currentlyAssignedGuest ? 'Reassign' : 'Assign'}
        />,
        (currentlyAssignedGuest ? 'Reassign ' : 'Assign ') + 'Guest',
        true,
      );
    },
    [
      showFormModal,
      notify,
      dismissFormModal,
      house,
      guests,
      moveGuest,
      assignGuest,
    ],
  );

  const renderAddBedForm = useCallback(
    (room: Room) => {
      const numberOfBeds = size(room.beds);
      const numberOfBedsFilled = filter(
        room.beds,
        bed => bed.guestId != null,
      ).length;
      return (
        //@ts-ignore
        <View style={{ flex: 1, width: '100%' }}>
          <Formik
            initialValues={{ id: '', roomId: room.id }}
            onSubmit={handleBedSubmission}>
            {({ handleSubmit, values }) => (
              <View style={{ flex: 1 }}>
                <RatsScrollView contentContainerStyle={{}}>
                  <CardItem
                    itemDescription={`${numberOfBedsFilled} of beds ${numberOfBeds} filled`}
                    boxedIconName="person-booth"
                    boxedIconBackground={color.peach}
                    itemName={room.id}
                    activityItems={
                      <Fragment>
                        {room.beds &&
                          map(room.beds, bed => (
                            <ActivityItem
                              container={{
                                marginBottom: normalize(10),
                              }}
                              avatarName={
                                bed.guestId && guests[bed.guestId]
                                  ? guests[bed.guestId].firstName +
                                    ' ' +
                                    guests[bed.guestId].lastName
                                  : undefined
                              }
                              avatarUrl={
                                bed.guestId && guests[bed.guestId]
                                  ? guests[bed.guestId].avatar
                                  : undefined
                              }
                              boxedIconName={!bed.guestId ? 'bed' : undefined}
                              boxedIconBackground={
                                !bed.guestId ? color.grey : undefined
                              }
                              description={
                                bed.guestId && guests[bed.guestId]
                                  ? guests[bed.guestId].firstName +
                                    ' ' +
                                    guests[bed.guestId].lastName
                                  : 'Empty'
                              }
                              descriptionHeader={bed.id}
                            />
                          ))}
                      </Fragment>
                    }
                  />
                  <View style={[CARD_STYLE, { marginBottom: 2 }]}>
                    {renderField(
                      'id',
                      'Bed Name',
                      RatsTextInput,
                      false,
                      'Bed Name',
                      'string',
                    )}
                  </View>
                </RatsScrollView>
                <ConfirmationButtons
                  container={{
                    ...CARD_STYLE,
                    marginTop: 'auto',
                    marginBottom: 0,
                  }}
                  confirm={handleSubmit}
                  cancel={dismissFormModal}
                />
              </View>
            )}
          </Formik>
        </View>
      );
    },
    [guests, handleBedSubmission, dismissFormModal],
  );

  const renderRoomForm = useCallback(
    (room?: Room) => {
      return (
        <RoomForm
          action={room ? 'edit' : 'add'}
          notify={notify}
          renderBedItem={(bed: Bed, room: Room, content?: JSX.Element) =>
            renderBedItem(bed, room, content)
          }
          room={room || new Room('', {})}
          dismissFormModal={dismissFormModal}
        />
      );
    },
    [notify, renderBedItem, dismissFormModal],
  );

  const addRoom = useCallback(
    (room?: Room) => {
      showFormModal(
        renderRoomForm(room),
        room ? 'Edit Room' : 'Add Room',
        true,
        room ? (
          <TouchableOpacity onPress={() => promptForDeletion(room)}>
            <RatsIcon
              size={normalize(20)}
              name="trash"
              style={{ color: color.red }}
            />
          </TouchableOpacity>
        ) : undefined,
      );
    },
    [showFormModal, renderRoomForm, promptForDeletion],
  );

  const addBed = useCallback(
    (room: Room) => {
      showFormModal(renderAddBedForm(room), 'Add Bed', true);
    },
    [showFormModal, renderAddBedForm],
  );

  const renderRoom = useCallback(
    (info: ListRenderItemInfo<Room>, guestsWithBeds: number) => {
      const room = info.item;
      const numberOfBeds = size(room.beds);
      const numberOfBedsFilled = Object.values(room.beds).filter(
        bed => bed.guestId && bed.guestId.length > 0,
      ).length;
      return (
        <AuthConsumer>
          {({ token }) => (
            <View key={room.id}>
              <CardItem
                container={{
                  paddingTop: normalize(10),
                  paddingBottom: normalize(5),
                }}
                onEdit={
                  token.role[house?.id || ''] === 'admin' ||
                  token.role[house?.id || ''] === 'superAdmin'
                    ? () => addRoom(room)
                    : undefined
                }
                itemDescription={`${numberOfBedsFilled} of ${numberOfBeds} beds filled`}
                boxedIconName="person-booth"
                boxedIconBackground={stringToColour(room.id)}
                itemName={room.id}
                activityItems={
                  <Fragment>
                    {sortBy(room.beds, bed => bed.id).map(bed =>
                      renderBedItem(
                        bed,
                        room,
                        <Can
                          role={token.role[house?.id || '']}
                          no={() => null}
                          action="house:partial-edit"
                          yes={() => (
                            <View
                              style={[
                                ROW,
                                {
                                  paddingTop: normalize(10),
                                  justifyContent: 'space-between',
                                },
                              ]}>
                              {
                                <RatsButton
                                  onPress={() =>
                                    showAssignGuest(
                                      bed.guestId
                                        ? guests[bed.guestId]
                                        : undefined,
                                      renderRoomItem(room, {
                                        roomId: room.id,
                                        bed,
                                      }),
                                      {
                                        roomId: room.id,
                                        bed,
                                      },
                                    )
                                  }
                                  light
                                  containerStyle={{
                                    flex: bed.guestId ? 0.49 : 1,
                                  }}
                                  title={
                                    bed.guestId ? 'Reassign' : 'Assign Guest'
                                  }
                                />
                              }
                              {bed.guestId && (
                                <RatsButton
                                  onPress={() =>
                                    promptGuestRemoval({
                                      roomId: room.id,
                                      bed,
                                    })
                                  }
                                  light
                                  style={{ color: color.red }}
                                  containerStyle={{
                                    flex: 0.49,
                                    borderColor: color.red,
                                  }}
                                  title="Remove Guest"
                                />
                              )}
                            </View>
                          )}
                        />,
                      ),
                    )}
                  </Fragment>
                }
              />
            </View>
          )}
        </AuthConsumer>
      );
    },
    [
      user,
      house,
      addRoom,
      renderBedItem,
      showAssignGuest,
      guests,
      renderRoomItem,
      promptGuestRemoval,
    ],
  );

  const renderRoomList = useCallback(
    (roomsList: Room[]) => {
      const guestsWithBeds = countGuestsWithBeds(house?.rooms ?? {});
      return (
        <RatsFlatList<Room>
          scrollEnabled
          contentContainerStyle={{ backgroundColor: color.light_grey }}
          renderItem={info => renderRoom(info, guestsWithBeds)}
          data={roomsList}
          keyExtractor={(item, index) => item.id}
          initialNumToRender={5}
          maxToRenderPerBatch={1}
          updateCellsBatchingPeriod={100}
          windowSize={7}
        />
      );
    },
    [house, renderRoom],
  );

  const setSearchTermHandler = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const executeSearch = useCallback(() => {}, []);

  const openFilters = useCallback(() => {}, []);

  const renderSearch = useCallback(
    (placeholder?: string) => {
      return (
        <RatsSearchBar
          container={{ marginBottom: 5 }}
          onSubmitEditing={executeSearch}
          value={searchTerm}
          onChangeText={setSearchTermHandler}
          onFilter={openFilters}
          placeholder={placeholder ? placeholder : 'Search beds...'}
        />
      );
    },
    [executeSearch, searchTerm, setSearchTermHandler, openFilters],
  );

  const setSearchFilters = useCallback((newFilters: any) => {
    setFilters(newFilters);
  }, []);

  const renderRooms = useCallback(() => {
    if (!rooms) return null;
    return renderRoomList(sortBy(Object.values(rooms), room => room.id));
  }, [rooms, renderRoomList]);

  const renderHelp = useCallback(() => {
    showPopoverHelp(
      'ROOMS AND BEDS',
      'Here you can view all the rooms and beds in the house, as well as the residents that belong to them.\n\nAdministrators can assign residents to beds.',
    );
  }, [showPopoverHelp]);

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        icon={<HelpIcon helpFn={renderHelp} setRef={setPopoverRef} />}
        renderBackButton
        container={{ marginBottom: 2 }}
        header="Rooms"
      />
      {renderRooms()}
      <AuthConsumer>
        {({ token }) => (
          <Can
            role={token.role[house?.id || '']}
            action="house:partial-edit"
            no={() => null}
            yes={() => (
              <SafeAreaView
                edges={['bottom', 'left', 'right']}
                style={[
                  CARD_STYLE,
                  {
                    ...elevateStyle,
                    justifyContent: 'center',
                    marginBottom: 0,
                  },
                ]}>
                <RatsButton
                  style={STAT_BUTTON_TEXT}
                  containerStyle={{ ...STAT_BUTTON }}
                  onPress={() => addRoom()}
                  title="Add Room"
                />
              </SafeAreaView>
            )}
          />
        )}
      </AuthConsumer>
    </View>
  );
};

export default BedsScreen;
