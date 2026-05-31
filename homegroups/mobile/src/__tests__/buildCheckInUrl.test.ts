/**
 * Unit tests for buildCheckInUrl (P3-6).
 *
 * buildCheckInUrl is a pure function — no React Native APIs, no Firebase calls.
 * Tests confirm:
 *   - Deep link scheme and parameter structure
 *   - groupId, meetingId, date are percent-encoded (protects against injection)
 *   - Characters requiring encoding are handled correctly
 */

// Mock the heavy React Native / third-party imports so the module can be
// imported without a full RN environment.
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: {create: (s: object) => s},
  TouchableOpacity: 'TouchableOpacity',
  Share: {share: jest.fn()},
  Alert: {alert: jest.fn()},
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  SafeAreaView: 'SafeAreaView',
  Platform: {OS: 'ios'},
}));
jest.mock('@react-native-clipboard/clipboard', () => ({
  default: {setString: jest.fn()},
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: jest.fn(() => ({
    params: {groupId: 'g', meetingId: 'm', meetingName: 'N'},
  })),
}));
jest.mock('@react-navigation/stack', () => ({}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('date-fns', () => ({format: jest.fn(() => '2026-05-23')}));
jest.mock('../store', () => ({useAppSelector: jest.fn(() => undefined)}));
jest.mock('../store/slices/groupsSlice', () => ({
  selectGroupById: jest.fn(),
}));
jest.mock('../models/MeetingInstanceModel', () => ({
  MeetingInstanceModel: {subscribeTodayInstanceForMeeting: jest.fn()},
}));

import {
  buildCheckInUrl,
  DEEP_LINK_SCHEME,
} from '../screens/homegroup/MeetingQRCodeScreen';

describe('buildCheckInUrl', () => {
  it('uses the correct deep link scheme', () => {
    const url = buildCheckInUrl('g1', 'm1', '2026-05-23');
    expect(url).toContain(DEEP_LINK_SCHEME);
    expect(url.startsWith('recoveryconnect://checkin')).toBe(true);
  });

  it('includes all three query parameters', () => {
    const url = buildCheckInUrl('group1', 'meeting1', '2026-01-15');
    expect(url).toContain('groupId=group1');
    expect(url).toContain('meetingId=meeting1');
    expect(url).toContain('date=2026-01-15');
  });

  it('percent-encodes special characters in groupId', () => {
    const url = buildCheckInUrl('group/special', 'm1', '2026-05-23');
    expect(url).toContain('groupId=group%2Fspecial');
    expect(url).not.toContain('groupId=group/special');
  });

  it('percent-encodes special characters in meetingId', () => {
    const url = buildCheckInUrl('g1', 'meeting & test', '2026-05-23');
    expect(url).toContain('meetingId=meeting%20%26%20test');
  });

  it('produces a stable URL for typical Firestore IDs (alphanumeric + dashes)', () => {
    const url = buildCheckInUrl('abc123DEF', 'XYZ789', '2026-12-31');
    expect(url).toBe(
      'recoveryconnect://checkin?groupId=abc123DEF&meetingId=XYZ789&date=2026-12-31',
    );
  });
});
