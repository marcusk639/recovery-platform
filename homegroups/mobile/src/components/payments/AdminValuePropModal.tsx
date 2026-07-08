import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '../../theme/theme';

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

interface AdminValuePropModalProps {
  visible: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const features = [
  {
    icon: 'cash-register',
    title: 'Treasury Management',
    description: 'Track income & expenses, generate reports, manage handoffs.',
  },
  {
    icon: 'bullhorn',
    title: 'Announcements',
    description: 'Send push notifications to all members instantly.',
  },
  {
    icon: 'calendar-clock',
    title: 'Meeting Management',
    description: 'Schedule meetings, track cancellations, assign chairs.',
  },
  {
    icon: 'account-group',
    title: 'Member Directory',
    description: 'Manage members, approve requests, track positions.',
  },
  {
    icon: 'message-text',
    title: 'Group Chat',
    description: 'Secure messaging with mentions, reactions, and media.',
  },
  {
    icon: 'shield-check',
    title: 'Admin Controls',
    description: 'Full control over settings, roles, and moderation.',
  },
];

const AdminValuePropModal: React.FC<AdminValuePropModalProps> = ({
  visible,
  onClose,
  onContinue,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="close" size={24} color={theme.colors.neutral.grey800} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onContinue}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Everything Your Group Needs</Text>
            <Text style={styles.heroSubtitle}>
              Powerful tools built for recovery communities
            </Text>
          </View>

          {/* Features List */}
          <View style={styles.featuresContainer}>
            {features.map((feature, index) => (
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
          <Text style={styles.socialProof}>
            Trusted by recovery groups across the country
          </Text>
        </ScrollView>

        {/* CTA Section */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={onContinue}
            activeOpacity={0.8}>
            <Text style={styles.ctaText}>Start Free Trial</Text>
            <Icon
              name="arrow-right"
              size={20}
              color={theme.colors.neutral.white}
            />
          </TouchableOpacity>
          <Text style={styles.ctaSubtext}>
            No credit card required to start
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.grey300,
  },
  closeButton: {
    padding: 4,
  },
  skipText: {
    fontSize: 16,
    color: theme.colors.primary.main,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 140,
  },
  heroSection: {
    marginBottom: 32,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
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
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
    marginBottom: 2,
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
  socialProof: {
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
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.neutral.white,
    marginRight: 8,
  },
  ctaSubtext: {
    fontSize: 12,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default AdminValuePropModal;
