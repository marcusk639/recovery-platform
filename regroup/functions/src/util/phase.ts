import { PhaseConfiguration, Curfew, Phases } from '../entities/Phase';
import { House } from '../entities/House';
import { getMilitaryTime } from './date';

export const basicPhase = (): PhaseConfiguration => ({
  name: 'Basic',
  order: 1,
  rules: {
    meetings: 4,
    curfew: new Curfew(),
    nightsOutAllowed: 2,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const contractPhase = (): PhaseConfiguration => ({
  name: 'Contract',
  order: 1,
  rules: {
    meetings: 7,
    curfew: new Curfew(undefined, getMilitaryTime(20, 0), getMilitaryTime(20, 0)),
    nightsOutAllowed: 0,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const noContractPhase = (): PhaseConfiguration => ({
  name: 'No Contract',
  order: 2,
  rules: {
    meetings: 4,
    curfew: new Curfew(undefined, getMilitaryTime(22, 0), getMilitaryTime(0, 0)),
    nightsOutAllowed: 2,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const entryPhase = (): PhaseConfiguration => ({
  name: 'Entry',
  order: 1,
  rules: {
    meetings: 7,
    curfew: new Curfew(undefined, getMilitaryTime(22, 0), getMilitaryTime(22, 0)),
    nightsOutAllowed: 0,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const normalPhase = (): PhaseConfiguration => ({
  name: 'Normal',
  order: 2,
  rules: {
    meetings: 4,
    curfew: new Curfew(undefined, getMilitaryTime(23, 0), getMilitaryTime(1, 0)),
    nightsOutAllowed: 1,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const seniorPhase = (): PhaseConfiguration => ({
  name: 'Senior',
  order: 3,
  rules: {
    meetings: 4,
    curfew: new Curfew(undefined, getMilitaryTime(0, 0), getMilitaryTime(2, 0)),
    nightsOutAllowed: 2,
    supporter: true,
    work: 20,
    chore: true,
    medications: true
  }
});

export const initializeBasicConfig = (): Partial<House> => {
  return { phases: { Basic: basicPhase() } };
};

export const initializeModerateConfig = (): Partial<House> => {
  return { phases: { Contract: contractPhase(), 'No Contract': noContractPhase() } };
};

export const initializeAdvancedConfig = (): Partial<House> => {
  return { phases: { Entry: entryPhase(), Normal: normalPhase(), Senior: seniorPhase() } };
};
