import React from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { RatsLogo } from '../rats-logo/rats-logo';
import { RatsText } from '../rats-text';
import RatsButton from '../rats-button/rats-button';
import { color, fontSize, normalize } from '../../styles/theme';
import { STORE_LINKS } from '../../config/storeLinks';
import { logException } from '../../util/logging';

/**
 * Shown by VersionGate when this build is older than the server's minimum for
 * its platform. Its only action opens the store listing.
 */
const UpdateRequiredScreen: React.FC = () => {
  const storeLink = Platform.OS === 'android' ? STORE_LINKS.android : STORE_LINKS.ios;

  const handleOpenStore = async () => {
    try {
      await Linking.openURL(storeLink);
    } catch (error) {
      logException(error);
    }
  };

  return (
    <View testID="update-required-screen" style={styles.container}>
      <RatsLogo imageStyle={styles.logo} />
      <RatsText translate={false} text="Update required" style={styles.title} />
      <RatsText
        translate={false}
        text="This version of Regroup is no longer supported. Update to the latest version to continue."
        style={styles.body}
      />
      <RatsButton
        testID="update-required-store-button"
        title={Platform.OS === 'android' ? 'Open Google Play' : 'Open the App Store'}
        onPress={handleOpenStore}
        containerStyle={styles.button}
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
  logo: {
    width: normalize(80),
    height: normalize(80),
    marginBottom: normalize(24),
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
    marginBottom: normalize(32),
    lineHeight: normalize(22),
  },
  button: {
    width: '100%',
    height: normalize(48),
  },
});

export default UpdateRequiredScreen;
