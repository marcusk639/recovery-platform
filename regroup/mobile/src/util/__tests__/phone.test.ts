// src/util/__tests__/phone.test.ts
//
// Unit tests for phone.tsx.
// phone.tsx imports react-native (Linking, Alert, Platform) and uses them
// at function call time — we mock react-native so the module can be imported,
// then exercise the logic we can inspect without triggering real native calls.

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

import { Linking, Alert, Platform } from 'react-native';
import { callNumber, openSmsUrl } from '../phone';

const mockCanOpenURL = Linking.canOpenURL as jest.Mock;
const mockOpenURL = Linking.openURL as jest.Mock;
const mockAlert = Alert.alert as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── openSmsUrl ──────────────────────────────────────────────────────────────

describe('openSmsUrl', () => {
  it('calls Linking.openURL with the correct sms scheme on iOS', () => {
    // Platform.OS is 'ios' per mock above — divider is '&'
    mockOpenURL.mockResolvedValueOnce(undefined);
    openSmsUrl('5551234567', 'Hello there');
    expect(mockOpenURL).toHaveBeenCalledWith(
      'sms:5551234567&body=Hello there',
    );
  });

  it('returns the promise from Linking.openURL', () => {
    const expected = Promise.resolve(undefined);
    mockOpenURL.mockReturnValueOnce(expected);
    const result = openSmsUrl('5550000000', 'Test');
    expect(result).toBe(expected);
  });

  it('constructs url with empty body correctly', () => {
    mockOpenURL.mockResolvedValueOnce(undefined);
    openSmsUrl('5551111111', '');
    expect(mockOpenURL).toHaveBeenCalledWith('sms:5551111111&body=');
  });

  it('constructs url when phone number contains hyphens', () => {
    mockOpenURL.mockResolvedValueOnce(undefined);
    openSmsUrl('555-867-5309', 'Hi');
    expect(mockOpenURL).toHaveBeenCalledWith('sms:555-867-5309&body=Hi');
  });
});

// ─── callNumber ──────────────────────────────────────────────────────────────

describe('callNumber', () => {
  it('uses telprompt scheme on non-android (ios)', () => {
    mockCanOpenURL.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);

    callNumber('5551234567');

    expect(mockCanOpenURL).toHaveBeenCalledWith('telprompt:5551234567');
  });

  it('calls Linking.openURL when canOpenURL resolves true', async () => {
    mockCanOpenURL.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);

    callNumber('5559876543');

    // flush promise queue
    await Promise.resolve();
    await Promise.resolve();

    expect(mockOpenURL).toHaveBeenCalledWith('telprompt:5559876543');
  });

  it('calls Alert.alert when canOpenURL resolves false', async () => {
    mockCanOpenURL.mockResolvedValueOnce(false);

    callNumber('0000000000');

    await Promise.resolve();
    await Promise.resolve();

    expect(mockAlert).toHaveBeenCalledWith('Phone number is not available');
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('does not throw when canOpenURL rejects (error path)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCanOpenURL.mockRejectedValueOnce(new Error('network error'));

    expect(() => callNumber('1234567890')).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
    consoleSpy.mockRestore();
  });

  it('uses tel scheme on android', async () => {
    // Temporarily change Platform.OS to 'android'
    const originalOS = (Platform as any).OS;
    (Platform as any).OS = 'android';

    mockCanOpenURL.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);

    callNumber('5551234567');

    expect(mockCanOpenURL).toHaveBeenCalledWith('tel:5551234567');

    await Promise.resolve();
    await Promise.resolve();

    (Platform as any).OS = originalOS;
  });
});
