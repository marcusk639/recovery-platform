import React from 'react';
import { StyleSheet, View } from 'react-native';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { color } from '../../styles/theme';

export const APPLICATIONS_NO_ACCESS_MESSAGE =
  "Only the house's owner or a manager can review applications.";

/**
 * What an application screen shows until the caller's house tier says they
 * may review applications (owners and managers, owner decision 2026-11-27):
 * a spinner while it loads, and a plain refusal for a peer leader, whose
 * reads the rules refuse.
 */
export default function ApplicationsAccessState({ access }: { access: 'no' | 'checking' }) {
  if (access === 'checking') {
    return <RatsLoadingIndicator />;
  }
  return (
    <View style={styles.screen} testID="applications-no-access">
      <ScreenHeader renderBackButton header="Applications" />
      <View style={styles.container}>
        <RatsText translate={false} text={APPLICATIONS_NO_ACCESS_MESSAGE} style={styles.hint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.white },
  container: { padding: 16 },
  hint: { color: color.dark_grey },
});
