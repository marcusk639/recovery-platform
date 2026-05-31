// src/util/__tests__/phase.test.ts
// Unit tests for src/util/phase.ts

// Mock the Curfew class from Phase entity (it uses moment internally for defaultCurfew)
jest.mock('../../entities/Phase', () => {
  const mockCurfew = jest.fn().mockImplementation(function (
    this: any,
    _defaultTime?: string,
    weekday?: string,
    weekend?: string,
  ) {
    this.required = true;
    this.times = {
      sunday: weekday || '22:00',
      monday: weekday || '22:00',
      tuesday: weekday || '22:00',
      wednesday: weekday || '22:00',
      thursday: weekday || '22:00',
      friday: weekend || '22:00',
      saturday: weekend || '22:00',
    };
  });

  return {
    Curfew: mockCurfew,
    PhaseConfiguration: jest.fn(),
    defaultPhases: {},
    DEFAULT_PHASE: 'Default',
  };
});

// getMilitaryTime is used in phase.ts to set curfew times
jest.mock('../../util/display', () => ({
  getMilitaryTime: jest.fn((h: number, m: number) => {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${hh}:${mm}`;
  }),
}));

// sortPhases is used in validatePhases — return phases sorted by order
jest.mock('../../util/house', () => ({
  sortPhases: jest.fn((phases: any) =>
    Object.values(phases).sort((a: any, b: any) => a.order - b.order),
  ),
}));

import {
  basicPhase,
  contractPhase,
  noContractPhase,
  entryPhase,
  normalPhase,
  seniorPhase,
  initializeBasicConfig,
  initializeModerateConfig,
  initializeAdvancedConfig,
  validatePhases,
} from '../phase';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── basicPhase ──────────────────────────────────────────────────────────────

describe('basicPhase', () => {
  it('returns a phase named "Basic" with order 1', () => {
    const phase = basicPhase();
    expect(phase.name).toBe('Basic');
    expect(phase.order).toBe(1);
  });

  it('has meetings set to 4', () => {
    expect(basicPhase().rules.meetings).toBe(4);
  });

  it('allows 2 nights out', () => {
    expect(basicPhase().rules.nightsOutAllowed).toBe(2);
  });
});

// ─── contractPhase ───────────────────────────────────────────────────────────

describe('contractPhase', () => {
  it('returns a phase named "Contract" with order 1', () => {
    const phase = contractPhase();
    expect(phase.name).toBe('Contract');
    expect(phase.order).toBe(1);
  });

  it('has meetings set to 7', () => {
    expect(contractPhase().rules.meetings).toBe(7);
  });

  it('has 0 nights out allowed', () => {
    expect(contractPhase().rules.nightsOutAllowed).toBe(0);
  });
});

// ─── noContractPhase ─────────────────────────────────────────────────────────

describe('noContractPhase', () => {
  it('returns a phase named "No Contract" with order 2', () => {
    const phase = noContractPhase();
    expect(phase.name).toBe('No Contract');
    expect(phase.order).toBe(2);
  });

  it('has meetings set to 4', () => {
    expect(noContractPhase().rules.meetings).toBe(4);
  });
});

// ─── entryPhase ──────────────────────────────────────────────────────────────

describe('entryPhase', () => {
  it('returns a phase named "Entry" with order 1', () => {
    const phase = entryPhase();
    expect(phase.name).toBe('Entry');
    expect(phase.order).toBe(1);
  });

  it('requires 7 meetings', () => {
    expect(entryPhase().rules.meetings).toBe(7);
  });
});

// ─── normalPhase ─────────────────────────────────────────────────────────────

describe('normalPhase', () => {
  it('returns a phase named "Normal" with order 2', () => {
    const phase = normalPhase();
    expect(phase.name).toBe('Normal');
    expect(phase.order).toBe(2);
  });

  it('allows 1 night out', () => {
    expect(normalPhase().rules.nightsOutAllowed).toBe(1);
  });
});

// ─── seniorPhase ─────────────────────────────────────────────────────────────

describe('seniorPhase', () => {
  it('returns a phase named "Senior" with order 3', () => {
    const phase = seniorPhase();
    expect(phase.name).toBe('Senior');
    expect(phase.order).toBe(3);
  });

  it('allows 2 nights out', () => {
    expect(seniorPhase().rules.nightsOutAllowed).toBe(2);
  });
});

// ─── initializeBasicConfig ───────────────────────────────────────────────────

describe('initializeBasicConfig', () => {
  it('returns an object with a single "Basic" phase', () => {
    const config = initializeBasicConfig();
    expect(config.phases).toBeDefined();
    expect(config.phases!['Basic']).toBeDefined();
    expect(config.phases!['Basic'].name).toBe('Basic');
  });

  it('does not include Contract or other phases', () => {
    const config = initializeBasicConfig();
    expect(config.phases!['Contract']).toBeUndefined();
  });
});

// ─── initializeModerateConfig ────────────────────────────────────────────────

describe('initializeModerateConfig', () => {
  it('returns Contract and "No Contract" phases', () => {
    const config = initializeModerateConfig();
    expect(config.phases!['Contract']).toBeDefined();
    expect(config.phases!['No Contract']).toBeDefined();
  });

  it('Contract has order 1 and No Contract has order 2', () => {
    const config = initializeModerateConfig();
    expect(config.phases!['Contract'].order).toBe(1);
    expect(config.phases!['No Contract'].order).toBe(2);
  });
});

// ─── initializeAdvancedConfig ────────────────────────────────────────────────

describe('initializeAdvancedConfig', () => {
  it('returns Entry, Normal, and Senior phases', () => {
    const config = initializeAdvancedConfig();
    expect(config.phases!['Entry']).toBeDefined();
    expect(config.phases!['Normal']).toBeDefined();
    expect(config.phases!['Senior']).toBeDefined();
  });

  it('phases have sequential orders 1, 2, 3', () => {
    const config = initializeAdvancedConfig();
    expect(config.phases!['Entry'].order).toBe(1);
    expect(config.phases!['Normal'].order).toBe(2);
    expect(config.phases!['Senior'].order).toBe(3);
  });
});

// ─── validatePhases ──────────────────────────────────────────────────────────

describe('validatePhases', () => {
  it('returns no errors for sequential phases', () => {
    const phases: any = {
      Entry: { name: 'Entry', order: 1 },
      Normal: { name: 'Normal', order: 2 },
      Senior: { name: 'Senior', order: 3 },
    };
    const errors = validatePhases(phases);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns an error when a phase has a non-sequential order', () => {
    const phases: any = {
      Entry: { name: 'Entry', order: 1 },
      Normal: { name: 'Normal', order: 5 }, // wrong — should be 2
      Senior: { name: 'Senior', order: 3 },
    };
    const errors = validatePhases(phases);
    expect(errors['Normal']).toBeDefined();
    expect(errors['Normal']).toContain('sequential');
  });

  it('returns no errors for a single phase with order 1', () => {
    const phases: any = {
      Basic: { name: 'Basic', order: 1 },
    };
    const errors = validatePhases(phases);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns errors for multiple phases with wrong orders', () => {
    const phases: any = {
      Phase1: { name: 'Phase1', order: 2 },
      Phase2: { name: 'Phase2', order: 3 },
    };
    // After sorting by order: [Phase1(2), Phase2(3)]
    // index 0 expects order 1 — Phase1 has 2 → error
    // index 1 expects order 2 — Phase2 has 3 → error
    const errors = validatePhases(phases);
    expect(errors['Phase1']).toBeDefined();
    expect(errors['Phase2']).toBeDefined();
  });
});
