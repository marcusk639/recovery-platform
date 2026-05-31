import React, { PropsWithChildren, Fragment } from 'react';
import {
  View,
  ViewStyle,
  TextStyle,
  TouchableOpacity,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { RatsText } from '../rats-text';
import {
  normalize,
  fontFamily,
  color,
  ROW,
  fontSize,
  STAT_BUTTON_TEXT,
  STAT_BUTTON,
} from '../../styles/theme';
import {
  dailyLogHeader,
  dailyLogHeaderText,
  itemContent,
  activityText,
  ITEM_CONTAINER,
  SECTION_HEADER,
} from './card-list-styles';
import BoxedIcon from '../rats-icon/boxed-icon';
import RatsAvatar from '../rats-avatar';
import RatsButton, { RatsButtonProps } from '../rats-button/rats-button';
import { RatsIcon } from '../rats-icon/rats-icon';
import { IOS } from '../../util/platform';

interface CardListProps {
  heading: string;
}

export const CardList = (props: PropsWithChildren<CardListProps>) => {
  const { heading, children } = props;
  return (
    <View style={{ width: '100%' }}>
      <View style={dailyLogHeader}>
        <RatsText
          style={[dailyLogHeaderText, { fontFamily: fontFamily.roboto }]}
          translate={false}
          text={heading.toUpperCase()}
        />
      </View>
      {children}
    </View>
  );
};

interface ActivityItemProps {
  testID?: string;
  description: string;
  descriptionHeader: string;
  alert?: string;
  type?: 'bad' | 'good' | 'neutral';
  boxedIconName?: string;
  boxedIconBackground?: string;
  container?: ViewStyle;
  isAdmin?: boolean;
  avatarUrl?: string;
  avatarName?: string;
  content?: JSX.Element;
  onPress?: () => void;
  headerStyle?: TextStyle;
  descriptionStyle?: TextStyle;
  boxedIconText?: string | number;
  avatarStyle?: StyleProp<ImageStyle>;
}

const COLOR_MAP = {
  bad: color.red,
  good: color.green,
  neutral: color.grey,
};

const ICON_MAP = {
  bad: 'exclamation-triangle',
  good: 'check-double',
};

export const ActivityItem = ({
  testID,
  description,
  avatarUrl,
  avatarName,
  descriptionHeader,
  type = 'neutral',
  boxedIconBackground,
  boxedIconName,
  container,
  onPress,
  content,
  headerStyle,
  descriptionStyle,
  isAdmin = false,
  boxedIconText,
  avatarStyle = {},
}: ActivityItemProps) => {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={onPress ? 0.2 : 1.0}
      style={[ITEM_CONTAINER, { borderColor: COLOR_MAP[type] }, container]}>
      <View style={ROW}>
        {!avatarName && (
          <Fragment>
            <BoxedIcon
              text={boxedIconText}
              container={{ alignSelf: 'center' }}
              name={
                type === 'bad' || type === 'good'
                  ? ICON_MAP[type]
                  : boxedIconName || ''
              }
              backgroundColor={
                type === 'bad' || type === 'good'
                  ? COLOR_MAP[type]
                  : boxedIconBackground || ''
              }
            />
            <View
              style={{
                width: '80%',
                paddingLeft: normalize(10),
                justifyContent: 'center',
              }}>
              <View style={ROW}>
                <RatsText
                  style={[
                    { fontFamily: fontFamily.roboto, color: color.dark_grey },
                    activityText,
                    headerStyle,
                  ]}
                  translate={false}
                  text={descriptionHeader}
                />
              </View>
              <RatsText
                style={[
                  { fontFamily: fontFamily.roboto },
                  activityText,
                  descriptionStyle,
                ]}
                translate={false}
                text={description}
              />
              {/* {alert && <RatsText style={[activityText, { fontFamily: fontFamily.roboto, color: color.red }]} translate={false} text={alert} />} */}
            </View>
          </Fragment>
        )}
        {avatarName && (
          <Fragment>
            <RatsAvatar
              name={avatarName}
              style={{
                height: normalize(45),
                width: normalize(45),
                borderRadius: IOS ? normalize(22) : normalize(45),
                marginRight: normalize(15),
                //@ts-ignore
                ...avatarStyle,
              }}
              source={{ uri: avatarUrl }}
              resizeMethod="resize"
              resizeMode="cover"
            />
            <View>
              <RatsText
                text={descriptionHeader}
                translate={false}
                style={[
                  activityText,
                  { fontFamily: fontFamily.roboto, color: color.dark_grey },
                  headerStyle,
                ]}
              />
              <RatsText
                text={description}
                translate={false}
                style={[
                  activityText,
                  { fontFamily: fontFamily.roboto },
                  descriptionStyle,
                ]}
              />
            </View>
          </Fragment>
        )}
      </View>
      {content}
    </TouchableOpacity>
  );
};

