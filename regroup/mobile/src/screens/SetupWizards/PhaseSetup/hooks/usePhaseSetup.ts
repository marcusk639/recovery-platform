/**
 * usePhaseSetup - Custom hook for phase setup management logic
 *
 * Phase 4.1: Extracted from PhaseConfigSetup.tsx
 * Contains phase CRUD operations, validation, and modal management
 */
import { useState, useCallback } from 'react';
import { cloneDeep, each, find, isEmpty, keys } from 'lodash';
import { PhaseConfiguration } from '../../../../entities/Phase';
import { filterPhases } from '../../../../util/house';
import { validatePhases } from '../../../../util/phase';
import { Guests } from '../../../../types';
import { House } from '../../../../entities/House';

interface UsePhaseSetupProps {
  selectedHouse: House;
  guests: Guests;
  updateHouse: (house: Partial<House>) => void;
  startPhaseSetup: (phase: PhaseConfiguration) => void;
  onNextPress: () => void;
  setPopover: (visible: boolean, heading: string, content: string) => void;
}

export const usePhaseSetup = ({
  selectedHouse,
  guests,
  updateHouse,
  startPhaseSetup,
  onNextPress,
  setPopover,
}: UsePhaseSetupProps) => {
  // State management
  const [showModal, setShowModal] = useState(false);
  const [phaseConfig, setPhaseConfig] = useState<PhaseConfiguration | null>(null);
  const [errors, setErrors] = useState<{ [phaseName: string]: string }>({});

  // Modal management
  const showModalHandler = useCallback((config: PhaseConfiguration) => {
    setShowModal(true);
    setPhaseConfig(config);
  }, []);

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  // Phase selection
  const setSelectedPhase = useCallback(
    (phase: PhaseConfiguration) => () => {
      startPhaseSetup(phase);
      showModalHandler(phase);
    },
    [startPhaseSetup, showModalHandler],
  );

  // Create new phase
  const createNewPhase = useCallback(() => {
    const phase = new PhaseConfiguration();
    const phases = filterPhases(selectedHouse.phases, Object.keys(guests));
    phase.order = keys(phases).length + 1;
    phase.name = 'Phase ' + phase.order;
    return phase;
  }, [selectedHouse, guests]);

  // Remove phase and reassign guests
  const removePhase = useCallback(
    (phase: PhaseConfiguration) => () => {
      const phases = cloneDeep(selectedHouse.phases);
      const guestsClone = cloneDeep(guests);

      // Adjust order for remaining phases
      each(phases, (_phase: PhaseConfiguration) => {
        if (_phase.order < phase.order) {
          return;
        }
        phases[_phase.name].order = _phase.order - 1;
      });

      // Reassign guests from deleted phase
      each(guestsClone, guest => {
        if (guest && guest.phase === phase.name) {
          let newPhase = find(phases, p => p.order === phase.order);
          if (newPhase) {
            guest.phase = newPhase.name;
          } else {
            guest.phase = Object.values(phases)[0].name;
          }
        }
      });

      delete phases[phase.name];
      updateHouse({ ...selectedHouse, phases });
    },
    [selectedHouse, guests, updateHouse],
  );

  // Add new phase
  const addPhase = useCallback(() => {
    const phase = createNewPhase();
    updateHouse({
      id: selectedHouse.id,
      phases: { ...selectedHouse.phases, [phase.name]: phase },
    });
    startPhaseSetup(phase);
    dismissModal();
  }, [createNewPhase, updateHouse, selectedHouse, startPhaseSetup, dismissModal]);

  // Validate and proceed to next step
  const onNext = useCallback(() => {
    const validationErrors = validatePhases(selectedHouse.phases);
    if (isEmpty(validationErrors)) {
      setErrors({});
      onNextPress();
    } else {
      setErrors(validationErrors);
    }
  }, [selectedHouse, onNextPress]);

  // Show help popover
  const renderHelp = useCallback(() => {
    setPopover(
      true,
      'PHASE SETUP',
      'Here you can make modifications to the rules for each phase in your house.',
    );
  }, [setPopover]);

  return {
    // State
    showModal,
    phaseConfig,
    errors,

    // Actions
    showModalHandler,
    dismissModal,
    setSelectedPhase,
    createNewPhase,
    removePhase,
    addPhase,
    onNext,
    renderHelp,
  };
};
