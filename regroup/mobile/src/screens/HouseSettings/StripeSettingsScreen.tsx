import React, { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Linking,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import ScreenHeader from "../../components/screen-header";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsIcon } from "../../components/rats-icon/rats-icon";
import {
  color,
  CARD_STYLE,
  SAVE_BUTTON,
  normalize,
  fontSize,
  fontFamily,
} from "../../styles/theme";
import { functions } from "../../../firebase-setup";
import { StripeAccountStatus } from "../../entities/House";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const STATUS_CONFIG: Record<
  StripeAccountStatus,
  { label: string; color: string; icon: string; description: string }
> = {
  [StripeAccountStatus.ACTIVE]: {
    label: "Active",
    color: color.green,
    icon: "check-circle",
    description: "Your Stripe account is set up and accepting payments.",
  },
  [StripeAccountStatus.PENDING]: {
    label: "Setup In Progress",
    color: color.yellow,
    icon: "clock",
    description:
      "Your Stripe account is pending review. This usually takes 1–2 business days.",
  },
  [StripeAccountStatus.RESTRICTED]: {
    label: "Action Required",
    color: color.orange,
    icon: "exclamation-triangle",
    description:
      "Your account has restrictions. Complete the required steps below to start accepting payments.",
  },
  [StripeAccountStatus.DISCONNECTED]: {
    label: "Disconnected",
    color: color.grey,
    icon: "times-circle",
    description:
      "Your Stripe account has been disconnected. Connect again to accept payments.",
  },
  [StripeAccountStatus.NOT_CONNECTED]: {
    label: "Not Connected",
    color: color.grey,
    icon: "times-circle",
    description:
      "Connect a Stripe account to start accepting rent payments from residents.",
  },
};

/**
 * Human-readable labels for Stripe requirement field names.
 * Stripe returns snake_case identifiers; we translate them into plain English.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  "business_profile.mcc": "Business category",
  "business_profile.url": "Business website",
  "business_profile.name": "Business name",
  "individual.dob.day": "Date of birth",
  "individual.dob.month": "Date of birth",
  "individual.dob.year": "Date of birth",
  "individual.first_name": "First name",
  "individual.last_name": "Last name",
  "individual.ssn_last_4": "Last 4 digits of SSN",
  "individual.address.city": "City",
  "individual.address.line1": "Street address",
  "individual.address.state": "State",
  "individual.address.postal_code": "ZIP code",
  "individual.email": "Email address",
  "individual.phone": "Phone number",
  "individual.id_number": "Social Security Number",
  bank_account: "Bank account",
  external_account: "Bank account",
  "tos_acceptance.date": "Terms of service acceptance",
  "tos_acceptance.ip": "Terms of service acceptance",
};

/**
 * Translate a Stripe requirement key into a human-readable label.
 * Falls back to formatting the key itself if no mapping exists.
 */
