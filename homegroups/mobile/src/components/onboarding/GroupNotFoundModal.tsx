import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width} = Dimensions.get('window');

export type NotFoundAction = 'create' | 'invite' | 'claim' | 'skip';

interface GroupNotFoundModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAction: (action: NotFoundAction) => void;
  mode: 'admin' | 'member';
}

interface ActionOption {
  id: NotFoundAction;
  title: string;
  description: string;
  icon: string;
  color: string;
  showFor: ('admin' | 'member')[];
}

const actionOptions: ActionOption[] = [
  {
    id: 'create',
    title: 'Create This Group',
    description: 'Set up your group from scratch with all the details',
    icon: 'plus-circle',
    color: '#4CAF50',
    showFor: ['admin', 'member'],
  },
  {
    id: 'invite',
    title: 'Invite the Admin',
    description: 'Send a link to someone who should manage this group',
    icon: 'share-variant',
    color: '#FF9800',
    showFor: ['member'],
  },
  {
    id: 'claim',
    title: "I'll Be the Admin",
    description: 'I want to manage and maintain this group myself',
    icon: 'account-key',
    color: '#2196F3',
    showFor: ['member'],
  },
  {
    id: 'skip',
    title: 'Skip for Now',
    description: 'Continue without joining a group',
    icon: 'skip-forward',
    color: '#9E9E9E',
    showFor: ['admin', 'member'],
  },
];

const GroupNotFoundModal: React.FC<GroupNotFoundModalProps> = ({
  visible,
  onClose,
  onSelectAction,
  mode,
}) => {
  const visibleOptions = actionOptions.filter(opt =>
    opt.showFor.includes(mode),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      testID="group-not-found-modal">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Icon name="help-circle-outline" size={36} color="#FF9800" />
            </View>
            <Text style={styles.title}>Can't find your group?</Text>
            <Text style={styles.subtitle}>
              No worries! Here are some options to get you started
            </Text>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {visibleOptions.map((option, index) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionButton,
                  index === visibleOptions.length - 1 &&
                    styles.optionButtonLast,
                ]}
                onPress={() => onSelectAction(option.id)}
                testID={`not-found-option-${option.id}`}>
                <View
                  style={[
                    styles.optionIcon,
                    {backgroundColor: option.color + '15'},
                  ]}>
                  <Icon name={option.icon} size={24} color={option.color} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color="#BDBDBD" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID="not-found-close-button">
            <Text style={styles.closeButtonText}>Go Back to Search</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 21,
  },
  optionsContainer: {
    paddingHorizontal: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  optionButtonLast: {
    marginBottom: 0,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 3,
  },
  optionDescription: {
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
  closeButton: {
    marginTop: 20,
    marginHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666666',
  },
});

export default GroupNotFoundModal;
