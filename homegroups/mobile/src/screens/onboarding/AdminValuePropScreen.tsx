import React, {useLayoutEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GroupStackParamList} from '../../types/navigation';
import {theme} from '../../theme/theme';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'AdminValueProp'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'AdminValueProp'
>;

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({
  icon,
  title,
  description,
}) => (
  <View style={styles.featureItem}>
    <View style={styles.iconContainer}>
      <Icon name={icon} size={24} color={theme.colors.primary.main} />
    </View>
    <View style={styles.featureText}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDescription}>{description}</Text>
    </View>
  </View>
);

const FEATURES: FeatureItemProps[] = [
  {
    icon: 'cash-register',
    title: 'Treasury Management',
    description:
      'Track income & expenses, generate reports, and manage treasurer handoffs seamlessly.',
  },
  {
    icon: 'bullhorn',
    title: 'Announcements',
    description:
      'Send push notifications to all members instantly. Pin important announcements.',
  },
  {
    icon: 'calendar-clock',
    title: 'Meeting Management',
    description:
      'Schedule meetings, track cancellations, and assign chairpersons with ease.',
  },
  {
    icon: 'account-group',
    title: 'Member Directory',
    description:
      'Manage members, approve requests, and track service positions.',
  },
  {
    icon: 'message-text',
    title: 'Group Chat',
    description:
      'Secure group messaging with mentions, reactions, and media sharing.',
  },
  {
    icon: 'shield-check',
    title: 'Admin Controls',
    description:
      'Full control over group settings, member roles, and content moderation.',
  },
];

const AdminValuePropScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, groupName} = route.params;

  const handleContinue = () => {
    navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleContinue} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Everything Your Group Needs</Text>
          <Text style={styles.headerSubtitle}>
            Manage your homegroup with powerful tools built for recovery
            communities
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => (
            <FeatureItem
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>$12</Text>
            <Text style={styles.priceUnit}>/year</Text>
          </View>
          <Text style={styles.priceSubtext}>
            Billed once annually for your entire group
          </Text>
          <View style={styles.trialBadge}>
            <Icon name="gift" size={16} color={theme.colors.secondary.main} />
            <Text style={styles.trialText}>Start with 7 days free</Text>
          </View>
        </View>

        {/* Social Proof */}
        <Text style={styles.socialProofText}>
          Trusted by recovery groups across the country
        </Text>
      </ScrollView>

      {/* CTA Button */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleContinue}
          activeOpacity={0.8}>
          <Text style={styles.ctaText}>Start Free Trial</Text>
          <Icon
            name="arrow-right"
            size={20}
            color={theme.colors.neutral.white}
          />
        </TouchableOpacity>
        <Text style={styles.ctaSubtext}>No credit card required to start</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 140,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
    textAlign: 'center',
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: theme.colors.neutral.grey600,
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    paddingTop: 2,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: theme.colors.neutral.grey600,
    lineHeight: 20,
  },
  pricingCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.neutral.grey300,
    backgroundColor: theme.colors.background.secondary,
    alignItems: 'center',
    marginBottom: 24,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
  },
  priceUnit: {
    fontSize: 20,
    color: theme.colors.neutral.grey600,
    marginLeft: 4,
  },
  priceSubtext: {
    fontSize: 14,
    color: theme.colors.neutral.grey600,
    marginTop: 4,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.secondary.main,
    marginLeft: 6,
  },
  socialProofText: {
    fontSize: 13,
    color: theme.colors.neutral.grey500,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: theme.colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.grey300,
  },
  ctaButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary.main,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.neutral.white,
  },
  ctaSubtext: {
    fontSize: 12,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
    marginTop: 8,
  },
  skipButton: {
    marginRight: 16,
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 16,
    color: theme.colors.primary.main,
    fontWeight: '500',
  },
});

export default AdminValuePropScreen;
