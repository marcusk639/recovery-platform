import React, { Component, useState } from 'react';
import { Guests } from '../../types';
import { House } from '../../entities/House';
import { each, map } from 'lodash';
import { View, StyleSheet, TouchableOpacity, TextStyle } from 'react-native';
import {
  color,
  normalize,
  fontFamily,
  fontSize,
  CARD_STYLE,
  ROW,
  SAVE_BUTTON,
} from '../../styles/theme';
import { Guest } from '../../entities/Guest';
import Section from '../../components/rats-interactable-section';
import RatsScrollView from '../../components/rats-scroll-view';
import { RatsText } from '../../components/rats-text';
import { Room, Bed } from '../../entities/Room';
import RatsButton from '../../components/rats-button/rats-button';
import { SelectedBed } from './hooks/useBedsManagement';
import RatsModal from '../../components/rats-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector } from '../../state/store';
import { findGuestBed } from '../../util/house';
import { ANDROID } from '../../util/platform';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    backgroundColor: color.light_grey,
  },
});

interface NotificationButton {
  label: string;
  action: () => void;
}

interface Props {
  guests: Guests;
  house: House;
  dismissModal: () => void;
  assign: (guest: Guest, selectedBed: SelectedBed) => Promise<void>;
  reassign: (bed1: SelectedBed, bed2: SelectedBed) => Promise<void>;
  type: 'Reassign' | 'Assign';
  currentlyAssignedGuest: Guest;
  bedItem?: JSX.Element;
  selectedBed?: SelectedBed;
  error?: Error;
  notify?: (
    header: string,
    content: string,
    buttons?: NotificationButton[],
    status?: 'fail' | 'succeed',
    timedDismiss?: number,
  ) => void;
  // renderBedItem: (bed: Bed, room: Room, content?: JSX.Element) => void
}

const AssignGuest = (props: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Get error from RTK slice
  const errorFromState = useAppSelector(state => state.houses.error);

  const guestsWithoutBeds: Guest[] = [];
  const guestsWithBeds: { [guestId: string]: SelectedBed } = {};
  const { house, guests, error: propError } = props;
  const error = propError || errorFromState;
  const { rooms } = house;
  each(guests, guest => {
    let guestHasBed = false;
    each(rooms, room => {
      each(room.beds, bed => {
        if (bed.guestId === guest.id) {
          guestHasBed = true;
          guestsWithBeds[bed.guestId] = { bed, roomId: room.id };
        }
      });
    });
    if (!guestHasBed) {
      guestsWithoutBeds.push(guest);
    }
  });

  function renderGuestSection(guest: Guest) {
    return (
      <Section
        forceAvatar
        container={{ paddingHorizontal: normalize(15) }}
        avatar={guest.avatar}
        name={guest.firstName + ' ' + guest.lastName}
        description="Unassigned"
        iconBackgroundColor={color.green_blue}
        onPress={() => setSelected(selected === guest.id ? null : guest.id)}
        selected={selected === guest.id}
        touchableContainer={{ alignItems: 'center' }}
      />
    );
  }

  function renderSectionForGuestWithBed(guestId: string) {
    const guest = guests[guestId];
    const bedInfo = guestsWithBeds[guestId];
    return (
      <Section
        forceAvatar
        container={{ paddingHorizontal: normalize(15) }}
        avatar={guest.avatar}
        name={guest.firstName + ' ' + guest.lastName}
        description={bedInfo.roomId}
        description2={bedInfo.bed.id}
        iconBackgroundColor={color.green_blue}
        selected={selected === guest.id}
        onPress={() => setSelected(selected === guest.id ? null : guest.id)}
        touchableContainer={{ alignItems: 'center' }}
      />
    );
  }

  function renderGuestsWithoutBeds() {
    return guestsWithoutBeds.map(guest => renderGuestSection(guest));
  }

  function renderGuestsWithBeds() {
    return map(guestsWithBeds, (bed, guestId) =>
      renderSectionForGuestWithBed(guestId),
    );
  }

  const HEADER: TextStyle = {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    padding: normalize(15),
  };

  const assign = async () => {
    if (selected === null) return;

    setSubmitting(true);
    props.assign(guests[selected], props.selectedBed!);
    setSubmitting(false);
    props.dismissModal();
    props.notify?.(
      'Bed Assigned',
      `Assigned ${guests[selected].firstName} to ${
        props.selectedBed!.bed.id
      } in ${props.house.rooms[props.selectedBed!.roomId].id}`,
      [],
      'succeed',
    );
  };

  const reassign = async () => {
    if (selected === null) return;

    setSubmitting(true);
    props.reassign(guestsWithBeds[selected], props.selectedBed!);
    setSubmitting(false);
    setVisible(false);
    props.dismissModal();
    props.notify?.(
      'Bed Reassigned',
      `Reassigned ${guests[selected].firstName} to ${
        props.selectedBed!.bed.id
      } in ${props.house.rooms[props.selectedBed!.roomId].id}`,
      [],
      'succeed',
    );
  };

  const submit = () => {
    const guestCurrentBed = findGuestBed(selected || '', rooms);
    if (props.type === 'Reassign' && guestCurrentBed) {
      setVisible(true);
    } else {
      assign();
    }
  };

  const renderModal = () => {
    if (selected === null) return null;
    const guest = guests[selected];
    if (!guest) {
      return null;
    }
    return (
      // @ts-ignore - RatsModal wrapper handles default ModalProps
      <RatsModal
        modalStyle={{
          padding: 0,
          margin: 0,
          alignItems: undefined,
          justifyContent: 'flex-end',
        }}
        style={{ padding: 0, margin: 0, backgroundColor: color.light_grey }}
        isVisible={visible}
        onBackdropPress={() => setVisible(false)}>
        <SafeAreaView edges={['bottom']} style={[CARD_STYLE]}>
          <RatsText
            text={`${guest.firstName} is already assigned to a bed. Would you like to swap these guests or leave ${guest.firstName}'s bed empty?`}
            style={{ fontSize: fontSize.medium, marginVertical: normalize(5) }}
          />
          <RatsButton
            containerStyle={{ marginVertical: normalize(10) }}
            light
            title="Cancel"
            onPress={() => setVisible(false)}
          />
          <RatsButton
            title="Leave Empty"
            light
            onPress={assign}
            containerStyle={{ marginBottom: normalize(10) }}
          />
          <RatsButton
            title="Swap Beds"
            onPress={reassign}
            containerStyle={SAVE_BUTTON}
          />
        </SafeAreaView>
      </RatsModal>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {props.bedItem}
      <RatsScrollView
        contentContainerStyle={styles.container}
        behavior="padding">
        <RatsText text="NEEDS BED" style={HEADER} />
        {renderGuestsWithoutBeds()}
        <RatsText text="HAS BED" style={HEADER} />
        {renderGuestsWithBeds()}
        {renderModal()}
      </RatsScrollView>
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            justifyContent: 'space-between',
            paddingBottom: ANDROID ? normalize(10) : normalize(20),
          },
        ]}>
        <RatsButton
          title="Cancel"
          light
          containerStyle={{ flex: 0.48 }}
          onPress={props.dismissModal}
        />
        <RatsButton
          disabled={!selected || submitting}
          title={props.type}
          onPress={submit}
          containerStyle={{
            backgroundColor: color.green,
            borderColor: color.green,
            flex: 0.48,
          }}
          style={{ color: color.white }}
        />
      </View>
    </View>
  );
};

export default AssignGuest;