const formatRequirement = (req: string): string => {
  if (REQUIREMENT_LABELS[req]) {
    return REQUIREMENT_LABELS[req];
  }
  // Strip common prefixes and convert snake_case to Title Case
  const cleaned = req
    .replace(/^(individual|company|business_profile)\./i, "")
    .replace(/_/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

/**
 * Translate raw Firebase/Stripe error messages into user-friendly text.
 */
const friendlyError = (raw: string): string => {
  if (!raw) return "Something went wrong. Please try again.";

  const lower = raw.toLowerCase();

  if (
    lower.includes("account not found") ||
    lower.includes("no such account")
  ) {
    return "We could not find your Stripe account. Please reconnect.";
  }
  if (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("unavailable")
  ) {
    return "Network error. Please check your connection and try again.";
  }
  if (
    lower.includes("permission") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "You do not have permission to perform this action.";
  }
  if (lower.includes("invalid") || lower.includes("bad request")) {
    return "There was a problem with the request. Please try again.";
  }
  if (lower.includes("already connected") || lower.includes("already exists")) {
    return "A Stripe account is already connected to this house.";
  }

  return "Something went wrong. Please try again or contact support.";
};

const BENEFITS = [
  { icon: "credit-card", text: "Accept rent payments directly from residents" },
  { icon: "university", text: "Funds deposited straight to your bank account" },
  { icon: "shield-alt", text: "Secure, encrypted payments powered by Stripe" },
  { icon: "chart-bar", text: "Track all payments in one place" },
  { icon: "bolt", text: "Residents pay in minutes — no cash or checks needed" },
];

const StripeSettingsScreen: React.FC<Props> = (_props) => {
  const { house } = useSelectedHouse();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<StripeAccountStatus>(
    StripeAccountStatus.NOT_CONNECTED,
  );
  const [chargesEnabled, setChargesEnabled] = useState(false);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [requirements, setRequirements] = useState<{
    currentlyDue: string[];
    pastDue: string[];
  }>({
    currentlyDue: [],
    pastDue: [],
  });
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!house?.stripeAccountId) {
      setLoading(false);
      setStatus(StripeAccountStatus.NOT_CONNECTED);
      return;
    }

    try {
      const response = await functions.httpsCallable("getStripeAccountStatus")({
        houseId: house.id,
      });
      const data = response.data;
      setStatus(data.status ?? StripeAccountStatus.NOT_CONNECTED);
      setChargesEnabled(data.chargesEnabled ?? false);
      setPayoutsEnabled(data.payoutsEnabled ?? false);
      setRequirements(data.requirements ?? { currentlyDue: [], pastDue: [] });
      setError(null);
    } catch (err: any) {
      setError(friendlyError(err.message ?? ""));
    } finally {
      setLoading(false);
    }
  }, [house?.id, house?.stripeAccountId]);

  // useFocusEffect (not useEffect) so returning to this screen re-fetches
  // status — most importantly after the user completes Stripe Connect
  // onboarding via an external browser redirect and comes back here. It also
  // fires on initial mount, so this replaces (not supplements) a plain
  // useEffect fetch-on-mount.
  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus]),
  );

  const handleConnect = useCallback(async () => {
    if (!house) return;
    setConnecting(true);
    setError(null);
    try {
      const response = await functions.httpsCallable("connectStripeAccount")({
        houseId: house.id,
      });
      await Linking.openURL(response.data.url);
    } catch (err: any) {
      setError(friendlyError(err.message ?? ""));
    } finally {
      setConnecting(false);
    }
  }, [house?.id]);

  const handleDisconnect = useCallback(async () => {
    if (!house) return;
    setConnecting(true);
    setError(null);
    try {
      await functions.httpsCallable("disconnectStripeAccount")({
        houseId: house.id,
      });
      setStatus(StripeAccountStatus.DISCONNECTED);
      setChargesEnabled(false);
      setPayoutsEnabled(false);
    } catch (err: any) {
      setError(friendlyError(err.message ?? ""));
    } finally {
      setConnecting(false);
    }
  }, [house?.id]);

  const confirmDisconnect = useCallback(() => {
    Alert.alert(
      "Disconnect Stripe Account?",
      "Residents will no longer be able to pay rent through the app. You can reconnect at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: handleDisconnect,
        },
      ],
    );
  }, [handleDisconnect]);

  const isConnected =
    status === StripeAccountStatus.ACTIVE ||
    status === StripeAccountStatus.PENDING ||
    status === StripeAccountStatus.RESTRICTED;

  const connectButtonLabel =
    status === StripeAccountStatus.ACTIVE
      ? "Manage Stripe Account"
      : status === StripeAccountStatus.PENDING
        ? "Complete Stripe Setup"
        : status === StripeAccountStatus.RESTRICTED
          ? "Fix Stripe Account Issues"
          : "Connect Stripe Account";

  const cfg =
    STATUS_CONFIG[status] ?? STATUS_CONFIG[StripeAccountStatus.NOT_CONNECTED];

  // Deduplicate requirements (Stripe sometimes sends dob.day, dob.month, dob.year separately)
  const dedupedRequirements = Array.from(
    new Set(requirements.currentlyDue.map((r) => formatRequirement(r))),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader header="Payments" />

      {loading ? (
        <View style={styles.loadingContainer} testID="stripe-loading">
          <ActivityIndicator size="large" color={color.main} />
          <RatsText
            translate={false}
            text="Loading payment status…"
            style={styles.loadingText}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Error banner — shown prominently at the top when present */}
          {error ? (
            <View style={styles.errorBanner} testID="stripe-error-banner">
              <RatsIcon
                name="exclamation-circle"
                solid
                size={normalize(16)}
                style={styles.errorBannerIcon}
              />
              <RatsText
                translate={false}
                text={error}
                style={styles.errorBannerText}
                testID="stripe-error-text"
              />
            </View>
          ) : null}

          {isConnected ? (
            <View style={[CARD_STYLE, styles.statusCard]}>
              {/* Status row */}
              <View style={[styles.row, styles.statusRow]}>
                <RatsIcon
                  name={cfg.icon}
                  solid
                  size={normalize(22)}
                  style={{ color: cfg.color, marginRight: normalize(8) }}
                />
                <RatsText
                  translate={false}
                  text={cfg.label}
                  style={[styles.statusLabel, { color: cfg.color }]}
                  testID="stripe-status-label"
                />
              </View>

              {/* Status description */}
              <RatsText
                translate={false}
                text={cfg.description}
                style={styles.statusDescription}
                testID="stripe-status-description"
              />

              {/* Capability rows */}
              <View style={styles.capabilityRow}>
                <RatsIcon
                  name={chargesEnabled ? "check-circle" : "times-circle"}
                  solid
                  size={normalize(16)}
                  style={{
                    color: chargesEnabled ? color.green : color.grey,
                    marginRight: normalize(8),
                  }}
                />
                <RatsText
                  translate={false}
                  text={
                    chargesEnabled
                      ? "Accepting payments"
                      : "Payments not yet enabled"
                  }
                  style={{
                    fontSize: fontSize.regular,
                    color: chargesEnabled ? color.dark_grey : color.grey,
                  }}
                  testID="stripe-charges-status"
                />
              </View>

              <View style={styles.capabilityRow}>
                <RatsIcon
                  name={payoutsEnabled ? "check-circle" : "times-circle"}
                  solid
                  size={normalize(16)}
                  style={{
                    color: payoutsEnabled ? color.green : color.grey,
                    marginRight: normalize(8),
                  }}
                />
                <RatsText
                  translate={false}
                  text={
                    payoutsEnabled
                      ? "Payouts to bank enabled"
                      : "Payouts not yet enabled"
                  }
                  style={{
                    fontSize: fontSize.regular,
                    color: payoutsEnabled ? color.dark_grey : color.grey,
                  }}
                  testID="stripe-payouts-status"
                />
              </View>

              {/* Required actions */}
              {dedupedRequirements.length > 0 && (
                <View
                  style={styles.requirementsContainer}
                  testID="stripe-requirements"
                >
                  <View style={styles.row}>
                    <RatsIcon
                      name="exclamation-triangle"
                      solid
                      size={normalize(14)}
                      style={{ color: color.red, marginRight: normalize(6) }}
                    />
                    <RatsText
                      translate={false}
                      text="Complete these steps to activate payouts:"
                      style={styles.requirementsHeader}
                    />
                  </View>
                  {dedupedRequirements.map((label) => (
                    <View key={label} style={styles.requirementItem}>
                      <RatsText
                        translate={false}
                        text={`• ${label}`}
                        style={styles.requirementText}
                      />
                    </View>
                  ))}
                  <RatsText
                    translate={false}
                    text='Tap "Complete Stripe Setup" below to finish in the Stripe portal.'
                    style={styles.requirementHint}
                  />
                </View>
              )}
            </View>
          ) : (
            /* Not connected — benefits / onboarding card */
            <View style={[CARD_STYLE, styles.statusCard]}>
              <RatsText
                translate={false}
                text="Accept Resident Payments"
                style={styles.benefitsTitle}
              />
              <RatsText
                translate={false}
                text="Connect a free Stripe account to collect rent digitally — no fees from us."
                style={styles.benefitsSubtitle}
              />
              {BENEFITS.map((b) => (
                <View key={b.icon} style={[styles.row, styles.benefitRow]}>
                  <RatsIcon
                    name={b.icon}
                    solid
                    size={normalize(16)}
                    style={styles.benefitIcon}
                  />
                  <RatsText
                    translate={false}
                    text={b.text}
                    style={styles.benefitText}
                  />
                </View>
              ))}
              <RatsText
                translate={false}
                text="Setup takes about 5 minutes."
                style={styles.setupTime}
              />
            </View>
          )}
        </ScrollView>
      )}

      {/* Bottom CTA area */}
      <SafeAreaView edges={["bottom"]} style={styles.ctaContainer}>
        {connecting ? (
          <View
            style={styles.connectingContainer}
            testID="stripe-connecting-loading"
          >
            <ActivityIndicator size="small" color={color.main} />
            <RatsText
              translate={false}
              text={isConnected ? "Opening Stripe…" : "Connecting to Stripe…"}
              style={styles.connectingText}
            />
          </View>
        ) : isConnected ? (
          <View>
            <RatsButton
              onPress={handleConnect}
              title={connectButtonLabel}
              containerStyle={styles.primaryCta}
              disabled={connecting}
              testID="stripe-primary-cta"
            />
            <RatsButton
              onPress={confirmDisconnect}
              title="Disconnect Stripe Account"
              containerStyle={styles.disconnectButton}
              disabled={connecting}
              testID="stripe-disconnect-button"
            />
          </View>
        ) : (
          <RatsButton
            onPress={handleConnect}
            title="Connect Stripe Account — Free"
            containerStyle={styles.primaryCta}
            disabled={connecting}
            testID="stripe-connect-button"
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    marginTop: normalize(10),
  },
  scrollContent: {
    padding: normalize(10),
    flexGrow: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: color.light_red,
    borderRadius: 6,
    padding: normalize(10),
    marginBottom: normalize(8),
  },
  errorBannerIcon: {
    color: color.red,
    marginRight: normalize(8),
    marginTop: normalize(2),
  },
  errorBannerText: {
    flex: 1,
    color: color.red,
    fontSize: fontSize.regular,
  },
  statusCard: {
    marginBottom: normalize(8),
    borderRadius: 8,
  },
  row: {
    flexDirection: "row",
  },
  statusRow: {
    alignItems: "center",
    marginBottom: normalize(4),
  },
  statusLabel: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
  },
  statusDescription: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    marginBottom: normalize(12),
    marginTop: normalize(4),
  },
  capabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: normalize(6),
  },
  requirementsContainer: {
    marginTop: normalize(12),
    padding: normalize(10),
    backgroundColor: color.light_red,
    borderRadius: 6,
  },
  requirementsHeader: {
    flex: 1,
    fontSize: fontSize.small,
    color: color.red,
    fontFamily: fontFamily.bold,
  },
  requirementItem: {
    marginTop: normalize(4),
    paddingLeft: normalize(4),
  },
  requirementText: {
    fontSize: fontSize.small,
    color: color.red,
  },
  requirementHint: {
    fontSize: fontSize.extraSmall,
    color: color.red,
    marginTop: normalize(8),
    fontFamily: fontFamily.light,
  },
  benefitsTitle: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.black,
    marginBottom: normalize(4),
  },
  benefitsSubtitle: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    marginBottom: normalize(14),
  },
  benefitRow: {
    alignItems: "center",
    marginBottom: normalize(10),
  },
  benefitIcon: {
    color: color.main,
    marginRight: normalize(10),
    width: normalize(20),
  },
  benefitText: {
    flex: 1,
    fontSize: fontSize.regular,
    color: color.dark_grey,
  },
  setupTime: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(8),
  },
  ctaContainer: {
    padding: normalize(10),
    backgroundColor: color.white,
  },
  connectingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: normalize(50),
  },
  connectingText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    marginLeft: normalize(10),
  },
  primaryCta: {
    ...SAVE_BUTTON,
    marginBottom: normalize(8),
  },
  disconnectButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.white,
    borderColor: color.red,
  },
});

export default StripeSettingsScreen;
