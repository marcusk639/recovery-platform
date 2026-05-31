import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width} = Dimensions.get('window');

interface AdminValuePropSlideProps {
  onContinue: () => void;
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
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

const AdminValuePropSlide: React.FC<AdminValuePropSlideProps> = ({
  onContinue,
}) => {
  return (
    <View style={styles.container} testID="admin-value-prop-slide">
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
          {features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.iconContainer}>
                <Icon name={feature.icon} size={24} color="#1976D2" />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard} testID="value-prop-pricing-card">
          <View style={styles.priceRow}>
            <Text style={styles.price}>$12</Text>
            <Text style={styles.priceUnit}>/year</Text>
          </View>
          <Text style={styles.priceSubtext}>
            Billed once annually for your entire group
          </Text>
          <View style={styles.trialBadge}>
            <Icon name="gift" size={16} color="#4CAF50" />
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
          onPress={onContinue}
          activeOpacity={0.8}
          testID="value-prop-continue-button">
          <Text style={styles.ctaText}>Start Free Trial</Text>
          <Icon name="arrow-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.ctaSubtext}>No credit card required to start</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width,
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 28,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    paddingTop: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
  },
  pricingCard: {
    backgroundColor: '#F8F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C5CAE9',
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 44,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  priceUnit: {
    fontSize: 18,
    color: '#666666',
    marginLeft: 4,
  },
  priceSubtext: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 6,
  },
  socialProofText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  ctaContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  ctaButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ctaSubtext: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default AdminValuePropSlide;
