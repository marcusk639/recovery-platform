import React from 'react';
import { View, Image, ViewStyle } from 'react-native';
import { RatsText } from '../rats-text';
import { circleLogo, appIcon } from '../../../assets';
import i18next from 'i18next';
import logoStyles from './styles';
import { withRats, HOCProps } from '../rats-hoc';
import { normalize } from '../../styles/theme';

interface Props extends HOCProps {
  imageStyle: any;
  containerStyle?: ViewStyle;
}

const RatsLogoHorizontal = withRats(
  ({ imageStyle, t, theme, containerStyle }: Props) => (
    <View>
      <View style={[logoStyles.horizontalContainer, containerStyle]}>
        <Image
          style={{ ...imageStyle }}
          source={appIcon}
          resizeMethod="scale"
          resizeMode="cover"
        />
        <View>
          <RatsText
            style={logoStyles.hzLogoText}
            translate={false}
            text="Regroup"
          />
          {/* <RatsText style={logoStyles.hzLogoText} translate={false} text="House" /> */}
        </View>
      </View>
      <RatsText
        style={[logoStyles.hzLogoDescription, { color: theme?.primaryColor }]}
        text={t?.('logo.description') || ''}
      />
    </View>
  ),
);

interface RatsLogoProps extends HOCProps {
  imageStyle?: any;
  logoNameStyle?: any;
  logoDescriptionStyle?: any;
  displayDescription?: boolean;
}

const RatsLogo = withRats(
  ({
    imageStyle,
    logoNameStyle,
    logoDescriptionStyle,
    displayDescription,
    t,
    theme,
  }: RatsLogoProps) => (
    <View style={logoStyles.container}>
      <Image
        style={imageStyle || logoStyles.image}
        source={appIcon}
        resizeMethod="scale"
        resizeMode="cover"
      />
      <RatsText
        style={[logoStyles.logoName, logoNameStyle]}
        translate={false}
        text="Regroup"
      />
      {displayDescription && (
        <RatsText
          style={[
            logoStyles.logoDescription,
            { color: theme?.primaryColor },
            logoDescriptionStyle,
          ]}
          text={t?.('logo.description') || ''}
        />
      )}
    </View>
  ),
);

export { RatsLogoHorizontal, RatsLogo };
