import React from 'react';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { View, StyleSheet } from 'react-native';
import { normalize, fontSize } from '../../styles/theme';
import { RatsLogoHorizontal } from '../../components/rats-logo/rats-logo';

import InitialLandingForm from './InitialLandingForm';
import { RatsText } from '../../components/rats-text';
import { IOS, IS_X } from '../../util/platform';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
export const InitialLandingStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: normalize(20),
    paddingHorizontal: normalize(20),
  },
  image: {
    height: normalize(75),
    width: normalize(75),
    marginRight: normalize(10),
  },
  buttons: {
    // flex: 0.5,
    justifyContent: 'center',
  },
  logoContainer: {
    flex: 0.25,
    // justifyContent: 'center'
  },
});

function withNavigation(Component: React.ComponentType<any>) {
  return (props: any) => {
    const navigation = useNavigation();
    return <Component navigation={navigation} {...props} />;
  };
}

function InitialLanding() {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[{ flex: 1, paddingTop: normalize(20) }]}
      testID="initial-landing-screen">
      <View
        style={[
          InitialLandingStyles.logoContainer,
          {
            alignSelf: 'center',
            flex: 0.2,
            paddingHorizontal: IS_X ? normalize(15) : 0,
          },
        ]}>
        <RatsLogoHorizontal imageStyle={InitialLandingStyles.image} />
      </View>
      <View style={InitialLandingStyles.container}>
        {withNavigation(InitialLandingForm)({})}
      </View>
    </SafeAreaView>
  );
}

export default InitialLanding;
