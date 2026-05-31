import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { RatsText } from '../rats-text';
import { color, fontSize, normalize } from '../../styles/theme';

interface Props {
  endsAt: Date;
}

/**
 * Dismissible top banner shown to guests whose operator's subscription is
 * lapsing but still within the grace window.
 *
 * Dismissed per-session via useState (not persisted). On the next app
 * launch the banner reappears until the subscription is restored or the
 * grace period expires.
 */
const GracePeriodBanner: React.FC<Props> = ({ endsAt }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  const daysRemaining = Math.max(
    0,
    differenceInCalendarDays(endsAt, new Date()),
  );

  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  const message = `⚠ Your house subscription expires in ${daysRemaining} ${dayWord}. Contact your house manager to avoid losing access.`;

  return (
    <View style={styles.banner}>
      <RatsText translate={false} text={message} style={styles.message} />
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss banner">
        <RatsText translate={false} text="✕" style={styles.dismiss} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: color.yellow,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(8),
  },
  message: {
    flex: 1,
    fontSize: fontSize.small,
    color: color.black,
    lineHeight: normalize(18),
  },
  dismiss: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    paddingLeft: normalize(8),
  },
});

export default GracePeriodBanner;
