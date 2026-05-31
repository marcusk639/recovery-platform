import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { logout } from '../../state/slices/userSlice';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, normalize } from '../../styles/theme';

/**
 * Shown to guests whose operator's subscription has lapsed AND the grace
 * period has expired. The guest has no recourse other than contacting their
 * house manager or signing out.
 *
 * Displays the house phone number if available, falling back to the house
 * phone number field on the House entity. (House does not have an adminEmail
 * field at the entity level; operators can be reached via phoneNumber.)
 */
const GraceExpiredScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { house } = useSelectedHouse();

  const contactInfo = house?.phoneNumber || null;

  const handleSignOut = () => {
    dispatch(logout());
  };

  return (
    <View style={styles.container}>
      <RatsText
        translate={false}
        text="Access temporarily unavailable"
        style={styles.title}
      />

      <RatsText
        translate={false}
        text="Your house manager's account is inactive. Contact them to restore access."
        style={styles.body}
      />

      {contactInfo ? (
        <RatsText
          translate={false}
          text={contactInfo}
          style={styles.contactInfo}
        />
      ) : null}

      <RatsText
        translate={false}
        text="Sign out"
        style={styles.signOutLink}
        onPress={handleSignOut}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    paddingHorizontal: normalize(24),
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: '700' as const,
    textAlign: 'center',
    color: color.black,
    marginBottom: normalize(12),
  },
  body: {
    fontSize: fontSize.regular,
    textAlign: 'center',
    color: color.dark_grey,
    marginBottom: normalize(16),
    lineHeight: normalize(22),
  },
  contactInfo: {
    fontSize: fontSize.regular_medium,
    color: color.baby_blue,
    textAlign: 'center',
    marginBottom: normalize(32),
  },
  signOutLink: {
    fontSize: fontSize.regular,
    color: color.baby_blue,
    textDecorationLine: 'underline',
    marginTop: normalize(8),
  },
});

export default GraceExpiredScreen;
