import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  ImageSourcePropType,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width, height} = Dimensions.get('window');

export interface OnboardingSlideData {
  id: string;
  title: string;
  description: string;
  icon?: string;
  image?: ImageSourcePropType;
  bulletPoints?: string[];
  backgroundColor?: string;
  iconColor?: string;
}

interface OnboardingSlideProps {
  slide: OnboardingSlideData;
}

const OnboardingSlide: React.FC<OnboardingSlideProps> = ({slide}) => {
  return (
    <View
      style={[
        styles.container,
        {backgroundColor: slide.backgroundColor || '#FFFFFF'},
      ]}>
      <View style={styles.content}>
        {/* Icon or Image */}
        <View style={styles.iconContainer}>
          {slide.image ? (
            <Image source={slide.image} style={styles.image} />
          ) : slide.icon ? (
            <View
              style={[
                styles.iconCircle,
                {backgroundColor: (slide.iconColor || '#2196F3') + '15'},
              ]}>
              <Icon
                name={slide.icon}
                size={80}
                color={slide.iconColor || '#2196F3'}
              />
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text style={styles.title}>{slide.title}</Text>

        {/* Description */}
        <Text style={styles.description}>{slide.description}</Text>

        {/* Bullet Points */}
        {slide.bulletPoints && slide.bulletPoints.length > 0 && (
          <View style={styles.bulletContainer}>
            {slide.bulletPoints.map((point, index) => (
              <View key={index} style={styles.bulletRow}>
                <Icon
                  name="check-circle"
                  size={20}
                  color={slide.iconColor || '#2196F3'}
                  style={styles.bulletIcon}
                />
                <Text style={styles.bulletText}>{point}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width,
    height: height * 0.75,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  bulletContainer: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  bulletIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  bulletText: {
    fontSize: 15,
    color: '#444444',
    flex: 1,
    lineHeight: 22,
  },
});

export default OnboardingSlide;

