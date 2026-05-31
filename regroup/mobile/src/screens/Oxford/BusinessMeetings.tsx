import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, addDays, parseISO } from 'date-fns';
import { RootStackParamList } from '../../navigation/types';
import DatePicker from 'react-native-date-picker';

import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';

import { useAppSelector } from '../../state/store';
import { useOxfordGate } from '../../hooks/useOxfordGate';
import { useGuests } from '../../state/queries/guestQueries';
import { Guest } from '../../entities/Guest';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import {
  useBusinessMeetings,
  useCreateBusinessMeeting,
} from '../../state/queries/oxfordQueries';
import { logException } from '../../util/logging';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const BusinessMeetings: React.FC<Props> = ({ navigation }) => {
  const { allowed, houseId } = useOxfordGate();
  const user = useAppSelector(state => state.user.user);
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(houseId, allowed);

  const guestByUserId = useMemo(() => {
    const map: Record<string, Guest> = {};
    for (const g of Object.values(guests) as Guest[]) {
      if (g.userId) {
        map[g.userId] = g;
      }
    }
    return map;
  }, [guests]);

  const getCreatorName = useCallback(
    (userId: string): string => {
      const guest = guestByUserId[userId];
      if (!guest) {
        return 'Unknown';
      }
      return (
        `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Unknown'
      );
    },
    [guestByUserId],
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date>(
    addDays(new Date(), 7),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const {
    data: meetings = [],
    isLoading,
    isFetching,
    refetch,
  } = useBusinessMeetings(houseId, allowed);

  const createMutation = useCreateBusinessMeeting();

  const handleCreate = async () => {
    if (!houseId || !user?.id) {
      return;
    }

    try {
      await createMutation.mutateAsync({
        houseId,
        scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
        agenda: [],
        attendees: [],
        quorumMet: false,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      });
      setShowCreateForm(false);
      setScheduledDate(addDays(new Date(), 7));
    } catch (err) {
      logException(err);
      Alert.alert('Error', 'Failed to create meeting. Please try again.');
    }
  };

  // Wrap in useCallback so FlatList cell recycling isn't invalidated on
  // every parent re-render (new renderItem reference = full list re-render).
  const renderMeeting = useCallback(
    ({ item }: { item: BusinessMeeting }) => (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('BusinessMeetingDetail', { meeting: item })
        }
        style={[
          CARD_STYLE,
          {
            marginBottom: normalize(8),
            backgroundColor: color.white,
            padding: normalize(14),
            borderLeftWidth: 4,
            borderLeftColor: item.quorumMet ? color.green : color.baby_blue,
          },
        ]}>
        <RatsText
          text={format(parseISO(item.scheduledDate), 'EEEE, MMMM d, yyyy')}
          style={{ fontSize: fontSize.medium, color: color.black }}
        />
        {item.actualDate && (
          <RatsText
            text={`Held: ${format(parseISO(item.actualDate!), 'MMM d, yyyy')}`}
            style={{
              fontSize: fontSize.small,
              color: color.dark_grey,
              marginTop: normalize(2),
            }}
          />
        )}
        <View
          style={{
            flexDirection: 'row',
            marginTop: normalize(6),
            flexWrap: 'wrap',
          }}>
          <View
            style={{
              backgroundColor: item.quorumMet ? color.green : color.grey,
              paddingHorizontal: normalize(8),
              paddingVertical: normalize(2),
              borderRadius: normalize(4),
              marginRight: normalize(8),
            }}>
            <RatsText
              text={item.quorumMet ? 'Quorum Met' : 'No Quorum'}
              style={{ color: color.white, fontSize: fontSize.small }}
            />
          </View>
          <RatsText
            text={`${item.attendees.length} attendees`}
            style={{ color: color.dark_grey, fontSize: fontSize.small }}
          />
        </View>
        {item.agenda.length > 0 && (
          <RatsText
            text={`${item.agenda.length} agenda ${
              item.agenda.length === 1 ? 'item' : 'items'
            }`}
            style={{
              color: color.dark_grey,
              fontSize: fontSize.small,
              marginTop: normalize(4),
            }}
          />
        )}
        {item.minutes && (
          <RatsText
            text="Minutes recorded"
            style={{
              color: color.green,
              fontSize: fontSize.small,
              marginTop: normalize(4),
            }}
          />
        )}
        <RatsText
          text={`Created by: ${getCreatorName(item.createdBy)}`}
          style={{
            color: color.grey,
            fontSize: fontSize.extraSmall,
            marginTop: normalize(4),
          }}
          translate={false}
        />
      </TouchableOpacity>
    ),
    [navigation],
  );

  if (!allowed) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Business Meetings" renderBackButton />
        <View style={{ padding: normalize(24), alignItems: 'center' }}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={{ color: color.dark_grey, fontSize: fontSize.regular }}
            translate={false}
          />
        </View>
      </RatsScrollView>
    );
  }

  if (isLoading) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Business Meetings" renderBackButton />
        <ActivityIndicator
          color={color.baby_blue}
          style={{ marginTop: normalize(40) }}
        />
      </RatsScrollView>
    );
  }

  return (
    <RatsScrollView
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
        />
      }>
      <ScreenHeader header="Business Meetings" />
      <View style={{ padding: normalize(16) }}>
        {showCreateForm ? (
          <View
            style={[
              CARD_STYLE,
              {
                backgroundColor: color.white,
                padding: normalize(16),
                marginBottom: normalize(16),
              },
            ]}>
            <RatsText
              text="Schedule New Meeting"
              style={{
                fontSize: fontSize.medium,
                color: color.black,
                marginBottom: normalize(12),
              }}
            />
            <RatsText
              text="Scheduled Date (YYYY-MM-DD)"
              style={{
                fontSize: fontSize.small,
                color: color.dark_grey,
                marginBottom: normalize(4),
              }}
            />
            <TouchableOpacity
              testID="date-picker-trigger"
              accessibilityLabel="Select meeting date"
              accessibilityRole="button"
              onPress={() => setDatePickerOpen(true)}
              style={{
                borderWidth: 1,
                borderColor: color.medium_grey,
                borderRadius: normalize(4),
                padding: normalize(10),
                marginBottom: normalize(16),
              }}>
              <RatsText
                text={format(scheduledDate, 'yyyy-MM-dd')}
                style={{ fontSize: fontSize.regular, color: color.black }}
              />
            </TouchableOpacity>

            <DatePicker
              modal
              open={datePickerOpen}
              date={scheduledDate}
              mode="date"
              onConfirm={(date: Date) => {
                setDatePickerOpen(false);
                setScheduledDate(date);
              }}
              onCancel={() => setDatePickerOpen(false)}
            />
            <RatsButton
              title={
                createMutation.isPending ? 'Creating...' : 'Schedule Meeting'
              }
              disabled={createMutation.isPending}
              onPress={handleCreate}
              containerStyle={{ marginBottom: normalize(8) }}
            />
            <RatsButton
              title="Cancel"
              light
              onPress={() => setShowCreateForm(false)}
            />
          </View>
        ) : (
          <RatsButton
            title="Schedule New Meeting"
            onPress={() => setShowCreateForm(true)}
            containerStyle={{ marginBottom: normalize(16) }}
          />
        )}

        <FlatList
          data={meetings}
          keyExtractor={item => item.id}
          renderItem={renderMeeting}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: normalize(32) }}>
              <RatsText
                text="No business meetings scheduled."
                style={{
                  color: color.dark_grey,
                  fontSize: fontSize.regular,
                  marginTop: normalize(0),
                }}
              />
            </View>
          }
        />
      </View>
    </RatsScrollView>
  );
};

export default BusinessMeetings;
