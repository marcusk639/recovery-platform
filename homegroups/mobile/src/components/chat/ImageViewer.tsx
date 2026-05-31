import React from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export interface ImageViewerProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onDownload?: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  visible,
  imageUri,
  onClose,
  onDownload,
}) => {
  if (!visible || !imageUri) return null;

  return (
    <Modal
      transparent={true}
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.imageViewerContainer}>
        <TouchableOpacity
          style={styles.imageViewerCloseButton}
          onPress={onClose}>
          <Icon name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={1}
          style={styles.imageViewerImageContainer}
          onPress={onClose}>
          <FastImage
            source={{uri: imageUri}}
            style={styles.imageViewerImage}
            resizeMode={FastImage.resizeMode.contain}
          />
        </TouchableOpacity>

        {onDownload && (
          <TouchableOpacity
            style={styles.imageViewerDownloadButton}
            onPress={onDownload}>
            <Icon name="download" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  imageViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  imageViewerCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  imageViewerDownloadButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    zIndex: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default ImageViewer;

