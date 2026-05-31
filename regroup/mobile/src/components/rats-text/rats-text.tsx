import React from 'react';
import { Text, TextProps } from 'react-native';
import styles from './styles';
import { useTheme, useTranslation } from '../../context';

interface Props {
  text: string | any;
  style?: any;
  translate?: boolean;
  translateParams?: {
    [key: string]: string | number;
  };
  toUpper?: boolean;
}

const transform = (value: string, toUpper?: boolean) =>
  toUpper ? value.toUpperCase() : value;

/**
 * Standard text field
 * Phase 3.3: Migrated from withRats HOC to useTheme and useTranslation hooks
 */
const RatsText = ({
  style,
  text,
  translate = true,
  translateParams = {},
  toUpper,
  numberOfLines,
}: Props & TextProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.text, { fontFamily: theme.primaryFontFamily }, style]}>
      {translate
        ? transform(t(text, translateParams), toUpper)
        : transform(text, toUpper)}
    </Text>
  );
};

export default RatsText;
