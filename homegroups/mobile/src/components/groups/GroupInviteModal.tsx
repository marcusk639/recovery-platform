import React, {useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import functions from '@react-native-firebase/functions';
import auth from '@react-native-firebase/auth';
import Clipboard from '@react-native-clipboard/clipboard';

interface GroupInviteModalProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

const GroupInviteModal: React.FC<GroupInviteModalProps> = ({
  visible,
  onClose,
  groupId,
  groupName,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Reset state when modal visibility changes
  useEffect(() => {
    if (!visible) {
      setEmail('');
      setInviteCode(null);
      setInviteLink(null);
      setLoading(false);
      setGeneratingLink(false);
    }
  }, [visible]);

  // Function to call the Cloud Function for generating code/link
  const generateInvite = async () => {
    if (generatingLink) return; // Prevent multiple calls
    setGeneratingLink(true);
    setLoading(true);
    try {
      const generateGroupInvite = functions().httpsCallable(
        'generateGroupInvite',
      );
      const result = await generateGroupInvite({groupId});
      const {code, link} = result.data as {code: string; link: string};
      setInviteCode(code);
      setInviteLink(link);
    } catch (error: any) {
      console.error('Error generating invite link/code:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to generate invite details. Please try again.',
      );
      // Optionally close modal on error or allow retry?
    } finally {
      setLoading(false);
      setGeneratingLink(false);
    }
  };

  // Call generateInvite when the modal becomes visible and details aren't loaded yet
  useEffect(() => {
    if (visible && !inviteCode && !generatingLink) {
      generateInvite();
    }
  }, [visible, inviteCode, generatingLink]);

  // Send email invite via Cloud Function
  const sendEmailInvite = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address.');
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    if (!inviteCode) {
      Alert.alert('Error', 'Invite code not generated yet. Please wait.');
      return;
    }

    setLoading(true);
    try {
      // Call the Cloud Function to send the email
      const sendGroupInviteEmail = functions().httpsCallable(
        'sendGroupInviteEmail',
      );
      await sendGroupInviteEmail({
        groupId,
        inviteeEmail: email.trim(),
        inviteCode, // Pass the generated code
      });

      Alert.alert(
        'Invitation Sent',
        `An invitation email has been sent to ${email.trim()}.`,
      );
      setEmail(''); // Clear email field on success
    } catch (error: any) {
      console.error('Error sending email invite:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to send invitation. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Validate email format
  const validateEmail = (emailToValidate: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(emailToValidate);
  };

  // Share invite link using native share functionality
  const shareInvite = async () => {
    if (!inviteLink || !inviteCode) return;

    try {
      await Share.share({
        message: `Join our recovery group "${groupName}" on Homegroups.\n\nUse invite code: ${inviteCode}\nOr click the link: ${inviteLink}`,
        url: inviteLink, // Include URL for platforms that support it
        title: `Invite to ${groupName}`,
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
      // Alert.alert('Error', 'Failed to share invitation.'); // Optional: Alert user
    }
  };

  // Copy invite code to clipboard
  const copyInviteCode = () => {
    if (!inviteCode) return;
    Clipboard.setString(inviteCode);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  };

  // Copy invite link to clipboard
  const copyInviteLink = () => {
    if (!inviteLink) return;
    Clipboard.setString(inviteLink);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invite to {groupName}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Invite Code Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Share Invite Code</Text>
              {generatingLink || !inviteCode ? (
                <ActivityIndicator size="small" color="#2196F3" />
              ) : (
                <>
                  <View style={styles.inviteCodeContainer}>
                    <Text style={styles.inviteCode}>{inviteCode}</Text>
                    <TouchableOpacity
                      onPress={copyInviteCode}
                      style={styles.copyButton}>
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.helpText}>
                    Share this code with members of your recovery group.
                  </Text>
                </>
              )}
            </View>

            {/* Invite Link Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Share Invite Link</Text>
              {generatingLink || !inviteLink ? (
                <ActivityIndicator size="small" color="#2196F3" />
              ) : (
                <>
                  <View style={styles.inviteLinkContainer}>
                    <Text
                      style={styles.inviteLink}
                      numberOfLines={1}
                      ellipsizeMode="middle">
                      {inviteLink}
                    </Text>
                    <TouchableOpacity
                      onPress={copyInviteLink}
                      style={styles.copyButton}>
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={shareInvite}
                    style={styles.shareButton}
                    disabled={generatingLink}>
                    <Text style={styles.shareButtonText}>
                      Share Invite Link
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Email Invite Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Send Email Invitation</Text>
              <Text style={styles.helpText}>
                Enter the email address of the person you want to invite.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading && !!inviteCode} // Only editable when not loading and code exists
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (loading || !inviteCode) && styles.disabledButton,
                ]}
                onPress={sendEmailInvite}
                disabled={loading || !inviteCode}>
                {loading && !generatingLink ? ( // Show loading only for sending, not generating
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendButtonText}>Send Email</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.privacySection}>
              <Text style={styles.privacyText}>
                <Text style={styles.privacyTextBold}>Privacy Note:</Text> We
                respect anonymity. Invitations include your group name and a
                secure invite code/link.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '90%',
    maxWidth: 450,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    flexShrink: 1,
    marginRight: 10,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 22,
    color: '#757575',
    lineHeight: 22,
  },
  modalBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 5, // Less bottom padding as sections have margin
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 10,
  },
  inviteCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  inviteCode: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', // Monospaced font
  },
  inviteLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  inviteLink: {
    flex: 1,
    fontSize: 13,
    color: '#0D47A1', // Darker blue
  },
  copyButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    marginLeft: 10,
  },
  copyButtonText: {
    color: '#424242',
    fontWeight: '500',
    fontSize: 13,
  },
  shareButton: {
    backgroundColor: '#1E88E5', // Slightly lighter blue
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  helpText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333333',
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  sendButton: {
    backgroundColor: '#4CAF50', // Green for send action
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  disabledButton: {
    backgroundColor: '#BDBDBD',
    opacity: 0.7,
  },
  privacySection: {
    backgroundColor: '#FFF8E1', // Light yellow
    borderRadius: 8,
    padding: 14,
    marginTop: 10, // Add some margin top
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107', // Amber color
  },
  privacyText: {
    fontSize: 13,
    color: '#5D4037', // Brownish text
    lineHeight: 18,
  },
  privacyTextBold: {
    fontWeight: 'bold',
  },
});

export default GroupInviteModal;
