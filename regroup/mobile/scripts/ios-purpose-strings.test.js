// App Store Connect refuses an iOS binary that references a privacy-sensitive
// API without the matching Info.plist purpose string (ITMS-90683). Two things
// put those references in the binary: each react-native-permissions handler
// the Podfile links (setup_permissions), and native libraries that call the
// API themselves even when our JS never reaches that code. This keeps
// ios/rats/Info.plist in step with both.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// react-native-permissions 5 handler name → the Info.plist keys it needs.
const HANDLER_KEYS = {
  AppTrackingTransparency: ['NSUserTrackingUsageDescription'],
  Bluetooth: ['NSBluetoothAlwaysUsageDescription'],
  Calendars: ['NSCalendarsFullAccessUsageDescription'],
  CalendarsWriteOnly: ['NSCalendarsWriteOnlyAccessUsageDescription'],
  Camera: ['NSCameraUsageDescription'],
  Contacts: ['NSContactsUsageDescription'],
  FaceID: ['NSFaceIDUsageDescription'],
  LocationAccuracy: ['NSLocationTemporaryUsageDescriptionDictionary'],
  LocationAlways: ['NSLocationAlwaysAndWhenInUseUsageDescription'],
  LocationWhenInUse: ['NSLocationWhenInUseUsageDescription'],
  MediaLibrary: ['NSAppleMusicUsageDescription'],
  Microphone: ['NSMicrophoneUsageDescription'],
  Motion: ['NSMotionUsageDescription'],
  Notifications: [],
  PhotoLibrary: ['NSPhotoLibraryUsageDescription'],
  PhotoLibraryAddOnly: ['NSPhotoLibraryAddUsageDescription'],
  Reminders: ['NSRemindersFullAccessUsageDescription'],
  Siri: ['NSSiriUsageDescription'],
  SpeechRecognition: ['NSSpeechRecognitionUsageDescription'],
  StoreKit: [],
};

// Native libraries whose compiled code references a sensitive API whether or
// not the app uses it (checked with strings/nm on a built .app):
//   - @react-native-community/geolocation calls requestAlwaysAuthorization
//     (only for authorizationLevel 'always', which the app never sets);
//   - react-native-image-picker calls UIImageWriteToSavedPhotosAlbum (only
//     with saveToPhotos, which the app never passes), and PHPhotoLibrary and
//     the camera picker for what it does use.
const LIBRARY_KEYS = {
  '@react-native-community/geolocation': [
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
  ],
  'react-native-image-picker': [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSPhotoLibraryAddUsageDescription',
  ],
};

const plist = read('ios/rats/Info.plist');
const purposeString = (key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match ? match[1].trim() : null;
};

const linkedHandlers = () => {
  const block = read('ios/Podfile').match(/^setup_permissions\(\[([\s\S]*?)\]\)/m);
  if (!block) throw new Error('ios/Podfile has no setup_permissions([...]) call');
  return [...block[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
};

describe('iOS purpose strings', () => {
  it('the Podfile links only the LocationWhenInUse handler (the one the JS calls)', () => {
    expect(linkedHandlers()).toEqual(['LocationWhenInUse']);
  });

  it.each(linkedHandlers())('linked handler %s has its purpose strings', (handler) => {
    expect(Object.keys(HANDLER_KEYS)).toContain(handler);
    for (const key of HANDLER_KEYS[handler]) {
      expect({ key, value: purposeString(key) }).toEqual({ key, value: expect.stringMatching(/\S/) });
    }
  });

  it.each(Object.keys(LIBRARY_KEYS))('native library %s has its purpose strings', (lib) => {
    const { dependencies } = JSON.parse(read('package.json'));
    if (!dependencies[lib]) return;
    for (const key of LIBRARY_KEYS[lib]) {
      expect({ key, value: purposeString(key) }).toEqual({ key, value: expect.stringMatching(/\S/) });
    }
  });
});
