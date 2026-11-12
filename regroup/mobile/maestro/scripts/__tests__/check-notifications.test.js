const { parseNotifications, findPosted } = require('../check-notifications');

const record = (pkg, channel, title) => `
    NotificationRecord(0x0891567d: pkg=${pkg} user=UserHandle{0} id=7 tag=null importance=3 key=0|${pkg}|7|null|10283: Notification(channel=${channel} shortcut=null contentView=null vibrate=null sound=null defaults=0x0 flags=0x10 color=0x00000000 vis=PRIVATE))
      uid=10283 userId=0
      extras={
                android.title=String (${title})
                android.text=String (Body for ${title})
      }
`;
const DUMPSYS =
  'Current Notification Manager state:\n  Notification List:\n' +
  record('android', 'DEVELOPER', 'Serial console enabled') +
  record('com.regroup.app.e2e.stg', 'default', 'push-e2e-resident-123') +
  record('com.regroup.app.e2e.stg', 'fcm_fallback_notification_channel', 'push-e2e-admin-456') +
  '\n  AppSettings: com.regroup.app.e2e.stg (10283) importance=DEFAULT userSet=false\n';

describe('check-notifications', () => {
  it('reads each posted notification with its package, channel and title', () => {
    expect(parseNotifications(DUMPSYS)).toEqual([
      { pkg: 'android', channel: 'DEVELOPER', title: 'Serial console enabled' },
      { pkg: 'com.regroup.app.e2e.stg', channel: 'default', title: 'push-e2e-resident-123' },
      {
        pkg: 'com.regroup.app.e2e.stg',
        channel: 'fcm_fallback_notification_channel',
        title: 'push-e2e-admin-456',
      },
    ]);
  });

  it('finds a notification by package and title', () => {
    expect(findPosted(DUMPSYS, 'com.regroup.app.e2e.stg', 'push-e2e-resident-123')).toEqual({
      pkg: 'com.regroup.app.e2e.stg',
      channel: 'default',
      title: 'push-e2e-resident-123',
    });
  });

  it("ignores another package's notification with the same title", () => {
    expect(findPosted(DUMPSYS, 'com.regroup.app.e2e.emu', 'push-e2e-resident-123')).toBeNull();
  });

  // react-native-notify-kit (the app's own foreground notifications) posts
  // the title as a SpannableString; FCM's own notifications use a String.
  it('reads a title posted as a SpannableString', () => {
    const spannable = record('com.regroup.app.e2e.stg', 'default', 'push-e2e-resident-9').replace(
      'android.title=String (',
      'android.title=SpannableString (',
    );
    expect(findPosted(spannable, 'com.regroup.app.e2e.stg', 'push-e2e-resident-9')).toEqual({
      pkg: 'com.regroup.app.e2e.stg',
      channel: 'default',
      title: 'push-e2e-resident-9',
    });
  });

  it('returns null when nothing matches', () => {
    expect(findPosted(DUMPSYS, 'com.regroup.app.e2e.stg', 'push-e2e-missing')).toBeNull();
    expect(parseNotifications('')).toEqual([]);
  });
});
