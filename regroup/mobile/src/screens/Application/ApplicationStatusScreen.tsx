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
import { useMyApplications } from '../../state/queries/applicationQueries';
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
  const { houseId, houseName } = route.params ?? {};

  const { data: applications, isLoading } = useMyApplications();
  const thisApp = applications?.find(a => a.houseId === houseId);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.blue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {thisApp ? 'Your Application' : 'Application Submitted'}
      </Text>
      {houseName ? <Text style={styles.subtitle}>{houseName}</Text> : null}

      {thisApp ? (
        <>
          <View
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
      ) : (
        <Text style={styles.body}>
          Your application has been received. The house manager will review it
          shortly.
        </Text>
      )}

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate(Routes.HouseSearch)}>
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
