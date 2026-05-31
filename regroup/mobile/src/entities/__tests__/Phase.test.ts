// Phase.tsx uses moment internally for the default curfew time; moment is available
// without mocking since it is a pure JS dependency.

import {
  Curfew,
  PhaseRule,
  PhaseConfiguration,
  DEFAULT_PHASE,
  defaultPhases,
} from '../Phase';

// A curfew time string has the shape HH:mm (e.g. "22:00")
const HH_MM_REGEX = /^\d{2}:\d{2}$/;

describe('Curfew entity', () => {
  describe('constructor with no args', () => {
    it('does not throw', () => {
      expect(() => new Curfew()).not.toThrow();
    });

    it('defaults required to true', () => {
      const curfew = new Curfew();
      expect(curfew.required).toBe(true);
    });

    it('generates HH:mm strings for all seven days from the moment default', () => {
      const curfew = new Curfew();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      days.forEach(day => {
        expect(curfew.times[day]).toMatch(HH_MM_REGEX);
      });
    });
  });

  describe('constructor with defaultTime', () => {
    it('uses defaultTime for all days when no weekday/weekend specified', () => {
      const curfew = new Curfew('21:00');
      expect(curfew.times.monday).toBe('21:00');
      expect(curfew.times.tuesday).toBe('21:00');
      expect(curfew.times.wednesday).toBe('21:00');
      expect(curfew.times.thursday).toBe('21:00');
      expect(curfew.times.friday).toBe('21:00');
      expect(curfew.times.saturday).toBe('21:00');
      expect(curfew.times.sunday).toBe('21:00');
    });
  });

  describe('constructor with weekday and weekend overrides', () => {
    it('uses weekday for Mon–Thu and Sun', () => {
      const curfew = new Curfew(undefined, '23:00', '01:00');
      expect(curfew.times.monday).toBe('23:00');
      expect(curfew.times.tuesday).toBe('23:00');
      expect(curfew.times.wednesday).toBe('23:00');
      expect(curfew.times.thursday).toBe('23:00');
      expect(curfew.times.sunday).toBe('23:00');
    });

    it('uses weekend for Fri and Sat', () => {
      const curfew = new Curfew(undefined, '23:00', '01:00');
      expect(curfew.times.friday).toBe('01:00');
      expect(curfew.times.saturday).toBe('01:00');
    });

    it('weekday takes precedence over defaultTime', () => {
      const curfew = new Curfew('20:00', '23:00', '01:00');
      expect(curfew.times.monday).toBe('23:00');
    });

    it('weekend takes precedence over defaultTime', () => {
      const curfew = new Curfew('20:00', '23:00', '01:00');
      expect(curfew.times.friday).toBe('01:00');
    });
  });
});

describe('PhaseRule entity', () => {
  it('does not throw when instantiated', () => {
    expect(() => new PhaseRule()).not.toThrow();
  });

  it('defaults meetings to 0', () => {
    const rule = new PhaseRule();
    expect(rule.meetings).toBe(0);
  });

  it('defaults nightsOutAllowed to 0', () => {
    const rule = new PhaseRule();
    expect(rule.nightsOutAllowed).toBe(0);
  });

  it('defaults work to 0', () => {
    const rule = new PhaseRule();
    expect(rule.work).toBe(0);
  });

  it('defaults supporter to true', () => {
    const rule = new PhaseRule();
    expect(rule.supporter).toBe(true);
  });

  it('defaults chore to true', () => {
    const rule = new PhaseRule();
    expect(rule.chore).toBe(true);
  });

  it('defaults medications to false', () => {
    const rule = new PhaseRule();
    expect(rule.medications).toBe(false);
  });

  it('initialises curfew as a Curfew instance', () => {
    const rule = new PhaseRule();
    expect(rule.curfew).toBeInstanceOf(Curfew);
  });
});

describe('PhaseConfiguration entity', () => {
  it('does not throw when instantiated', () => {
    expect(() => new PhaseConfiguration()).not.toThrow();
  });

  it(`defaults name to "${DEFAULT_PHASE}"`, () => {
    const phase = new PhaseConfiguration();
    expect(phase.name).toBe(DEFAULT_PHASE);
  });

  it('defaults order to 1', () => {
    const phase = new PhaseConfiguration();
    expect(phase.order).toBe(1);
  });

  it('initialises rules as a PhaseRule instance', () => {
    const phase = new PhaseConfiguration();
    expect(phase.rules).toBeInstanceOf(PhaseRule);
  });

  it('allows name to be overridden', () => {
    const phase = new PhaseConfiguration();
    phase.name = 'Phase 2';
    expect(phase.name).toBe('Phase 2');
  });

  it('allows order to be overridden', () => {
    const phase = new PhaseConfiguration();
    phase.order = 3;
    expect(phase.order).toBe(3);
  });
});

describe('DEFAULT_PHASE constant', () => {
  it('equals "Default"', () => {
    expect(DEFAULT_PHASE).toBe('Default');
  });
});

describe('defaultPhases', () => {
  it('contains a key equal to DEFAULT_PHASE', () => {
    expect(defaultPhases).toHaveProperty(DEFAULT_PHASE);
  });

  it('the default phase entry is a PhaseConfiguration', () => {
    expect(defaultPhases[DEFAULT_PHASE]).toBeInstanceOf(PhaseConfiguration);
  });

  it('contains exactly one phase by default', () => {
    expect(Object.keys(defaultPhases)).toHaveLength(1);
  });
});
