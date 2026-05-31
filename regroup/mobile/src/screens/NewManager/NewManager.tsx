import React from 'react';
import {
  CENTERED_CONTAINER,
  normalize,
  fontSize,
  color,
} from '../../styles/theme';
import { View } from 'react-native';
import RatsVideoPlayer from '../../components/video-player';
import { RatsText } from '../../components/rats-text';
import styles from '../SignUp/SignUpStyles';
import SignUp from '../SignUp/SignUp';
import { Routes, AuthScreenNavigationProp } from '../../navigation/types';
import { RatsLogoHorizontal } from '../../components/rats-logo/rats-logo';
import { InitialLandingStyles } from '../Landing/InitialLanding';
import { ANDROID, IS_X } from '../../util/platform';
import { useNavigation } from '@react-navigation/native';
// interface NewManagerIntroProps {}

const NewManagerIntro = () => {
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const renderHeader = () => {
    return (
      <View>
        <View
          style={[
            InitialLandingStyles.logoContainer,
            { alignSelf: 'center', width: IS_X ? '90%' : undefined },
          ]}>
          <RatsLogoHorizontal imageStyle={InitialLandingStyles.image} />
        </View>
      </View>
    );
  };

  return (
    <SignUp
      renderNameFields
      customRoute={Routes.OrgSetup}
      renderHeader={renderHeader}
      navigation={navigation}
    />
  );
};

export default NewManagerIntro;
