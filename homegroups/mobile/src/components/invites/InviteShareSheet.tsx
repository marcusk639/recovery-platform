/**
 * InviteShareSheet
 *
 * Displays a group invite code with sharing options:
 *   - Copy code
 *   - Share (native share sheet)
 *   - SMS (pre-filled message)
 *
 * Tracks share analytics (shareCount, shareMethods) by updating the
 * groupInvites document when a share method is used.
 *
 * No QR code library is installed — the deep link URL is shown as text
 * with a copy button instead.
 */
import React, {useState, useEffect, useCallback} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import Clipboard from '@react-native-clipboard/clipboard';
import {theme} from '../../theme/theme';

const JOIN_BASE_URL = 'https://recovery-connect-cad4b.web.app/join';

type ShareMethod = 'share' | 'sms' | 'copy_code' | 'copy_link';

interface InviteShareSheetProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

const InviteShareSheet: React.FC<InviteShareSheetProps> = ({
  visible,
  onClose,
  groupId,
  groupName,
}) => {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteDocId, setInviteDocId] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ShareMethod | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setInviteCode(null);
      setInviteDocId(null);
      setDeepLink(null);
      setLoading(false);
      setActionLoading(null);
    }
  }, [visible]);

  // Generate (or fetch) the invite code on open
  useEffect(() => {
    if (visible && !inviteCode && !loading) {
      generateInvite();
    }
  }, [visible]);

  const generateInvite = async () => {
    setLoading(true);
    try {
      const generateGroupInvite = functions().httpsCallable(
        'generateGroupInvite',
      );
      const result = await generateGroupInvite({groupId});
      const {code, link} = result.data as {code: string; link: string};

      setInviteCode(code);
      // Build canonical deep link
      setDeepLink(`${JOIN_BASE_URL}/${code}`);

      // Find the invite doc ID so we can update analytics
      const snap = await firestore()
        .collection('groupInvites')
        .where('code', '==', code)
        .limit(1)
        .get();
      if (!snap.empty) {
        setInviteDocId(snap.docs[0].id);
      }
    } catch (error: any) {
      console.error('Error generating invite:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to generate invite. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const trackShare = useCallback(
    async (method: ShareMethod) => {
      if (!inviteDocId) return;
      try {
        await firestore()
          .collection('groupInvites')
          .doc(inviteDocId)
          .update({
            shareCount: firestore.FieldValue.increment(1),
            [`shareMethods.${method}`]: firestore.FieldValue.increment(1),
          });
      } catch (err) {
        // Analytics failure should not interrupt UX
        console.warn('Failed to track share analytics:', err);
      }
    },
    [inviteDocId],
  );

  const shareMessage = inviteCode
    ? `Join ${groupName} on Homegroups! Use code: ${inviteCode} or link: ${deepLink}`
    : '';

  const handleShare = async () => {
    if (!inviteCode) return;
    setActionLoading('share');
    try {
      await Share.share({
        message: shareMessage,
        url: deepLink || undefined,
        title: `Join ${groupName} on Homegroups`,
      });
      await trackShare('share');
    } catch (error) {
      // User may cancel — don't show error
    } finally {
      setActionLoading(null);
    }
  };

  const handleSMS = async () => {
    if (!inviteCode) return;
    setActionLoading('sms');
    try {
      const encodedMessage = encodeURIComponent(shareMessage);
      const smsUrl =
        Platform.OS === 'ios'
          ? `sms:?body=${encodedMessage}`
          : `sms:?body=${encodedMessage}`;
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
        await trackShare('sms');
      } else {
        Alert.alert('Not Available', 'SMS is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open SMS.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    setActionLoading('copy_code');
    Clipboard.setString(inviteCode);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
    await trackShare('copy_code');
    setActionLoading(null);
  };

  const handleCopyLink = async () => {
    if (!deepLink) return;
    setActionLoading('copy_link');
    Clipboard.setString(deepLink);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
    await trackShare('copy_link');
    setActionLoading(null);
  };

  const isAnyActionLoading = actionLoading !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Invite to {groupName}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}>
            {loading || !inviteCode ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary.main}
                />
                <Text style={styles.loadingText}>Generating invite...</Text>
              </View>
            ) : (
              <>
                {/* Invite Code Display */}
                <View style={styles.codeSection}>
                  <Text style={styles.codeLabel}>Invite Code</Text>
                  <View style={styles.codeRow}>
                    <Text style={styles.codeText} testID="invite-code-display">
                      {inviteCode}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.copyCodeButton,
                        isAnyActionLoading && styles.buttonDisabled,
                      ]}
                      onPress={handleCopyCode}
                      disabled={isAnyActionLoading}
                      testID="copy-invite-code-button">
                      {actionLoading === 'copy_code' ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary.main}
                        />
                      ) : (
                        <Text style={styles.copyCodeButtonText}>Copy Code</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Deep Link Display */}
                <View style={styles.linkSection}>
                  <Text style={styles.codeLabel}>Invite Link</Text>
                  <View style={styles.linkRow}>
                    <Text
                      style={styles.linkText}
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      testID="invite-link-display">
                      {deepLink}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.copyCodeButton,
                        isAnyActionLoading && styles.buttonDisabled,
                      ]}
                      onPress={handleCopyLink}
                      disabled={isAnyActionLoading}
                      testID="copy-invite-link-button">
                      {actionLoading === 'copy_link' ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary.main}
                        />
                      ) : (
                        <Text style={styles.copyCodeButtonText}>Copy</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Share Actions */}
                <View style={styles.actionsSection}>
                  <Text style={styles.actionsLabel}>Share via</Text>

                  {/* Share Button */}
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.shareButton,
                      isAnyActionLoading && styles.buttonDisabled,
                    ]}
                    onPress={handleShare}
                    disabled={isAnyActionLoading}
                    testID="invite-share-button">
                    {actionLoading === 'share' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.actionButtonIcon}>↗</Text>
                        <Text style={styles.actionButtonText}>Share</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* SMS Button */}
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.smsButton,
                      isAnyActionLoading && styles.buttonDisabled,
                    ]}
                    onPress={handleSMS}
                    disabled={isAnyActionLoading}
                    testID="invite-sms-button">
                    {actionLoading === 'sms' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.actionButtonIcon}>✉</Text>
                        <Text style={styles.actionButtonText}>SMS</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.privacyNote}>
                  Invite codes expire after 7 days.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.neutral.white,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    maxHeight: '85%',
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral.grey200,
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.neutral.grey900,
    flexShrink: 1,
    marginRight: theme.spacing.sm,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  closeText: {
    fontSize: 20,
    color: theme.colors.neutral.grey600,
    lineHeight: 22,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: theme.spacing.md,
  },
  loadingContainer: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.neutral.grey500,
  },
  codeSection: {
    marginBottom: theme.spacing.md,
  },
  linkSection: {
    marginBottom: theme.spacing.lg,
  },
  codeLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.neutral.grey700,
    marginBottom: theme.spacing.xs,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.neutral.grey100,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  codeText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.neutral.grey900,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.neutral.grey100,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  linkText: {
    flex: 1,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary.dark,
  },
  copyCodeButton: {
    backgroundColor: theme.colors.neutral.grey200,
    borderRadius: theme.borderRadius.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  copyCodeButtonText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.neutral.grey800,
  },
  actionsSection: {
    marginBottom: theme.spacing.md,
  },
  actionsLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.neutral.grey700,
    marginBottom: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    marginBottom: theme.spacing.sm,
    minHeight: 48,
    gap: theme.spacing.sm,
  },
  shareButton: {
    backgroundColor: theme.colors.primary.main,
  },
  smsButton: {
    backgroundColor: theme.colors.secondary.main,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  actionButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actionButtonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  privacyNote: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.neutral.grey500,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});

export default InviteShareSheet;
