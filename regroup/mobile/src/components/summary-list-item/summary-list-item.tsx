import { TouchableOpacity, View, Image } from 'react-native';
import React, { Fragment, PropsWithChildren } from 'react';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { RatsText } from '../rats-text';
import { normalize, color, fontSize } from '../../styles/theme';
import HealthConstants from '../../constants/health';
import summaryListItemStyles from './styles';
import RatsAvatar from '../rats-avatar';

interface Props {
  name: string;
  itemId: string;
  notifications?: string | number;
  health: 'happy' | 'neutral' | 'sad';
  onPress: (id: string) => void;
  imageSource: { uri: string };
  showAllIcons?: boolean;
  showNotifications?: boolean;
  description?: string;
}

const showIcons = (showAll: boolean, health: string) => {
  if (showAll) {
    return (
      <Fragment>
        <FontAwesome5
          style={{
            color: health === HealthConstants.HAPPY ? color.green : color.grey,
          }}
          name="laugh"
          size={normalize(25)}
        />
        <FontAwesome5
          style={{
            color:
              health === HealthConstants.NEUTRAL ? color.yellow : color.grey,
          }}
          name="meh"
          size={normalize(25)}
        />
        <FontAwesome5
          style={{
            color: health === HealthConstants.SAD ? color.red : color.grey,
          }}
          name="frown-open"
          size={normalize(25)}
        />
      </Fragment>
    );
  }
  switch (health) {
    case HealthConstants.HAPPY:
      return (
        <FontAwesome5
          style={{
            color: health === HealthConstants.HAPPY ? color.green : color.grey,
          }}
          name="laugh"
          size={normalize(25)}
        />
      );
    case HealthConstants.NEUTRAL:
      return (
        <FontAwesome5
          style={{ color: color.black }}
          name="meh"
          size={normalize(25)}
        />
      );
    case HealthConstants.SAD:
      return (
        <FontAwesome5
          style={{
            color: health === HealthConstants.SAD ? color.red : color.grey,
          }}
          name="frown-open"
          size={normalize(25)}
        />
      );
    default:
      return (
        <FontAwesome5
          style={{ color: color.grey }}
          name="question"
          size={normalize(25)}
        />
      );
  }
};

const SummaryListItem = (props: PropsWithChildren<Props>) => {
  const {
    name,
    itemId,
    health,
    onPress,
    notifications,
    imageSource,
    showAllIcons: showAllIcons = true,
    children,
    showNotifications = true,
    description,
  } = props;
  return (
    <View style={summaryListItemStyles.container}>
      <TouchableOpacity
        onPress={() => onPress(itemId)}
        style={summaryListItemStyles.info}>
        <RatsAvatar
          name={name}
          style={{
            height: normalize(45),
            width: normalize(45),
            borderRadius: normalize(45),
            marginRight: normalize(15),
          }}
          source={imageSource}
          resizeMethod="resize"
          resizeMode="cover"
        />
        <View>
          <RatsText
            style={summaryListItemStyles.textStyle}
            translate={false}
            text={name}
          />
          <RatsText
            style={summaryListItemStyles.descriptionStyle}
            translate={false}
            text={description}
          />
        </View>
      </TouchableOpacity>
      <View style={summaryListItemStyles.summary}>
        {showIcons(showAllIcons, health)}
        {children}
        {showNotifications && (
          <View style={summaryListItemStyles.notifications}>
            <RatsText
              style={{ fontSize: fontSize.medium, color: color.grey }}
              text={notifications}
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default SummaryListItem;
