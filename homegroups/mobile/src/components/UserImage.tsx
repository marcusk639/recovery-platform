import React from 'react';
import {Image, Text, StyleSheet, View} from 'react-native';

interface UserImageProps {
  photoUrl?: string | null;
  displayName?: string | null;
  size?: number;
  style?: any;
}

const UserImage: React.FC<UserImageProps> = ({
  photoUrl,
  displayName,
  size = 60,
  style,
}) => {
  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (photoUrl) {
    return (
      <Image
        source={{uri: photoUrl}}
        style={[styles.image, containerStyle, style]}
      />
    );
  }

  return (
    <View style={[styles.initialsContainer, containerStyle, style]}>
      <Text style={[styles.initialsText, {fontSize: size * 0.4}]}>
        {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e1e1e1',
  },
  initialsContainer: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default UserImage;
