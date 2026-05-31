import React from 'react';
import { STAT_BUTTON_TEXT, STAT_BUTTON, SAVE_BUTTON } from '../../styles/theme';
import RatsButton from '../rats-button/rats-button';
import { View, ViewStyle } from 'react-native';

interface Props {
  confirm: () => any;
  cancel: () => any;
  container?: ViewStyle;
  cancelButtonText?: string;
  confirmButtonText?: string;
  confirmTestID?: string;
  cancelTestID?: string;
}

const ConfirmationButtons = (props: Props) => {
  return (
    <View
      style={[
        { flexDirection: 'row', justifyContent: 'space-between' },
        props.container,
      ]}>
      <View style={{ flex: 0.48 }}>
        <RatsButton
          light
          testID={props.cancelTestID}
          style={STAT_BUTTON_TEXT}
          containerStyle={STAT_BUTTON}
          onPress={props.cancel}
          title={props.cancelButtonText || 'CANCEL'}
        />
      </View>
      <View style={{ flex: 0.48 }}>
        <RatsButton
          testID={props.confirmTestID}
          style={{ ...STAT_BUTTON_TEXT }}
          containerStyle={SAVE_BUTTON}
          onPress={props.confirm}
          title={props.confirmButtonText || 'SAVE'}
        />
      </View>
    </View>
  );
};

export default ConfirmationButtons;
