import React, { PropsWithChildren, Fragment } from 'react';
import {
  normalize,
  elevateStyle,
  color,
  fontSize,
  fontFamily,
} from '../../styles/theme';
import { View, Dimensions, ViewStyle, TextStyle } from 'react-native';
import { RatsIcon } from '../rats-icon';
import { RatsText } from '../rats-text';
import styles from './styles';

interface RatsStatCardHeaderItemProps {
  label?: string;
  iconName?: string;
  headerStyle?: TextStyle;
}

const RatsStatCardHeaderItem = (
  props: PropsWithChildren<RatsStatCardHeaderItemProps>,
) => {
  const { label, iconName, children, headerStyle } = props;
  return (
    <View style={[styles.statHeaderItem]}>
      {iconName && (
        <RatsIcon
          name={iconName}
          style={{ ...styles.statHeader, ...headerStyle }}
          size={fontSize.medium}
        />
      )}
      {label && (
        <RatsText
          style={[
            styles.statHeader,
            { fontFamily: fontFamily.roboto },
            headerStyle,
          ]}
          text={label}
        />
      )}
    </View>
  );
};

interface RatsStatCardFooterItemProps {
  label: string;
  text: string;
  textStyle?: TextStyle;
}

const RatsStatCardFooterItem = (
  props: PropsWithChildren<RatsStatCardFooterItemProps>,
) => {
  const { label, text, textStyle } = props;
  return (
    <View style={styles.statFooterItem}>
      <RatsText style={[styles.statFooter]} translate={false} text={label} />
      <RatsText
        style={[styles.statFooter, textStyle]}
        translate={false}
        text={text}
      />
    </View>
  );
};

interface RatsStatCardProps {
  containerStyle?: ViewStyle;
  headerItems?: JSX.Element[];
  footerItems?: JSX.Element[];
  percentage?: string;
  ratio?: string;
  contentTextStyle?: TextStyle;
  contentContainerStyle?: ViewStyle;
}

const RatsStatCard = (props: PropsWithChildren<RatsStatCardProps>) => {
  const {
    containerStyle,
    headerItems,
    contentTextStyle,
    ratio,
    percentage,
    footerItems,
    children,
    contentContainerStyle,
  } = props;
  return (
    <View
      style={[
        {
          // height: normalize(120),
          width: '100%',
          backgroundColor: color.white,
          paddingHorizontal: normalize(15),
          paddingVertical: normalize(15),
          marginVertical: normalize(2),
        },
        containerStyle,
      ]}>
      {headerItems && (
        <View style={styles.statHeaderContainer}>{headerItems}</View>
      )}
      <View style={[styles.statContent, contentContainerStyle]}>
        {(percentage || ratio) && (
          <Fragment>
            <RatsText
              style={[styles.statNumber, contentTextStyle]}
              text={percentage}
            />
            <RatsText
              style={[styles.statNumber, contentTextStyle]}
              text={ratio}
            />
          </Fragment>
        )}
        {children}
      </View>
      {footerItems && footerItems.length && (
        <View style={styles.statFooterContainer}>{footerItems}</View>
      )}
    </View>
  );
};

export { RatsStatCard, RatsStatCardHeaderItem, RatsStatCardFooterItem };
