import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import functions from '@react-native-firebase/functions';
import analytics from '@react-native-firebase/analytics';
import {GroupStackParamList} from '../../types/navigation';
import SubscriptionWebView from '../../components/payments/SubscriptionWebView';
import {useAppSelector} from '../../store';
import {selectUser} from '../../store/slices/authSlice';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'SubscriptionUpgrade'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'SubscriptionUpgrade'
>;

const FEATURES = [
  {icon: 'cash-register', text: 'Treasury Management'},
  {icon: 'bullhorn', text: 'Announcements with Push Notifications'},
  {icon: 'calendar-clock', text: 'Meeting Management'},
  {icon: 'account-group', text: 'Member Directory'},
  {icon: 'badge-account', text: 'Service Positions'},
  {icon: 'chart-line', text: 'Admin Dashboard'},
];

interface MultiGroupPricingResult {
  fullPriceUsd: number;
  additionalPriceUsd: number;
  existingActiveGroupCount: number;
  isFirstGroup: boolean;
  recommendedPriceUsd: number;
  additionalPriceId: string | null;
}

const SubscriptionUpgradeScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = useAppSelector(selectUser);

  const [loading, setLoading] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricing, setPricing] = useState<MultiGroupPricingResult | null>(null);

  // Determine if user already admins other groups
  const adminGroups: string[] = (
    currentUser &&
    'adminGroups' in currentUser &&
    Array.isArray(currentUser.adminGroups)
      ? currentUser.adminGroups
      : []
  ) as string[];

  useEffect(() => {
    analytics().logEvent('subscription_view', {source: 'upgrade_screen'});
  }, []);

  useEffect(() => {
    // Only fetch multi-group pricing when user already admins at least one group
    // (which suggests they may be adding a second group)
    if (adminGroups.length > 0) {
      setPricingLoading(true);
      const callable = functions().httpsCallable('getMultiGroupPricing');
      callable({})
        .then(result => {
          setPricing(result.data as MultiGroupPricingResult);
        })
        .catch(err => {
          console.warn('Failed to fetch multi-group pricing:', err);
          // Fall back to default $12 pricing — don't block the upgrade screen
        })
        .finally(() => {
          setPricingLoading(false);
        });
    }
  }, [adminGroups.length]);

  const isMultiGroup = pricing !== null && !pricing.isFirstGroup;
  const displayPrice = isMultiGroup ? pricing!.additionalPriceUsd : 12;

  const handleUpgrade = () => {
    analytics().logEvent('subscription_attempt', {
      price_usd: displayPrice,
      billing_period: 'annual',
    });
    setLoading(true);
    setCheckoutVisible(true);
    setLoading(false);
  };

  const handleCheckoutSuccess = (_subscriptionId: string) => {
    analytics().logEvent('subscription_complete', {
      price_usd: displayPrice,
      billing_period: 'annual',
      method: 'stripe',
    });
    setCheckoutVisible(false);
    navigation.goBack();
  };

  const handleCheckoutClose = () => {
    setCheckoutVisible(false);
  };

  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Icon name="crown" size={48} color="#2196F3" />
          <Text style={styles.title}>Upgrade {groupName}</Text>
          <Text style={styles.subtitle}>
            Get full access to all admin features
          </Text>
        </View>

        {/* Multi-group discount banner */}
        {isMultiGroup && (
          <View
            style={styles.discountBanner}
            testID="multi-group-discount-banner">
            <Icon name="tag-multiple" size={20} color="#FFFFFF" />
            <Text style={styles.discountBannerText}>
              Multi-Group Discount Applied! You already admin{' '}
              {pricing!.existingActiveGroupCount} group
              {pricing!.existingActiveGroupCount !== 1 ? 's' : ''}.
            </Text>
          </View>
        )}

        <View style={styles.priceCard}>
          {pricingLoading ? (
            <ActivityIndicator
              size="small"
              color="#2196F3"
              style={styles.pricingLoader}
              testID="pricing-loader"
            />
          ) : (
            <>
              {isMultiGroup && (
                <View style={styles.originalPriceRow}>
                  <Text style={styles.originalPrice}>$12</Text>
                  <Text style={styles.originalPriceUnit}>/year</Text>
                </View>
              )}
              <View style={styles.priceRow}>
                <Text style={styles.price}>${displayPrice}</Text>
                <Text style={styles.priceUnit}>/year</Text>
              </View>
              {isMultiGroup ? (
                <Text style={styles.priceBreakdown}>
                  Additional group discount — save $
                  {pricing!.fullPriceUsd - pricing!.additionalPriceUsd}/year
                </Text>
              ) : (
                <Text style={styles.priceBreakdown}>
                  Billed once annually for your entire group
                </Text>
              )}
            </>
          )}
        </View>

        {/* Pricing comparison for multi-group users */}
        {isMultiGroup && (
          <View style={styles.comparisonCard} testID="pricing-comparison">
            <Text style={styles.comparisonTitle}>Pricing Breakdown</Text>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>First group</Text>
              <Text style={styles.comparisonValue}>
                ${pricing!.fullPriceUsd}/year
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>
                Additional groups (each)
              </Text>
              <Text style={[styles.comparisonValue, styles.comparisonDiscount]}>
                ${pricing!.additionalPriceUsd}/year
              </Text>
            </View>
          </View>
        )}

        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What's Included</Text>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Icon name="check-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleUpgrade}
            disabled={loading}
            testID="upgrade-now-button">
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  Upgrade Now — ${displayPrice}/year
                </Text>
                <Icon name="arrow-right" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {checkoutVisible && (
        <SubscriptionWebView
          visible={checkoutVisible}
          groupId={groupId}
          groupName={groupName}
          userId={currentUser?.uid ?? ''}
          userEmail={currentUser?.email ?? ''}
          userName={currentUser?.displayName ?? ''}
          onSuccess={handleCheckoutSuccess}
          onClose={handleCheckoutClose}
          onError={handleCheckoutClose}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 32,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    marginTop: 8,
  },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  discountBannerText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  priceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  pricingLoader: {
    marginVertical: 16,
  },
  originalPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  originalPrice: {
    fontSize: 24,
    fontWeight: '400',
    color: '#BDBDBD',
    textDecorationLine: 'line-through',
  },
  originalPriceUnit: {
    fontSize: 14,
    marginLeft: 2,
    color: '#BDBDBD',
    textDecorationLine: 'line-through',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: '#212121',
  },
  priceUnit: {
    fontSize: 20,
    marginLeft: 4,
    color: '#757575',
  },
  priceBreakdown: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    textAlign: 'center',
  },
  comparisonCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  comparisonLabel: {
    fontSize: 14,
    color: '#616161',
  },
  comparisonValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  comparisonDiscount: {
    color: '#4CAF50',
  },
  featuresSection: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featureText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#212121',
  },
  ctaSection: {
    padding: 16,
    paddingTop: 24,
  },
  ctaButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    gap: 8,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 16,
  },
  secondaryText: {
    fontSize: 16,
    color: '#757575',
  },
});

export default SubscriptionUpgradeScreen;
