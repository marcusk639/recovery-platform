import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';
import { logout } from '../../state/slices/userSlice';
import { useAppDispatch } from '../../state/store';
import { color, fontSize, normalize } from '../../styles/theme';

interface SetupBlockingPanelProps {
  testID: string;
  title: string;
  body: string;
  /** Shown under the body, e.g. why the last attempt failed. */
  error?: string | null;
  primaryTitle: string;
  primaryTestID: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  secondaryTitle?: string;
  secondaryTestID?: string;
  onSecondary?: () => void;
}

/**
 * Full-screen state that replaces the OrgSetup wizard when the operator must
 * not (yet) enter houses: a message, one or two actions and Sign out.
 */
const SetupBlockingPanel: React.FC<SetupBlockingPanelProps> = (props) => {
  const dispatch = useAppDispatch();
  return (
    <View testID={props.testID} style={styles.container}>
      <RatsText translate={false} text={props.title} style={styles.title} />
      <RatsText translate={false} text={props.body} style={styles.body} />
      {props.error ? <RatsText translate={false} text={props.error} style={styles.error} /> : null}
      <RatsButton
        testID={props.primaryTestID}
        title={props.primaryTitle}
        onPress={props.onPrimary}
        disabled={props.primaryBusy}
        containerStyle={styles.button}
      />
      {props.secondaryTitle && props.onSecondary ? (
        <RatsButton
          testID={props.secondaryTestID}
          title={props.secondaryTitle}
          onPress={props.onSecondary}
          light
          containerStyle={styles.button}
        />
      ) : null}
      <TouchableOpacity testID="setup-panel-sign-out" onPress={() => dispatch(logout())}>
        <RatsText translate={false} text="Sign out" style={styles.signOut} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    paddingHorizontal: normalize(24),
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: '700' as const,
    textAlign: 'center',
    color: color.black,
    marginBottom: normalize(12),
  },
  body: {
    fontSize: fontSize.regular,
    textAlign: 'center',
    color: color.dark_grey,
    marginBottom: normalize(24),
    lineHeight: normalize(22),
  },
  error: {
    fontSize: fontSize.regular,
    textAlign: 'center',
    color: color.red,
    marginBottom: normalize(16),
  },
  button: { width: '100%', height: normalize(48), marginBottom: normalize(12) },
  signOut: {
    marginTop: normalize(12),
    fontSize: fontSize.regular,
    color: color.baby_blue,
    textDecorationLine: 'underline',
  },
});

export default SetupBlockingPanel;
