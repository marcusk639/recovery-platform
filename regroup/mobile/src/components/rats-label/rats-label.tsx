import React from 'react';
import { RatsText } from '../rats-text';
import { camelCaseToDisplayForm } from '../../util/display';
import styles from './styles';
import { color } from '../../styles/theme';

export interface LabelProps {
  label: string | any;
  style: any;
}

const RatsLabel = ({ label, style }: LabelProps) => (
  <RatsText
    style={[styles.label, { color: color.black }, style]}
    text={label}
  />
);

export default RatsLabel;
