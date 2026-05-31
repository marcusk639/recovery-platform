import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, parseISO } from 'date-fns';
import { RootStackParamList } from '../../navigation/types';

import ScreenHeader from '../../components/screen-header';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';

import { useOxfordGate } from '../../hooks/useOxfordGate';
import { useUpdateBusinessMeeting } from '../../state/queries/oxfordQueries';
import { useGuests } from '../../state/queries/guestQueries';
import { Guest } from '../../entities/Guest';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  route: { params: { meeting: any } };
}

const BusinessMeetingDetail: React.FC<Props> = ({ navigation, route }) => {
  const { meeting: initialMeeting } = route.params;
  const { allowed, houseId } = useOxfordGate();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(houseId, allowed);

  const [attendees, setAttendees] = useState<string[]>(
    initialMeeting.attendees ?? [],
  );
  const [minutes, setMinutes] = useState(initialMeeting.minutes ?? '');

  const updateMutation = useUpdateBusinessMeeting();

  const guestList = Object.values(guests) as Guest[];
  const totalResidents = guestList.length;
  const quorumThreshold = Math.ceil(totalResidents * 0.51);
  const quorumMet = attendees.length >= quorumThreshold && totalResidents > 0;

  const toggleAttendance = useCallback(
    (guestId: string) => {
      if (!houseId) {
        return;
      }
      // Stale-closure safe: snapshot `prev` inside the updater so rapid
      // consecutive taps each rollback to the correct pre-toggle state.
      setAttendees(prev => {
        const next = prev.includes(guestId)
          ? prev.filter(id => id !== guestId)
          : [...prev, guestId];
        updateMutation
          .mutateAsync({
            id: initialMeeting.id,
            houseId,
            updates: {
              attendees: next,
              quorumMet: next.length >= quorumThreshold,
            },
          })
          .catch(() => {
            setAttendees(prev);
          });
        return next;
      });
    },
    [houseId, initialMeeting.id, quorumThreshold, updateMutation],
  );

  const handleSaveMinutes = async () => {
    if (!houseId) {
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: initialMeeting.id,
        houseId,
        updates: { minutes },
      });
      Alert.alert('Saved', 'Meeting minutes saved.');
    } catch {
      Alert.alert('Error', 'Failed to save minutes.');
    }
  };

  if (!allowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.light_grey }}>
        <ScreenHeader renderBackButton header="Business Meeting" />
        <View style={{ padding: normalize(24), alignItems: 'center' }}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={{ color: color.dark_grey, fontSize: fontSize.regular }}
            translate={false}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader renderBackButton header="Business Meeting" />
      <View style={{ padding: normalize(16) }}>
        {/* Date */}
        <RatsText
          translate={false}
          text={format(
            parseISO(initialMeeting.scheduledDate),
            'EEEE, MMMM d, yyyy',
          )}
          style={{
            fontSize: fontSize.large,
            color: color.black,
            marginBottom: normalize(12),
          }}
        />

        {/* Quorum indicator */}
        <View
          style={[
            CARD_STYLE,
            {
              backgroundColor: quorumMet ? color.green : color.grey,
              padding: normalize(12),
              marginBottom: normalize(16),
            },
          ]}>
          <RatsText
            translate={false}
            text={
              quorumMet
                ? 'Quorum Met'
                : `${attendees.length} / ${quorumThreshold} needed for quorum`
            }
            style={{ color: color.white, fontSize: fontSize.regular }}
          />
        </View>

        {/* Attendance */}
        <RatsText
          translate={false}
          text="Attendance"
          style={{
            fontSize: fontSize.medium,
            color: color.black,
            marginBottom: normalize(8),
          }}
        />
        {guestList.map(g => {
          const present = attendees.includes(g.id);
          const name =
            `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Resident';
          return (
            <TouchableOpacity
              key={g.id}
              testID={`attendance-toggle-${g.id}`}
              onPress={() => toggleAttendance(g.id)}
              style={[
                CARD_STYLE,
                {
                  backgroundColor: color.white,
                  marginBottom: normalize(6),
                  padding: normalize(12),
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                },
              ]}>
              <RatsText
                translate={false}
                text={name}
                style={{ fontSize: fontSize.regular, color: color.black }}
              />
              <View
                style={{
                  backgroundColor: present ? color.green : color.light_grey,
                  width: normalize(24),
                  height: normalize(24),
                  borderRadius: normalize(12),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                {present && (
                  <RatsText
                    translate={false}
                    text="✓"
                    style={{ color: color.white, fontSize: fontSize.small }}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Minutes */}
        <RatsText
          translate={false}
          text="Meeting Minutes"
          style={{
            fontSize: fontSize.medium,
            color: color.black,
            marginTop: normalize(20),
            marginBottom: normalize(8),
          }}
        />
        <TextInput
          testID="minutes-input"
          value={minutes}
          onChangeText={setMinutes}
          placeholder="Record meeting discussion..."
          placeholderTextColor={color.grey}
          multiline
          numberOfLines={6}
          style={{
            borderWidth: 1,
            borderColor: color.medium_grey,
            borderRadius: normalize(4),
            padding: normalize(10),
            fontSize: fontSize.regular,
            color: color.black,
            textAlignVertical: 'top',
            marginBottom: normalize(12),
            backgroundColor: color.white,
          }}
        />
        <RatsButton
          testID="save-minutes-button"
          title={updateMutation.isPending ? 'Saving...' : 'Save Minutes'}
          disabled={updateMutation.isPending}
          onPress={handleSaveMinutes}
        />
      </View>
    </ScrollView>
  );
};

export default BusinessMeetingDetail;
