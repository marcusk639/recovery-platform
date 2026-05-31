/**
 * Security test: verifies that google/apikeys.ts does NOT export any hardcoded
 * API key strings. All values must come from process.env at build time.
 *
 * These tests guard against accidental re-introduction of credentials in source.
 */

// Known-bad hardcoded key that must never appear in the export
const KNOWN_HARDCODED_KEY = 'AIzaSyCKXu_eJrW6QBamTNPyCOQy_lVO2xhwl9Q';

// General Google API key pattern (AIza followed by 35 alphanumeric/special chars)
const GOOGLE_KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/;

// Resolve the path to the google/apikeys module relative to the project root.
// Jest runs from the project root so __dirname for this file is:
//   <root>/src/services/__tests__
// and the target is <root>/google/apikeys.ts — three levels up.
const APIKEYS_MODULE_PATH = '../../../google/apikeys';

describe('google/apikeys security', () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    jest.resetModules();
    // Restore the original env state
    if (originalKey !== undefined) {
      process.env.GOOGLE_MAPS_API_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_MAPS_API_KEY;
    }
  });

  it('does not export a hardcoded key string when env var is set', () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-placeholder-key';
    const { GOOGLE_API_KEY } = require(APIKEYS_MODULE_PATH);
    const value = GOOGLE_API_KEY();

    // The returned value must equal the env var, not the old hardcoded literal
    expect(value).toBe('test-placeholder-key');
    expect(value).not.toBe(KNOWN_HARDCODED_KEY);
  });

  it('does not embed the known hardcoded key in the module source', () => {
    const fs = require('fs');
    const path = require('path');
    // Resolve from project root (jest rootDir) — go up three levels from this
    // test file's directory to reach <root>, then into google/apikeys.ts
    const modulePath = path.resolve(
      __dirname,
      '../../../google/apikeys.ts',
    );
    const source = fs.readFileSync(modulePath, 'utf8');

    expect(source).not.toContain(KNOWN_HARDCODED_KEY);
    // No raw Google API key pattern should exist as a literal in source
    expect(GOOGLE_KEY_PATTERN.test(source)).toBe(false);
  });

  it('returns empty string and warns when env var is missing', () => {
    delete process.env.GOOGLE_MAPS_API_KEY;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { GOOGLE_API_KEY } = require(APIKEYS_MODULE_PATH);
    const value = GOOGLE_API_KEY();

    expect(value).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GOOGLE_MAPS_API_KEY is not set'),
    );

    warnSpy.mockRestore();
  });

  it('GOOGLE_API_KEY export is a function, not a plain string literal', () => {
    const apikeys = require(APIKEYS_MODULE_PATH);

    expect(typeof apikeys.GOOGLE_API_KEY).toBe('function');
    // The module must not export any property whose value IS the raw key
    const exportedValues = Object.values(apikeys);
    exportedValues.forEach(val => {
      if (typeof val === 'string') {
        expect(val).not.toBe(KNOWN_HARDCODED_KEY);
        expect(GOOGLE_KEY_PATTERN.test(val)).toBe(false);
      }
    });
  });
});
