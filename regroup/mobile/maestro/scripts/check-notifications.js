#!/usr/bin/env node
/**
 * Reads `adb shell dumpsys notification --noredact` and reports whether a
 * package has posted a notification with a given title, and on which channel.
 * Used by push.sh (device pass #160, row 3).
 *
 *   adb shell dumpsys notification --noredact | \
 *     node maestro/scripts/check-notifications.js <package> <title>
 *
 * Prints the channel and exits 0 when found; exits 1 when not.
 */

/** Each NotificationRecord as { pkg, channel, title }. */
function parseNotifications(dumpsys) {
  const blocks = String(dumpsys).split('NotificationRecord(').slice(1);
  return blocks.map((block) => {
    const pkg = (block.match(/\bpkg=(\S+)/) || [])[1] || '';
    const channel = (block.match(/Notification\(channel=(\S+)/) || [])[1] || '';
    // FCM posts a String title; react-native-notify-kit a SpannableString.
    const title = (block.match(/android\.title=(?:Spannable)?String \((.*)\)\s*$/m) || [])[1] || '';
    return { pkg, channel, title };
  });
}

function findPosted(dumpsys, pkg, title) {
  return parseNotifications(dumpsys).find((n) => n.pkg === pkg && n.title === title) || null;
}

module.exports = { parseNotifications, findPosted };

if (require.main === module) {
  const [pkg, title] = process.argv.slice(2);
  if (!pkg || !title) {
    console.error('usage: check-notifications.js <package> <title> < dumpsys output');
    process.exit(2);
  }
  const input = require('fs').readFileSync(0, 'utf8');
  const found = findPosted(input, pkg, title);
  if (!found) process.exit(1);
  console.log(found.channel);
}
