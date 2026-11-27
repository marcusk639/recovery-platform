import React from 'react';
import { StyleSheet, View } from 'react-native';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import RatsButton from '../../components/rats-button/rats-button';
import type { ApplicationsAccess } from '../../state/queries/houseTierQueries';
import { color } from '../../styles/theme';

export const APPLICATIONS_NO_ACCESS_MESSAGE =
  "Only the house's owner or a manager can review applications.";
export const APPLICATIONS_ACCESS_ERROR_MESSAGE =
  "Couldn't check whether you can review applications. Please try again.";

/**
 * What an application screen shows until the caller's house tier says they
 * may review applications (owners and managers, owner decision 2026-11-27):
 * a spinner while it loads, a retry when it could not be read, and a plain
 * refusal for a peer leader, whose reads the rules refuse.
 */
export default function ApplicationsAccessState({
  access,
  retry,
}: {
  access: Exclude<ApplicationsAccess, 'yes'>;
  retry: () => void;
}) {
  if (access === 'checking') {
    return <RatsLoadingIndicator />;
  }
  const failed = access === 'error';
  return (
    <View
      style={styles.screen}
      testID={failed ? 'applications-access-error' : 'applications-no-access'}
    >
      <ScreenHeader renderBackButton header="Applications" />
      <View style={styles.container}>
        <RatsText
          translate={false}
          text={failed ? APPLICATIONS_ACCESS_ERROR_MESSAGE : APPLICATIONS_NO_ACCESS_MESSAGE}
          style={styles.hint}
        />
        {failed && (
          <RatsButton title="TRY AGAIN" testID="applications-access-retry" onPress={retry} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.white },
  container: { padding: 16 },
  hint: { color: color.dark_grey },
});
