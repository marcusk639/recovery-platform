import { addCellToTally, providersSafeToPrune, type SweepTally } from './sweepHealth';

const TOTAL_CELLS = 1000;

function tally(over: Partial<SweepTally> = {}): SweepTally {
  return {
    AA: { attempted: TOTAL_CELLS, failed: 0, records: 500 },
    CelebrateRecovery: { attempted: TOTAL_CELLS, failed: 0, records: 50 },
    ...over,
  };
}

describe('addCellToTally', () => {
  it('counts attempts, failures and records per source', () => {
    const result = addCellToTally({}, [
      { source: 'AA', ok: false, records: 0 },
      { source: 'CelebrateRecovery', ok: true, records: 3 },
    ]);

    expect(result).toEqual({
      AA: { attempted: 1, failed: 1, records: 0 },
      CelebrateRecovery: { attempted: 1, failed: 0, records: 3 },
    });
  });

  it('accumulates onto an existing tally without mutating it', () => {
    const start: SweepTally = { AA: { attempted: 2, failed: 1, records: 7 } };

    const result = addCellToTally(start, [{ source: 'AA', ok: true, records: 3 }]);

    expect(result.AA).toEqual({ attempted: 3, failed: 1, records: 10 });
    expect(start.AA).toEqual({ attempted: 2, failed: 1, records: 7 });
  });
});

describe('providersSafeToPrune', () => {
  it('returns each provider whose source completed a healthy full sweep', () => {
    expect(providersSafeToPrune(tally(), TOTAL_CELLS).sort()).toEqual(['AA', 'CELEBRATE_RECOVERY']);
  });

  it('excludes a source that failed on every cell (Meeting Guide returning 401)', () => {
    const failing = tally({ AA: { attempted: TOTAL_CELLS, failed: TOTAL_CELLS, records: 0 } });

    expect(providersSafeToPrune(failing, TOTAL_CELLS)).toEqual(['CELEBRATE_RECOVERY']);
  });

  it('excludes a source with even one failed cell, because rows there went unseen', () => {
    const clean = tally({ AA: { attempted: TOTAL_CELLS, failed: 0, records: 500 } });
    const oneFailed = tally({ AA: { attempted: TOTAL_CELLS, failed: 1, records: 500 } });

    expect(providersSafeToPrune(clean, TOTAL_CELLS)).toContain('AA');
    expect(providersSafeToPrune(oneFailed, TOTAL_CELLS)).not.toContain('AA');
  });

  it('excludes a source that did not observe the whole grid (cycle resumed mid-grid)', () => {
    const partial = tally({ AA: { attempted: TOTAL_CELLS - 1, failed: 0, records: 500 } });

    expect(providersSafeToPrune(partial, TOTAL_CELLS)).not.toContain('AA');
  });

  it('excludes a source that "succeeded" but returned nothing across the whole grid', () => {
    const empty = tally({ AA: { attempted: TOTAL_CELLS, failed: 0, records: 0 } });

    expect(providersSafeToPrune(empty, TOTAL_CELLS)).not.toContain('AA');
  });

  it('returns nothing for an empty tally', () => {
    expect(providersSafeToPrune({}, TOTAL_CELLS)).toEqual([]);
  });

  it('never returns a provider with no live source, such as NA', () => {
    expect(providersSafeToPrune(tally(), TOTAL_CELLS)).not.toContain('NA');
    expect(providersSafeToPrune(tally(), TOTAL_CELLS)).not.toContain('CUSTOM');
  });
});
