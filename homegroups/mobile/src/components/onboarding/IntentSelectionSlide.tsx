import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width} = Dimensions.get('window');

export type OnboardingIntent = 'admin' | 'member' | 'seeker';

interface IntentOption {
  id: OnboardingIntent;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const intentOptions: IntentOption[] = [
  {
    id: 'admin',
    title: 'Set Up My Group',
    description: 'I want to manage my homegroup on the app',
    icon: 'account-cog',
    color: '#4CAF50',
  },
  {
    id: 'member',
    title: 'Find My Group',
    description: 'I want to join my homegroup',
    icon: 'account-search',
    color: '#2196F3',
  },
  {
    id: 'seeker',
    title: 'Find Meetings',
    description: "I'm looking for meetings near me",
    icon: 'map-marker-radius',
    color: '#FF9800',
  },
];

interface IntentSelectionSlideProps {
  onSelect: (intent: OnboardingIntent) => void;
  selectedIntent: OnboardingIntent | null;
}

const IntentSelectionSlide: React.FC<IntentSelectionSlideProps> = ({
  onSelect,
  selectedIntent,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>What brings you here?</Text>
        <Text style={styles.subtitle}>
          We'll personalize your experience based on your needs
        </Text>
      </View>

      <View style={styles.cardsContainer}>
        {intentOptions.map(option => {
          const isSelected = selectedIntent === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.card,
                isSelected && styles.cardSelected,
                isSelected && {borderColor: option.color},
              ]}
              onPress={() => onSelect(option.id)}
              activeOpacity={0.8}
              testID={`intent-card-${option.id}`}>
              <View
                style={[
                  styles.iconContainer,
                  {backgroundColor: option.color + '15'},
                ]}>
                <Icon name={option.icon} size={36} color={option.color} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{option.title}</Text>
                <Text style={styles.cardDescription}>{option.description}</Text>
              </View>
              <View style={styles.radioContainer}>
                <View
                  style={[
                    styles.radio,
                    isSelected && {borderColor: option.color},
                  ]}>
                  {isSelected && (
                    <View
                      style={[
                        styles.radioInner,
                        {backgroundColor: option.color},
                      ]}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSelected: {
    backgroundColor: '#FAFAFA',
    shadowOpacity: 0.1,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
  radioContainer: {
    marginLeft: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

export default IntentSelectionSlide;
