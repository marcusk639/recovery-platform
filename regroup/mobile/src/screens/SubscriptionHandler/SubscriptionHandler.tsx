import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { User } from "../../entities/User";
import { RatsText } from "../../components/rats-text";
import RatsButton from "../../components/rats-button/rats-button";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Routes } from "../../navigation/types";
import { color, fontSize, normalize, SAVE_BUTTON } from "../../styles/theme";
import { openWebBilling } from "../../services/webBilling";

interface Props
  extends NativeStackScreenProps<any, typeof Routes.SubscriptionHandler> {
  user: User;
}

/**
 * Subscription Handler Screen
 *
 * Plans are managed on the web, in the system browser (launch P5 Task 9,
 * design A6). This screen used to load /my-account in a WebView, which
 * App Store review treats as in-app payment; now it only links out. The web
 * page hands back through /checkout-return.
 */
const SubscriptionHandler: React.FC<Props> = ({ navigation }) => {
  const handleOpen = useCallback(() => {
    openWebBilling("my-account");
  }, []);

  return (
    <View style={styles.container} testID="subscription-link-out">
      <RatsText
        translate={false}
        text="Manage your plan on the web"
        style={styles.title}
      />
      <RatsText
        translate={false}
        text="Your plan and billing open in your browser. When you're done, return to Regroup."
        style={styles.description}
      />
      <RatsButton
        onPress={handleOpen}
        title="Open in browser"
        containerStyle={styles.openButton}
        testID="subscription-link-out-open"
      />
      <RatsButton
        onPress={() => navigation.goBack()}
        title="Go Back"
        light
        containerStyle={styles.goBackButton}
        testID="subscription-link-out-go-back"
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

export default SubscriptionHandler;