interface ActivityItemWithButtonProps extends ActivityItemProps {
  leftButtonTextStyle?: TextStyle;
  leftButtonContainerStyle?: ViewStyle;
  leftButtonTitle: string;
  rightButtonTitle?: string;
  leftButtonAction: () => any;
  leftButtonLight?: boolean;
  rightDisabled?: boolean;
  leftDisabled?: boolean;
  rightButtonTextStyle?: TextStyle;
  rightButtonContainerStyle?: ViewStyle;
  rightButtonLight?: boolean;
  rightButtonAction?: () => any;
  disableButtons?: boolean;
  error?: string;
}
export const ActivityItemWithButtons = (props: ActivityItemWithButtonProps) => {
  const {
    leftButtonTextStyle = {},
    rightButtonTitle,
    rightDisabled,
    leftDisabled,
    leftButtonContainerStyle = {},
    rightButtonContainerStyle = {},
    rightButtonTextStyle = {},
    container = {},
    boxedIconText,
    disableButtons,
    error,
  } = props;
  return (
    <ActivityItem
      container={{ ...container, marginVertical: normalize(10) }}
      boxedIconName={props.boxedIconName}
      boxedIconBackground={props.boxedIconBackground}
      description={props.description}
      headerStyle={{ color: color.black }}
      descriptionStyle={{ color: color.dark_grey }}
      descriptionHeader={props.descriptionHeader}
      avatarUrl={props.avatarUrl}
      avatarName={props.avatarName}
      boxedIconText={boxedIconText}
      content={
        <Fragment>
          {!disableButtons && (
            <View
              style={[
                ROW,
                { marginTop: normalize(10), justifyContent: 'space-between' },
              ]}>
              <RatsButton
                disabled={leftDisabled}
                light
                style={{ ...leftButtonTextStyle }}
                onPress={props.leftButtonAction}
                title={props.leftButtonTitle}
                containerStyle={{
                  ...leftButtonContainerStyle,
                  height: normalize(45),
                  width: rightButtonTitle ? '49%' : '100%',
                  alignSelf: 'center',
                }}
              />
              {rightButtonTitle && (
                <RatsButton
                  disabled={rightDisabled}
                  light={props.rightButtonLight}
                  style={{ ...rightButtonTextStyle }}
                  onPress={props.rightButtonAction}
                  title={props.rightButtonTitle || ''}
                  containerStyle={{
                    ...rightButtonContainerStyle,
                    height: normalize(45),
                    width: '49%',
                    alignSelf: 'center',
                  }}
                />
              )}
            </View>
          )}
          {error && (
            <RatsText
              text={error}
              style={{
                color: color.red,
                paddingTop: normalize(5),
                fontFamily: fontFamily.bold,
              }}
            />
          )}
        </Fragment>
      }
    />
  );
};

interface CardItemProps {
  iconName?: string;
  key?: any;
  container?: ViewStyle;
  activityItems?: JSX.Element;
  leftButtonProps?: Partial<RatsButtonProps>;
  rightButtonProps?: Partial<RatsButtonProps>;
  avatarName?: string;
  avatarUri?: string;
  headerSubtext?: string | number;
  itemName?: string;
  itemDescription?: string;
  boxedIconName?: string;
  boxedIconBackground?: string;
  onExit?: () => void;
  onEdit?: () => void;
}

export const CardItem = (props: PropsWithChildren<CardItemProps>) => {
  const {
    key,
    container,
    avatarName,
    avatarUri,
    headerSubtext,
    rightButtonProps,
    leftButtonProps,
    itemName,
    itemDescription,
    boxedIconBackground,
    boxedIconName,
    onExit,
    onEdit,
  } = props;
  return (
    <View key={key} style={[itemContent, container]}>
      <View style={[ROW, { marginBottom: normalize(10) }]}>
        {avatarName && (
          <Fragment>
            <RatsAvatar
              name={avatarName}
              style={{
                height: normalize(45),
                width: normalize(45),
                borderRadius: IOS ? normalize(22) : normalize(45),
                marginRight: normalize(15),
              }}
              source={{ uri: avatarUri }}
              resizeMethod="resize"
              resizeMode="cover"
            />
            <View>
              <RatsText
                text={avatarName}
                translate={false}
                style={{
                  fontSize: fontSize.medium,
                  fontFamily: fontFamily.bold,
                }}
              />
              <RatsText
                text={headerSubtext}
                translate={false}
                style={{ fontSize: fontSize.regular, color: color.dark_grey }}
              />
            </View>
          </Fragment>
        )}
        {!avatarName && (
          <View style={[SECTION_HEADER]}>
            <BoxedIcon
              container={{ alignSelf: 'center' }}
              name={boxedIconName || ''}
              backgroundColor={boxedIconBackground || ''}
            />
            <View
              style={{
                width: '80%',
                paddingLeft: normalize(10),
                justifyContent: 'center',
              }}>
              <View style={ROW}>
                <RatsText
                  style={[
                    activityText,
                    { fontSize: fontSize.medium, fontFamily: fontFamily.bold },
                  ]}
                  translate={false}
                  text={itemName}
                />
              </View>
              <RatsText
                style={[
                  activityText,
                  { fontSize: fontSize.regular, color: color.dark_grey },
                ]}
                translate={false}
                text={itemDescription}
              />
              {/* {alert && <RatsText style={[activityText, { fontFamily: fontFamily.roboto, color: color.red }]} translate={false} text={alert} />} */}
            </View>
            {onEdit && (
              <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={onEdit}>
                <RatsIcon
                  name="pencil-alt"
                  style={{ color: color.baby_blue }}
                  size={fontSize.medium_large}
                />
              </TouchableOpacity>
            )}
            {onExit && (
              <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={onExit}>
                <RatsIcon name="times-circle" size={fontSize.medium_large} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {props.activityItems}
      {(leftButtonProps || rightButtonProps) && (
        <View
          style={{
            ...ROW,
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: normalize(4),
          }}>
          {leftButtonProps && (
            <RatsButton
              light
              style={{ ...STAT_BUTTON_TEXT, color: color.baby_blue }}
              containerStyle={{
                ...STAT_BUTTON,
                flex: rightButtonProps ? 0.48 : 1,
                borderColor: color.baby_blue,
              }}
              {...(leftButtonProps as any)}
            />
          )}
          {rightButtonProps && (
            <RatsButton
              style={{ ...STAT_BUTTON_TEXT, color: color.white }}
              containerStyle={{
                ...STAT_BUTTON,
                flex: 0.48,
                borderColor: color.baby_blue,
              }}
              {...(rightButtonProps as any)}
            />
          )}
        </View>
      )}
    </View>
  );
};
