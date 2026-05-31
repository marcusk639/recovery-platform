import React, { Component, useState, useEffect, Fragment } from 'react';
import {
  TouchableOpacity,
  Alert,
  View,
  ViewStyle,
  Dimensions,
} from 'react-native';
import ImagePicker, {
  ImageLibraryOptions,
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import { logException } from '../../util/logging';
import { ROW, color, fontSize, normalize } from '../../styles/theme';
import { RatsText } from '../rats-text';
import RatsLabel from '../rats-label/rats-label';
import RatsButton from '../rats-button/rats-button';
import { RatsImage } from '../rats-image';
import { RatsIcon } from '../rats-icon/rats-icon';

class State {}

export interface ImagePickerProps {
  options?: ImageLibraryOptions;
  onImageSelect: (response: ImagePickerResponse) => any;
  container?: ViewStyle;
  labelContainer?: ViewStyle;
  buttonContainer?: ViewStyle;
  imageContainer?: ViewStyle;
  label: string;
  uri?: string;
  onClear: () => void;
  imageHandler?: (response: ImagePickerResponse) => void;
  avatarStyle?: boolean;
  [key: string]: any;
}

const CONTAINER: ViewStyle = {
  marginVertical: normalize(10),
};

const LABEL_ROW: ViewStyle = {
  ...ROW,
  justifyContent: 'space-between',
};

const BUTTON_CONTAINER: ViewStyle = {
  ...ROW,
  justifyContent: 'space-between',
};

const IMAGE: ViewStyle = {
  height: normalize(250),
  width: '100%',
  marginTop: normalize(10),
};
const size = 80;
const CIRCLEIMAGE: ViewStyle = {
  height: normalize(size),
  width: normalize(size),
  borderRadius: normalize(size / 2),
};

const IMAGE_CONTAINER: ViewStyle = {};

const RatsImagePicker = ({
  container,
  labelRow: labelContainer,
  buttonContainer,
  imageContainer,
  label,
  onClear,
  avatarStyle = false,
  options = {
    mediaType: 'photo',
    maxHeight: 500,
    maxWidth: 500,
    // permissionDenied: { reTryTitle: 'Permissions', text: 'Permission text', title: 'Image Permissions', okTitle: 'ok' }
  },
  onImageSelect,
  uri = '',
  imageHandler,
}: ImagePickerProps) => {
  const [source, setSource] = useState({ uri: uri ? uri : null });
  const defaultImageHandler = (response: ImagePickerResponse) => {
    if (response.didCancel) {
      // cancelled
    } else if (response.errorMessage) {
      logException(response.errorMessage);
    } else if (false) {
      // continue
    } else {
      onImageSelect(response);
    }
  };

  const renderButtons = () => {
    return (
      <Fragment>
        <RatsButton
          containerStyle={{ flex: 0.49 }}
          title="LIBRARY"
          light
          onPress={() =>
            launchImageLibrary(
              options,
              async (response: ImagePickerResponse) => {
                if (imageHandler) {
                  imageHandler(response);
                } else {
                  defaultImageHandler(response);
                }
                const uri = response.assets?.length && response.assets[0].uri;
                setSource({ uri: uri || '' });
              },
            )
          }
        />
        <RatsButton
          containerStyle={{ flex: 0.49 }}
          title="CAMERA"
          light
          onPress={() => {
            launchCamera(options, (response: ImagePickerResponse) => {
              if (imageHandler) {
                imageHandler(response);
              } else {
                defaultImageHandler(response);
              }
              const uri = response.assets?.length && response.assets[0].uri;
              setSource({ uri: uri || '' });
            });
          }}
        />
      </Fragment>
    );
  };

  const clear = () => {
    setSource({ uri: '' });
    if (onClear) {
      onClear();
    }
  };

  if (avatarStyle) {
    return (
      <View style={[CONTAINER, { width: '100%' }, container]}>
        <View style={[ROW]}>
          <View style={[IMAGE_CONTAINER, imageContainer]}>
            {source && source.uri && (
              <RatsImage
                style={CIRCLEIMAGE}
                source={{ uri: source.uri }}
                resizeMethod="auto"
                resizeMode="cover"
              />
            )}
            {(!source || !source.uri) && (
              <View
                style={[
                  CIRCLEIMAGE,
                  {
                    borderColor: color.dark_grey,
                    borderWidth: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                ]}>
                <RatsIcon name="file-image" size={30} />
                {/* <RatsText text="No photo selected" style={{ fontSize: fontSize.regular, color: color.dark_grey }} /> */}
              </View>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: normalize(10) }}>
            <View style={[LABEL_ROW, labelContainer]}>
              <RatsLabel style={{ color: color.dark_grey }} label={label} />
              <TouchableOpacity onPress={clear}>
                <RatsText
                  text="Clear"
                  style={{ color: color.baby_blue, fontSize: fontSize.medium }}
                />
              </TouchableOpacity>
            </View>
            <View style={[BUTTON_CONTAINER, buttonContainer]}>
              {renderButtons()}
            </View>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={[CONTAINER, container]}>
      <View style={[LABEL_ROW, labelContainer]}>
        <RatsLabel style={{ color: color.dark_grey }} label={label} />
        <TouchableOpacity onPress={clear}>
          <RatsText
            text="Clear"
            style={{ color: color.baby_blue, fontSize: fontSize.medium }}
          />
        </TouchableOpacity>
      </View>
      <View style={[BUTTON_CONTAINER, buttonContainer]}>{renderButtons()}</View>
      {/* <View style={[IMAGE_CONTAINER, imageContainer]}> */}
      {source && source.uri && (
        <RatsImage
          style={IMAGE}
          source={{ uri: source.uri }}
          resizeMethod="auto"
          resizeMode="cover"
        />
      )}
      {(!source || !source.uri) && (
        <View
          style={[
            IMAGE,
            {
              borderColor: color.dark_grey,
              borderWidth: 1,
              borderRadius: 5,
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}>
          <RatsIcon name="file-image" size={30} />
          <RatsText
            text="No photo selected"
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
        </View>
      )}
      {/* </View> */}
    </View>
  );
};

export default RatsImagePicker;
