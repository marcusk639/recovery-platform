import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {theme} from '../../theme/theme';
import {Button} from '../../components/common/Button';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Meetings: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const {width} = Dimensions.get('window');

const LandingScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <SafeAreaView style={styles.container} testID="landing-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Image
                source={require('../../assets/images/logo-2.jpg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>Homegroups</Text>
          </View>

          <Text style={styles.heroTitle}>
            Your Recovery Community,{'\n'}Connected
          </Text>
          <Text style={styles.heroSubtitle}>
            Stay connected with your recovery group while maintaining complete
            anonymity and privacy.
          </Text>

          <View style={styles.heroImageContainer}>
            <Image
              source={require('../../assets/images/homegroups_landing_2.jpeg')}
              style={styles.heroImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Icon
                name="calendar-clock"
                size={32}
                color={theme.colors.primary.main}
              />
            </View>
            <Text style={styles.featureTitle}>Meeting Directory</Text>
            <Text style={styles.featureDescription}>
              Find and save meetings, get reminders, and stay connected with
              your homegroup schedule.
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Icon
                name="message-text"
                size={32}
                color={theme.colors.primary.main}
              />
            </View>
            <Text style={styles.featureTitle}>Secure Communication</Text>
            <Text style={styles.featureDescription}>
              Private messaging and announcements to keep your group connected
              while respecting anonymity.
            </Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Icon
                name="cash-multiple"
                size={32}
                color={theme.colors.primary.main}
              />
            </View>
            <Text style={styles.featureTitle}>Treasury Management</Text>
            <Text style={styles.featureDescription}>
              Track contributions and expenses with secure, transparent
              financial management.
            </Text>
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.privacySection}>
          <View style={styles.privacyIcon}>
            <Icon
              name="shield-lock"
              size={32}
              color={theme.colors.primary.main}
            />
          </View>
          <Text style={styles.privacyTitle}>Privacy First</Text>
          <Text style={styles.privacyText}>
            We respect anonymity. First names only, secure communications, and
            no social media integration.
          </Text>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <Button
            title="Get Started"
            variant="primary"
            size="large"
            onPress={() => navigation.navigate('Register')}
            style={styles.primaryButton}
            testID="landing-register-button"
          />
          <Button
            title="Sign In"
            variant="outline"
            size="large"
            onPress={() => navigation.navigate('Login')}
            style={styles.secondaryButton}
            testID="landing-signin-button"
          />
          <Button
            title="Find a Meeting"
            variant="secondary"
            size="large"
            onPress={() => navigation.navigate('Meetings')}
            style={styles.tertiaryButton}
            testID="landing-find-meeting-button"
          />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLinks}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://recovery-connect-cad4b.web.app/privacy')
            }>
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://recovery-connect-cad4b.web.app/terms')
            }>
            <Text style={styles.footerLink}>Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://recovery-connect-cad4b.web.app/about')
            }>
            <Text style={styles.footerLink}>About</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.copyright}>© 2026 Homegroups</Text>
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
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  heroSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.primary.main,
  },
  heroTitle: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: 'bold',
    color: theme.colors.neutral.grey900,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: 40,
  },
  heroSubtitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.neutral.grey600,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
    paddingHorizontal: theme.spacing.md,
  },
  heroImageContainer: {
    width: width * 0.8,
    height: width * 0.8,
    marginVertical: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.borderRadius.lg,
  },
  featuresSection: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  featureCard: {
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    shadowColor: theme.colors.neutral.grey900,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  featureTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
    marginBottom: theme.spacing.xs,
  },
  featureDescription: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey600,
    lineHeight: 22,
  },
  privacySection: {
    backgroundColor: theme.colors.neutral.grey50,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.neutral.grey200,
  },
  privacyIcon: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  privacyTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.neutral.grey900,
    marginBottom: theme.spacing.xs,
  },
  privacyText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.neutral.grey700,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaSection: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  primaryButton: {
    marginBottom: theme.spacing.md,
  },
  secondaryButton: {
    marginBottom: theme.spacing.md,
  },
  tertiaryButton: {
    marginBottom: theme.spacing.xl,
  },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral.grey200,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  footerLink: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary.main,
    marginHorizontal: theme.spacing.sm,
  },
  copyright: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
  },
});

export default LandingScreen;
