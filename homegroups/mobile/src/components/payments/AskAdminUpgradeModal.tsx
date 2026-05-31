/**
 * AskAdminUpgradeModal
 *
 * Shown to non-admin members when they tap a paywalled feature.
 * Lets them notify the group admin(s) that they want the feature unlocked.
 */
import React, {useState} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import {theme} from '../../theme/theme';

interface AskAdminUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  /** Name of the admin to display (pass first admin name when available) */
  adminName?: string;
  /** Feature the member tried to access, shown in the notification */
  featureName: string;
}

const AskAdminUpgradeModal: React.FC<AskAdminUpgradeModalProps> = ({
  visible,
  onClose,
  groupId,
  adminName,
  featureName,
}) => {
  const [loading, setLoading] = useState(false);

  const handleAskAdmin = async () => {
    setLoading(true);
    try {
      const notifyAdminUpgradeRequest = functions().httpsCallable(
        'notifyAdminUpgradeRequest',
      );
      await notifyAdminUpgradeRequest({groupId, featureName});
      Alert.alert(
        'Request Sent',
        adminName
          ? `${adminName} has been notified about your request.`
          : 'Your group admin has been notified about your request.',
      );
      onClose();
    } catch (error: any) {
      const message: string =
        error?.message || 'Failed to send request. Please try again.';
      // Surface rate-limit error clearly
      if (message.includes('24 hours') || error?.code === 'resource-exhausted') {
        Alert.alert(
          'Already Requested',
          'You already asked your admin to upgrade in the last 24 hours. Please give them some time to respond.',
        );
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>★</Text>
          </View>

          <Text style={styles.title}>Premium Feature</Text>
          <Text style={styles.body}>
            <Text style={styles.featureName}>{featureName}</Text>
            {' is available with a premium subscription. Ask '}
            {adminName ? (
              <Text style={styles.adminName}>{adminName}</Text>
            ) : (
              'your admin'
            )}
            {' to upgrade your group.'}
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleAskAdmin}
            disabled={loading}
            testID="ask-admin-upgrade-button">
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.neutral.white} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {adminName
                  ? `Ask ${adminName} to Upgrade`
                  : 'Ask Admin to Upgrade'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            disabled={loading}
            testID="ask-admin-upgrade-cancel-button">
            <Text style={styles.cancelButtonText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.neutral.white,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconText: {
    fontSize: 28,
    color: '#FFA000',
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey600,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.sm,
    marginBottom: theme.spacing.lg,
  },
  featureName: {
    fontWeight: '600',
    color: theme.colors.neutral.grey800,
  },
  adminName: {
    fontWeight: '600',
    color: theme.colors.primary.main,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary.main,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.neutral.grey400,
  },
  primaryButtonText: {
    color: theme.colors.neutral.white,
    fontWeight: '600',
    fontSize: theme.typography.fontSize.md,
  },
  cancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.neutral.grey600,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '500',
  },
});

export default AskAdminUpgradeModal;
