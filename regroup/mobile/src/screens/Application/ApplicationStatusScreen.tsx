import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import {
  useApplication,
  useMyApplications,
} from '../../state/queries/applicationQueries';
import { ApplicationStatus } from '../../entities/Application';
import { Routes } from '../../navigation/types';

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Pending Review',
  reviewing: 'Under Review',
  approved: 'Approved!',
  rejected: 'Not Selected',
};

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  pending: '#F59E0B',
  reviewing: '#3B82F6',
  approved: '#10B981',
  rejected: '#EF4444',
};

export default function ApplicationStatusScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, houseName, applicationId } = route.params ?? {};

  // Read the application by its path when we have its id (ApplyScreen and the
  // landing screen's "Check my application" pass it). Without one, find it in
  // the list of my own applications (a collection-group read the rules allow
  // only for the caller's applicantUid).
  const byId = useApplication(houseId ?? '', applicationId ?? '');
  const mine = useMyApplications(!applicationId);
  const thisApp = applicationId
    ? byId.data ?? undefined
    : mine.data?.find(a => a.houseId === houseId);
  const isLoading = applicationId ? byId.isLoading : mine.isLoading;
  const loadFailed = applicationId ? byId.isError : mine.isError;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.blue} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="application-status-screen">
      <Text style={styles.title}>
        {thisApp ? 'Your Application' : 'Application Submitted'}
      </Text>
      {houseName ? <Text style={styles.subtitle}>{houseName}</Text> : null}

      {thisApp ? (
        <>
          <View
            testID="application-status-badge"
            style={[
              styles.badge,
              { backgroundColor: STATUS_COLOR[thisApp.status] },
            ]}>
            <Text style={styles.badgeText}>{STATUS_LABEL[thisApp.status]}</Text>
          </View>

          {(thisApp.status === 'approved' || thisApp.status === 'rejected') &&
          thisApp.operatorNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>Message from house manager:</Text>
              <Text style={styles.noteText}>{thisApp.operatorNote}</Text>
            </View>
          ) : null}

          {thisApp.status === 'approved' && (
            <Text style={styles.hint}>
              The house manager will contact you to complete your move-in.
            </Text>
          )}
        </>
      ) : loadFailed ? (
        <Text style={styles.body}>
          Couldn't load your application's status. Try again later.
        </Text>
      ) : (
        <Text style={styles.body}>
          Your application has been received. The house manager will review it
          shortly.
        </Text>
      )}

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() =>
          navigation.navigate(Routes.PriorAuth, { screen: Routes.HouseSearch })
        }>
        <Text style={styles.secondaryBtnText}>Apply to Another House</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: color.white, padding: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: color.black,
    marginBottom: 4,
  },
  subtitle: { fontSize: 15, color: color.grey, marginBottom: 24 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 20,
  },
  badgeText: { color: color.white, fontWeight: '700', fontSize: 14 },
  noteBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  noteLabel: { fontSize: 12, color: color.grey, marginBottom: 4 },
  noteText: { fontSize: 15, color: color.black },
  hint: { fontSize: 14, color: '#10B981', marginBottom: 24 },
  body: { fontSize: 15, color: color.grey, lineHeight: 22, marginBottom: 32 },
  secondaryBtn: { marginTop: 24, padding: 14, alignItems: 'center' },
  secondaryBtnText: { color: color.blue, fontSize: 15 },
});
