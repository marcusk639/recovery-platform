import React, { Fragment } from 'react';
import { View, TouchableOpacity, ViewStyle } from 'react-native';
import {
  CARD_STYLE,
  normalize,
  ROW,
  fontSize,
  color,
  CARD_NO_ELEVATION,
  fontFamily,
} from '../../styles/theme';
import BoxedIcon from '../rats-icon/boxed-icon';
import { RatsText } from '../rats-text';
import { RatsIcon } from '../rats-icon/rats-icon';
import RatsButton from '../rats-button/rats-button';
import RatsAvatar from '../rats-avatar';
import { IOS } from '../../util/platform';

const NOTIFICATION: ViewStyle = {
  backgroundColor: color.red,
  height: normalize(25),
  width: normalize(25),
  borderRadius: normalize(12.5),
  borderColor: color.red,
  borderWidth: 1,
  justifyContent: 'center',
  alignItems: 'center',
  marginLeft: 'auto',
  alignSelf: 'center',
};

interface SectionProps {
  name: string;
  description: string;
  iconName?: string | null;
  iconColor?: string | null;
  boxedIconName?: string | null;
  iconBackgroundColor?: string | null;
  buttonText?: string | null;
  onPress?: () => void;
  avatar?: string | null;
  forceAvatar?: boolean;
  translate?: boolean;
  boxedIconText?: string | null;
  onEdit?: (() => void) | null;
  onDelete?: (() => void) | null;
  error?: string | null;
  icon?: React.ReactNode | null;
  description2?: string | null;
  selected?: boolean;
  notifications?: number;
  touchableContainer?: ViewStyle;
  container?: ViewStyle;
  boxedIconColor?: string | null;
  locked?: boolean;
  testID?: string;
}

const Section = ({
  name,
  description,
  iconName = null,
  iconColor = null,
  boxedIconName = null,
  iconBackgroundColor,
  buttonText = null,
  onPress = () => {},
  avatar = null,
  forceAvatar = false,
  translate = false,
  boxedIconText = null,
  onEdit = null,
  onDelete = null,
  error = null,
  icon = null,
  description2 = null,
  selected = false,
  notifications = 0,
  touchableContainer = {},
  container = {},
  boxedIconColor = null,
  locked = false,
  testID,
}: SectionProps) => {
  const renderAvatar = avatar || forceAvatar;
  return (
    <View style={[CARD_NO_ELEVATION, container, { marginBottom: 2 }]}>
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        activeOpacity={onPress && onPress !== (() => {}) ? 0.2 : 1}
        style={[ROW, touchableContainer]}>
        <View style={{ justifyContent: 'center', marginRight: normalize(10) }}>
          {(boxedIconName || boxedIconText) && (
            <BoxedIcon
              iconColor={boxedIconColor || null}
              name={boxedIconName || ''}
              text={boxedIconText || null}
              backgroundColor={iconBackgroundColor || ''}
            />
          )}
          {renderAvatar && (
            <RatsAvatar
              name={name}
              style={{
                height: normalize(45),
                width: normalize(45),
                borderRadius: normalize(45),
                marginRight: normalize(5),
              }}
              source={{ uri: avatar || undefined }}
              resizeMethod="resize"
              resizeMode="cover"
            />
          )}
        </View>
        <View style={{ justifyContent: 'center' }}>
          <RatsText
            translate={translate}
            text={name}
            style={{
              fontSize: fontSize.medium,
              color: color.black,
              fontFamily: fontFamily.bold,
            }}
          />
          <View style={[ROW]}>
            <RatsText
              translate={translate}
              text={description}
              style={{ fontSize: fontSize.regular, color: color.dark_grey }}
            />
            {description2 && (
              <RatsText
                translate={false}
                text={'\u2B24'}
                style={{
                  fontSize: normalize(4),
                  color: color.dark_grey,
                  alignSelf: 'center' as const,
                  marginLeft: normalize(4),
                }}
              />
            )}
            {description2 && (
              <RatsText
                translate={translate}
                text={description2}
                style={{
                  fontSize: fontSize.regular,
                  color: color.dark_grey,
                  marginLeft: normalize(4),
                }}
              />
            )}
          </View>
          {error && (
            <RatsText
              translate={translate}
              text={error}
              style={{ fontSize: fontSize.small, color: color.red }}
            />
          )}
        </View>
        {(onEdit || onDelete) && (
          <View style={{ marginLeft: 'auto' }}>
            {onEdit && (
              <TouchableOpacity
                style={{ marginRight: normalize(45) }}
                onPress={onEdit}>
                <RatsIcon name="pencil-alt" size={fontSize.medium_large} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity style={{}} onPress={onDelete}>
                <RatsIcon name="times-circle" size={fontSize.medium_large} />
              </TouchableOpacity>
            )}
          </View>
        )}
        {notifications ? (
          <View style={NOTIFICATION}>
            <RatsText
              text={notifications}
              style={{
                color: color.white,
                fontFamily: fontFamily.bold,
                paddingBottom: IOS ? 0 : normalize(2),
              }}
            />
          </View>
        ) : null}
        {selected && (
          <RatsIcon
            name="check"
            solid
            size={normalize(25)}
            style={{ color: color.green, marginLeft: 'auto' }}
          />
        )}
        {iconName && (
          <RatsIcon
            name={iconName}
            solid
            size={normalize(20)}
            style={{ color: iconColor || undefined, marginLeft: 'auto' }}
          />
        )}
        {locked && (
          <RatsIcon
            name="lock"
            size={normalize(25)}
            style={{
              marginLeft: 'auto',
              alignSelf: 'center',
              color: color.dark_grey,
              marginRight: normalize(2),
            }}
          />
        )}
        {icon}
      </TouchableOpacity>
      {buttonText && (
        <RatsButton
          title={buttonText}
          containerStyle={{
            backgroundColor: color.white,
            borderColor: color.baby_blue,
            borderWidth: 1.5,
            marginTop: normalize(15),
            marginBottom: normalize(10),
          }}
          style={{ color: color.baby_blue }}
        />
      )}
    </View>
  );
};

export default Section;
