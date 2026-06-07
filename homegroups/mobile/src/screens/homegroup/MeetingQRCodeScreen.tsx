// mobile/src/screens/homegroup/MeetingQRCodeScreen.tsx
// V3.2 Task 2.4 — QR Code Check-In Screen for meeting secretaries
//
// Deep link format: recoveryconnect://checkin?groupId=G&meetingId=M&date=YYYY-MM-DD
// The checkInToMeeting CF handles the actual check-in on scan.

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';
import {format} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {MeetingInstanceModel} from '../../models/MeetingInstanceModel';

type MeetingQRCodeRouteProp = RouteProp<GroupStackParamList, 'MeetingQRCode'>;
type MeetingQRCodeNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'MeetingQRCode'
>;

export const DEEP_LINK_SCHEME = 'recoveryconnect://checkin';

/* @visibleForTesting */
export function buildCheckInUrl(
  groupId: string,
  meetingId: string,
  date: string,
): string {
  return `${DEEP_LINK_SCHEME}?groupId=${encodeURIComponent(
    groupId,
  )}&meetingId=${encodeURIComponent(meetingId)}&date=${encodeURIComponent(
    date,
  )}`;
}

const MeetingQRCodeScreen: React.FC = () => {
  const route = useRoute<MeetingQRCodeRouteProp>();
  const navigation = useNavigation<MeetingQRCodeNavigationProp>();

  const {groupId, meetingId, meetingName} = route.params;
  const today = format(new Date(), 'yyyy-MM-dd');
  const checkInUrl = buildCheckInUrl(groupId, meetingId, today);

  const group = useAppSelector(state => selectGroupById(state, groupId));

  // Live attendee count from Firestore
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(true);
  const [copied, setCopied] = useState(false);

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      title: `QR Check-In: ${meetingName}`,
    });
  }, [navigation, meetingName]);

  // Subscribe to live attendee count for today's instance
  useEffect(() => {
    const unsubscribe = MeetingInstanceModel.subscribeTodayInstanceForMeeting(
      groupId,
      meetingId,
      instance => {
        setLoadingCount(false);
        setAttendeeCount(instance?.attendeeCount ?? 0);
      },
      err => {
        console.error('Error subscribing to meeting instance:', err);
        setLoadingCount(false);
      },
    );

    return () => unsubscribe();
  }, [groupId, meetingId]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check in to ${meetingName} today!\n\nTap this link to check in:\n${checkInUrl}`,
        title: `Check In: ${meetingName}`,
        url: checkInUrl, // iOS only
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined;
      if (message !== 'User did not share') {
        Alert.alert('Share failed', message || 'Could not open share sheet.');
      }
    }
  }, [checkInUrl, meetingName]);

  const handleCopyLink = useCallback(() => {
    Clipboard.setString(checkInUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [checkInUrl]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        testID="qr-code-screen">
        {/* Hero section */}
        <View style={styles.heroSection}>
          <View style={styles.qrPlaceholder}>
            <QRCode
              value={checkInUrl}
              size={240}
              backgroundColor="#FFFFFF"
              color="#212121"
            />
          </View>

          <Text style={styles.meetingNameText}>{meetingName}</Text>
          <Text style={styles.dateText}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </Text>

          {/* Live attendee count */}
          <View style={styles.attendeeCard}>
            {loadingCount ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <>
                <Text style={styles.attendeeCount}>{attendeeCount}</Text>
                <Text style={styles.attendeeLabel}>
                  {attendeeCount === 1
                    ? 'member checked in'
                    : 'members checked in'}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsSection}>
          <View style={styles.instructionRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.instructionText}>
              Share the check-in link with members via the share button below.
            </Text>
          </View>
          <View style={styles.instructionRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={styles.instructionText}>
              Members tap the link to open Homegroups and check in.
            </Text>
          </View>
          <View style={styles.instructionRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <Text style={styles.instructionText}>
              Watch the count above update live as members check in.
            </Text>
          </View>
        </View>

        {/* Deep link URL display */}
        <View style={styles.linkSection}>
          <Text style={styles.linkLabel}>Check-In Link</Text>
          <View style={styles.linkBox}>
            <Text
              style={styles.linkText}
              numberOfLines={2}
              selectable
              testID="checkin-url">
              {checkInUrl}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryAction]}
            onPress={handleShare}
            testID="share-btn">
            <Icon name="share-variant" size={22} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Share Check-In Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={handleCopyLink}
            testID="copy-btn">
            <Icon
              name={copied ? 'check-circle-outline' : 'content-copy'}
              size={20}
              color={copied ? '#4CAF50' : '#2196F3'}
            />
            <Text
              style={[styles.secondaryActionText, copied && styles.copiedText]}>
              {copied ? 'Copied!' : 'Copy Link'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Group info footer */}
        {group && (
          <View style={styles.groupFooter}>
            <Icon name="home-outline" size={16} color="#9E9E9E" />
            <Text style={styles.groupFooterText}>{group.name}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroSection: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#EEEEEE',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    marginBottom: 16,
    gap: 8,
  },
  meetingNameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
  },
  attendeeCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  attendeeCount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1565C0',
  },
  attendeeLabel: {
    fontSize: 15,
    color: '#1976D2',
    fontWeight: '500',
  },
  instructionsSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 12,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  linkSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 12,
  },
  linkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  linkBox: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 13,
    color: '#424242',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 18,
  },
  actionsSection: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    minHeight: 50,
  },
  primaryAction: {
    backgroundColor: '#2196F3',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryAction: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2196F3',
  },
  secondaryActionText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  copiedText: {
    color: '#4CAF50',
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  groupFooterText: {
    fontSize: 13,
    color: '#9E9E9E',
  },
});

export default MeetingQRCodeScreen;
