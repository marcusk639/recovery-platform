import React, { PropsWithChildren } from 'react';
import {
  View,
  ViewStyle,
  ImageSourcePropType,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  ROW,
  normalize,
  CARD_STYLE,
  CARD_NO_ELEVATION,
  color,
  fontFamily,
} from '../../styles/theme';
import { RatsImage } from '../rats-image';
import { RatsIcon } from '../rats-icon/rats-icon';
import { RatsText } from '../rats-text';
interface Props {
  image: ImageSourcePropType;
  onBackPress?: () => void;
  onHelpPress: () => void;
  vacancy: boolean;
  navigation: { goBack: () => void };
}

const ImageHeader = ({
  image,
  onBackPress,
  onHelpPress,
  vacancy,
  navigation,
}: PropsWithChildren<Props>) => {
  return (
    <View
      style={[
        CARD_NO_ELEVATION,
        {
          justifyContent: 'center',
          padding: 0,
          height: Dimensions.get('window').height / 4.0,
        },
      ]}>
      <RatsImage
        style={{ height: '100%', width: '100%', position: 'absolute' }}
        source={image}
        resizeMode="cover"
      />
      <View style={[ROW, { flex: 1 }]}>
        <TouchableOpacity
          onPress={onBackPress ? onBackPress : () => navigation.goBack()}>
          <RatsIcon
            solid
            name="arrow-left"
            size={normalize(20)}
            style={{ color: color.white, margin: normalize(15) }}
          />
        </TouchableOpacity>
        {/* <TouchableOpacity style={{ margin: normalize(15), marginLeft: 'auto' }} onPress={onHelpPress}>
          <RatsIcon solid name="question-circle" size={normalize(20)} style={{ color: color.white }} />
        </TouchableOpacity> */}
      </View>
      <View
        style={{
          backgroundColor: vacancy ? color.green : color.red,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          width: normalize(vacancy ? 80 : 100),
          margin: normalize(10),
          paddingVertical: normalize(2),
        }}>
        <RatsText
          text={vacancy ? 'VACANCY' : 'NO VACANCY'}
          style={{ color: color.white, fontFamily: fontFamily.bold }}
        />
      </View>
    </View>
  );
};

export default ImageHeader;
