import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { color, fontSize, normalize, SAVE_BUTTON } from "../../styles/theme";
import { openWebBilling } from "../../services/webBilling";

interface Props {
  navigation: { goBack: () => void };
}

/**
 * Hosts the sign-up WebView was allowed to load (kept as a tested guard
 * for any future in-app page; the screen itself now links out). This screen only ever loads the
 * Regroup pricing/signup page; a hardcoded dev URL (rats-dev.web.app) used
 * to sit here unconditionally, meaning any release build accidentally
 * pointed at it would load an unvetted page with no restriction on what it
 * could send back via postMessage. Adding hosts here is a security-impacting
 * change — review with care.
 */
const SIGNUP_ORIGIN_ALLOWLIST = ["https://regroup-app.com"];

/**
 * Returns true when the URL parses successfully AND its origin is on the
 * allowlist. Any parse failure or unexpected host fails closed.
 */
export function isAllowedSignupUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return SIGNUP_ORIGIN_ALLOWLIST.includes(origin);
  } catch {
    return false;
  }
}

/**
 * Operator sign-up (role superAdmin). Choosing a plan and paying happen on
 * the web pricing page, in the system browser (launch P5 Task 9, design A6),
 * so no card details are entered in the app. This screen used to load
 * /pricing in a WebView and sign in with credentials the page posted back;
 * now the operator signs up on the web, then signs in here.
 */
const SignUpWebView: React.FC<Props> = ({ navigation }) => {
  const handleOpen = useCallback(() => {
    openWebBilling("pricing");
  }, []);

  return (
    <View style={styles.container} testID="signup-link-out">
      <RatsText
        translate={false}
        text="Choose your plan on the web"
        style={styles.title}
      />
      <RatsText
        translate={false}
        text="Operator accounts are created with a plan on regroup-app.com, in your browser. Then come back and sign in."
        style={styles.description}
      />
      <RatsButton
        onPress={handleOpen}
        title="See plans"
        containerStyle={styles.openButton}
        testID="signup-link-out-open"
      />
      <RatsButton
        onPress={() => navigation.goBack()}
        title="Go Back"
        light
        containerStyle={styles.goBackButton}
        testID="signup-link-out-go-back"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: normalize(24),
    backgroundColor: color.white,
  },
  title: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    textAlign: "center",
    marginBottom: normalize(8),
  },
  description: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: "center",
    marginBottom: normalize(24),
  },
  openButton: {
    ...SAVE_BUTTON,
    minWidth: normalize(200),
    marginBottom: normalize(12),
  },
  goBackButton: {
    ...SAVE_BUTTON,
    backgroundColor: color.white,
    borderColor: color.baby_blue,
    minWidth: normalize(200),
  },
});

export default SignUpWebView;
