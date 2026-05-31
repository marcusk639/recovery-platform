import React from 'react';
import { View } from 'react-native';
import RatsModal from '../rats-modal';
import RatsLoadingIndicator from '../rats-loading-indicator/rats-loading-indicator';
import RatsLabel from '../rats-label/rats-label';
import RatsButton from '../rats-button/rats-button';
import modalStyles from './styles';

interface Props {
  loading: boolean;
  visible: boolean;
  children: any;
  modalStyle: any;
  onBackdropPress: () => any;
  formHeader: string;
  disableSubmit: boolean;
  onSubmit: () => any;
  errorMessage: string;
  headerStyle: any;
  testID?: string;
  submitButtonTestID?: string;
}

const RatsModalForm = (props: Props) => {
  const RatsModalAny = RatsModal as any;
  const {
    loading = false,
    visible = false,
    disableSubmit = false,
    children,
    onSubmit,
    modalStyle,
    onBackdropPress,
    formHeader,
    headerStyle,
    testID,
    submitButtonTestID,
  } = props;
  return (
    <RatsModalAny
      testID={testID}
      style={modalStyle}
      onBackdropPress={onBackdropPress}
      isVisible={visible}>
      {loading && <RatsLoadingIndicator />}
      {!loading && (
        <View style={modalStyles.container}>
          <RatsLabel style={headerStyle} label={formHeader} />
          <View style={modalStyles.fieldContainer}>{children}</View>
          <View style={modalStyles.buttonContainer}>
            <RatsButton
              testID={submitButtonTestID || (testID ? `${testID}-submit-button` : 'reset-password-button')}
              title="Submit"
              onPress={onSubmit}
              disabled={disableSubmit}
            />
          </View>
        </View>
      )}
    </RatsModalAny>
  );
};

export default RatsModalForm;
