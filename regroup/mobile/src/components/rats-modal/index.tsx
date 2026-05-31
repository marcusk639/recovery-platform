import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import Modal, { ModalProps } from 'react-native-modal';
import {
  windowHeight,
  normalize,
  fontFamily,
  fontSize,
  color,
} from '../../styles/theme';
import { RatsText } from '../rats-text';
import { IOS } from '../../util/platform';
import { SafeAreaView } from 'react-native-safe-area-context';
import IOSStatusBar from '../ios-status-bar';

const styles = StyleSheet.create({
  modalContent: {
    // height: windowHeight / 3,
    padding: normalize(15),
    // justifyContent: 'center',
    // alignItems: 'center',
    borderRadius: normalize(4),
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'white',
  },
});

interface Props {
  isVisible: boolean;
  onBackdropPress: () => any;
  style?: any;
  children: any;
  modalStyle?: ViewStyle;
  behavior?: 'padding' | 'height' | 'position';
  useKeyboardView?: boolean;
  fullScreen?: boolean;
  showStatusBar?: boolean;
}

const RatsModal = (props: Props & ModalProps & ModalTitleProps) => {
  const {
    isVisible,
    showStatusBar,
    onBackdropPress,
    children,
    style,
    modalStyle,
    title,
    behavior,
    useKeyboardView = true,
    fullScreen,
  } = props;
  const VIEW_STYLE = [styles.modalContent, style];
  return (
    <Modal
      {...props}
      useNativeDriver={false}
      style={modalStyle}
      isVisible={isVisible}
      onBackdropPress={onBackdropPress}>
      {(fullScreen || showStatusBar) && IOS && (
        <IOSStatusBar backgroundColor={color.black} barStyle="light-content" />
      )}
      {/* <SafeAreaView style={modalStyle} forceInset={{ top: 'never' }}> */}
      {title && <RatsModalTitle title={title} />}
      {IOS && useKeyboardView ? (
        <KeyboardAvoidingView
          behavior={behavior || 'padding'}
          style={VIEW_STYLE}>
          {children}
        </KeyboardAvoidingView>
      ) : (
        <View style={VIEW_STYLE}>{children}</View>
      )}
      {/* </SafeAreaView> */}
      {fullScreen && IOS && (
        <SafeAreaView
          edges={['top', 'bottom']}
          style={{ backgroundColor: color.white }}
        />
      )}
    </Modal>
  );
};

interface ModalTitleProps {
  title?: string;
  containerStyle?: ViewStyle;
  titleStyle?: TextStyle;
}

export const RatsModalTitle = (props: ModalTitleProps) => {
  const { title, containerStyle, titleStyle } = props;
  return (
    <View
      style={[
        {
          height: normalize(50),
          width: '100%',
          backgroundColor: color.white,
          padding: normalize(5),
          alignItems: 'center',
          justifyContent: 'center',
        },
        containerStyle,
      ]}>
      <RatsText
        text={title}
        style={[
          {
            fontFamily: fontFamily.bold,
            fontSize: fontSize.large,
            color: color.black,
          },
          titleStyle,
        ]}
      />
    </View>
  );
};

export default RatsModal;
