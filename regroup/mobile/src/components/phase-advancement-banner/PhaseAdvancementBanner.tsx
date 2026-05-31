/**
 * PhaseAdvancementBanner
 *
 * Displays when a guest is eligible for phase advancement.
 * Shows current phase, next phase, compliant weeks count,
 * and an "Advance" button that triggers admin approval.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { RatsText } from '../rats-text';
import { RatsIcon } from '../rats-icon';
import { color, normalize, fontSize, fontFamily } from '../../styles/theme';
import {
  useAdvancementEligibility,
  useAdvancePhase,
} from '../../state/queries/phaseAdvancementQueries';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';

interface Props {
  guest: Guest;
  house: House;
  isAdmin: boolean;
}

const PhaseAdvancementBanner: React.FC<Props> = ({ guest, house, isAdmin }) => {
  const { data: eligibility, isLoading } = useAdvancementEligibility(
    guest,
    house,
  );
  const { mutateAsync: advancePhase, isPending } = useAdvancePhase();

  if (isLoading || !eligibility || !eligibility.eligible) {
    return null;
  }

  const handleAdvance = () => {
    Alert.alert(
      'Advance Phase',
      `Advance ${eligibility.guestName} from "${eligibility.currentPhase}" to "${eligibility.nextPhase}"?\n\n${eligibility.compliantWeeks} consecutive weeks of compliance met.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          onPress: async () => {
            try {
              await advancePhase({
                guestId: eligibility.guestId,
                nextPhaseName: eligibility.nextPhase!,
              });
              Alert.alert(
                'Phase Advanced',
                `${eligibility.guestName} has been advanced to "${eligibility.nextPhase}".`,
              );
            } catch {
              Alert.alert(
                'Error',
                'Failed to advance phase. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container} testID="phase-advancement-banner">
      <View style={styles.iconContainer}>
        <RatsIcon name="arrow-circle-up" size={24} color={color.green} />
      </View>
      <View style={styles.textContainer}>
        <RatsText
          translate={false}
          text="Ready for Phase Advancement"
          style={styles.title}
        />
        <RatsText
          translate={false}
          text={`${eligibility.compliantWeeks} consecutive weeks compliant. Eligible to advance from "${eligibility.currentPhase}" to "${eligibility.nextPhase}".`}
          style={styles.subtitle}
        />
      </View>
      {isAdmin && (
        <TouchableOpacity
          testID="advance-phase-button"
          style={styles.button}
          onPress={handleAdvance}
          disabled={isPending}>
          <RatsText
            translate={false}
            text="Advance"
            style={styles.buttonText}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: normalize(8),
    padding: normalize(12),
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    borderLeftWidth: 4,
    borderLeftColor: color.green,
  },
  iconContainer: {
    marginRight: normalize(10),
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: '#2E7D32',
  },
  subtitle: {
    fontSize: fontSize.small,
    color: '#4CAF50',
    marginTop: normalize(2),
  },
  button: {
    backgroundColor: color.green,
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(8),
    borderRadius: normalize(6),
    marginLeft: normalize(8),
  },
  buttonText: {
    color: color.white,
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
  },
});

export default PhaseAdvancementBanner;
