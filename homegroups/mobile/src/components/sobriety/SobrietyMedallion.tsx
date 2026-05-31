import React, {useRef, useEffect} from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface SobrietyMedallionProps {
  sobrietyDays: number;
  milestone: string;
  onPress?: () => void;
  isNewMilestone?: boolean;
}

// Define milestone configurations
const MILESTONE_CONFIGS = {
  '1day': {
    color: '#CD7F32', // Bronze
    icon: 'medal',
    text: '24 Hours',
  },
  '30days': {
    color: '#CD7F32', // Bronze
    icon: 'medal',
    text: '30 Days',
  },
  '60days': {
    color: '#C0C0C0', // Silver
    icon: 'medal',
    text: '60 Days',
  },
  '90days': {
    color: '#C0C0C0', // Silver
    icon: 'medal',
    text: '90 Days',
  },
  '6months': {
    color: '#FFD700', // Gold
    icon: 'medal',
    text: '6 Months',
  },
  '1year': {
    color: '#FFD700', // Gold
    icon: 'medal',
    text: '1 Year',
  },
  '18months': {
    color: '#FFD700', // Gold
    icon: 'medal',
    text: '18 Months',
  },
  '2years': {
    color: '#B9F2FF', // Platinum
    icon: 'medal',
    text: '2 Years',
  },
  '3years': {
    color: '#B9F2FF', // Platinum
    icon: 'medal',
    text: '3 Years',
  },
  '4years': {
    color: '#E5E4E2', // Platinum
    icon: 'medal',
    text: '4 Years',
  },
  '5years': {
    color: '#50C878', // Emerald
    icon: 'medal',
    text: '5 Years',
  },
};

const SobrietyMedallion: React.FC<SobrietyMedallionProps> = ({
  sobrietyDays,
  milestone,
  onPress,
  isNewMilestone = false,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.2)).current;

  // Get the configuration for the current milestone
  const medallionConfig = MILESTONE_CONFIGS[
    milestone as keyof typeof MILESTONE_CONFIGS
  ] || {
    color: '#CD7F32',
    icon: 'medal',
    text: `${sobrietyDays} Days`,
  };

  useEffect(() => {
    // Start rotation animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      }),
    ).start();

    // If it's a new milestone, add celebration animations
    if (isNewMilestone) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();

      // Glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.8,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [isNewMilestone]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={styles.container}>
      <Animated.View
        style={[
          styles.medallionContainer,
          {
            transform: [
              {scale: scaleAnim},
              {
                rotate: rotateAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
            shadowOpacity: glowAnim,
            shadowColor: medallionConfig.color,
          },
        ]}>
        <View
          style={[styles.medallion, {backgroundColor: medallionConfig.color}]}>
          <Icon
            name={medallionConfig.icon}
            size={60}
            color="#FFFFFF"
            style={styles.icon}
          />
          <Text style={styles.daysText}>{medallionConfig.text}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 10,
  },
  medallionContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 15,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  medallion: {
    flex: 1,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  icon: {
    marginBottom: 8,
  },
  daysText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SobrietyMedallion;
