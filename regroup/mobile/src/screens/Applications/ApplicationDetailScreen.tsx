import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import {
  useHouseApplications,
  useUpdateApplicationStatus,
} from '../../state/queries/applicationQueries';
import { Routes } from '../../navigation/types';

export default function ApplicationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, appId } = route.params ?? {};

  const [note, setNote] = useState('');
  const { data: apps, isLoading } = useHouseApplications(houseId);
  const app = apps?.find(a => a.id === appId);
  const updateMutation = useUpdateApplicationStatus(houseId);

  const handleApprove = () => {
    Alert.alert(
      'Approve Application',
      'This will approve the applicant. You will be taken to the intake form to complete their move-in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await updateMutation.mutateAsync({
                appId,
                status: 'approved',
                note,
              });
              navigation.navigate(Routes.ResidentIntake, {
                houseId,
                applicationId: appId,
              });
            } catch {
              Alert.alert(
                'Error',
                'Could not approve application. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Application',
      'This cannot be undone. The applicant will see "Not Selected" in the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateMutation.mutateAsync({
                appId,
                status: 'rejected',
                note,
              });
              navigation.goBack();
            } catch {
              Alert.alert(
                'Error',
                'Could not reject application. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleMarkReviewing = async () => {
    try {
      await updateMutation.mutateAsync({ appId, status: 'reviewing' });
    } catch {
      Alert.alert('Error', 'Could not update status. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.blue} />
      </View>
    );
  }

  if (!app) {
    return (
      <View style={styles.center}>
        <Text style={{ color: color.grey }}>Application not found.</Text>
      </View>
    );
  }

  const isDone = app.status === 'approved' || app.status === 'rejected';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{app.applicantName}</Text>
      <Text style={styles.meta}>{app.applicantEmail}</Text>
      {app.applicantPhone ? (
        <Text style={styles.meta}>{app.applicantPhone}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SOBRIETY</Text>
        <Text style={styles.field}>Date: {app.sobrietyDate || '—'}</Text>
        <Text style={styles.field}>Program: {app.programType}</Text>
      </View>

      {app.currentSituation ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CURRENT SITUATION</Text>
          <Text style={styles.field}>{app.currentSituation}</Text>
        </View>
      ) : null}

      {app.references ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REFERENCES</Text>
          <Text style={styles.field}>{app.references}</Text>
        </View>
      ) : null}

      {!isDone ? (
        <>
          <Text style={styles.noteLabel}>Note to applicant (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Leave a message visible to the applicant on decision..."
            multiline
            numberOfLines={3}
          />

          <View style={styles.actions}>
            {app.status === 'pending' ? (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={handleMarkReviewing}
                disabled={updateMutation.isPending}>
                <Text style={styles.reviewBtnText}>Mark as Reviewing</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={handleReject}
              disabled={updateMutation.isPending}
              testID="btn-reject">
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.approveBtn}
              onPress={handleApprove}
              disabled={updateMutation.isPending}
              testID="btn-approve">
              {updateMutation.isPending ? (
                <ActivityIndicator color={color.white} size="small" />
              ) : (
                <Text style={styles.approveBtnText}>
                  Approve &amp; Begin Intake
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.decisionBox}>
          <Text style={styles.decisionLabel}>
            {app.status === 'approved' ? 'Approved' : 'Rejected'}
          </Text>
          {app.operatorNote ? (
            <Text style={styles.decisionNote}>
              Note sent: {app.operatorNote}
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: color.white },
  content: { padding: 24, paddingBottom: 48 },
  name: { fontSize: 22, fontWeight: '700', color: color.black },
  meta: { fontSize: 14, color: color.grey, marginTop: 2 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: color.grey,
    letterSpacing: 1,
    marginBottom: 4,
  },
  field: { fontSize: 15, color: color.black, lineHeight: 22 },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: color.black,
    marginTop: 24,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: color.black,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  actions: { marginTop: 24, gap: 10 },
  reviewBtn: {
    borderWidth: 1,
    borderColor: color.blue,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  reviewBtnText: { color: color.blue, fontWeight: '600', fontSize: 15 },
  rejectBtn: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  rejectBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
  approveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  approveBtnText: { color: color.white, fontWeight: '700', fontSize: 15 },
  decisionBox: {
    marginTop: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
  },
  decisionLabel: { fontSize: 16, fontWeight: '700', color: color.black },
  decisionNote: { fontSize: 14, color: color.grey, marginTop: 4 },
});
