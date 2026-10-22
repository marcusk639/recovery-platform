import * as fs from 'fs';
import * as path from 'path';
import { logger } from 'firebase-functions';
import {
  ALLOWED_RETURN_ORIGINS,
  allowedReturnOrigins,
  safeReturnUrlSchema,
} from '../../validation';

const PRODUCTION_ORIGINS = [
  'https://regroup-app.com',
  'https://phoenix-cleanhouse.web.app',
  'https://phoenix-cleanhouse.firebaseapp.com',
  'http://localhost:4200',
];

describe('allowedReturnOrigins', () => {
  const original = process.env.ALLOWED_RETURN_ORIGINS;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOWED_RETURN_ORIGINS;
    else process.env.ALLOWED_RETURN_ORIGINS = original;
  });

  it('falls back to the production origins when unset', () => {
    delete process.env.ALLOWED_RETURN_ORIGINS;
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
    expect(ALLOWED_RETURN_ORIGINS).toEqual(PRODUCTION_ORIGINS);
  });

  it('falls back to the production origins when empty or only separators', () => {
    process.env.ALLOWED_RETURN_ORIGINS = ' , ,';
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
    process.env.ALLOWED_RETURN_ORIGINS = '';
    expect(allowedReturnOrigins()).toEqual(PRODUCTION_ORIGINS);
  });

  it('returns exactly the configured origin', () => {
    process.env.ALLOWED_RETURN_ORIGINS = 'https://regroup-e2e.web.app';
    expect(allowedReturnOrigins()).toEqual(['https://regroup-e2e.web.app']);
  });

  it('trims entries and drops empties in a comma-joined list', () => {
    process.env.ALLOWED_RETURN_ORIGINS =
      'https://regroup-e2e.web.app, https://regroup-e2e.firebaseapp.com,,';
    expect(allowedReturnOrigins()).toEqual([
      'https://regroup-e2e.web.app',
      'https://regroup-e2e.firebaseapp.com',
    ]);
  });

  describe('safeReturnUrlSchema', () => {
    it('rejects evil origins with the default list', () => {
      delete process.env.ALLOWED_RETURN_ORIGINS;
      expect(safeReturnUrlSchema.safeParse('https://evil.example/x').success).toBe(false);
      expect(safeReturnUrlSchema.safeParse('https://regroup-app.com/x').success).toBe(true);
    });

    it('honours the configured list at parse time and still rejects evil', () => {
      process.env.ALLOWED_RETURN_ORIGINS = 'https://regroup-e2e.web.app';
      expect(safeReturnUrlSchema.safeParse('https://regroup-e2e.web.app/r').success).toBe(true);
      expect(safeReturnUrlSchema.safeParse('https://evil.example/x').success).toBe(false);
      expect(safeReturnUrlSchema.safeParse('https://regroup-app.com/x').success).toBe(false);
    });
  });

  describe('misconfiguration is visible in logs', () => {
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('logs entries that can never match, once per config, and keeps them verbatim', () => {
      const config =
        'https://ok-1.web.app,https://regroup-e2e.web.app/,regroup-e2e.web.app,ftp://files.example';
      process.env.ALLOWED_RETURN_ORIGINS = config;

      expect(allowedReturnOrigins()).toEqual(config.split(','));
      allowedReturnOrigins();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ALLOWED_RETURN_ORIGINS'), {
        invalid: ['https://regroup-e2e.web.app/', 'regroup-e2e.web.app', 'ftp://files.example'],
      });
      expect(safeReturnUrlSchema.safeParse('https://regroup-e2e.web.app/r').success).toBe(false);
    });

    it('does not log a well-formed list or the default', () => {
      process.env.ALLOWED_RETURN_ORIGINS = 'https://ok-2.web.app, http://localhost:5002';
      allowedReturnOrigins();
      delete process.env.ALLOWED_RETURN_ORIGINS;
      allowedReturnOrigins();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs only the origin of a rejected return URL', () => {
      delete process.env.ALLOWED_RETURN_ORIGINS;
      safeReturnUrlSchema.safeParse('https://evil.example/r?session=abc123');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not in the allowlist'), {
        origin: 'https://evil.example',
      });
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('abc123');
    });
  });

  it('subscriptions.ts uses the shared schema rather than its own list', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../callable/subscriptions.ts'), 'utf8');
    expect(src).not.toMatch(/ALLOWED_PORTAL_RETURN_ORIGINS/);
    expect(src).not.toMatch(/const safeReturnUrlSchema/);
    expect(src).toMatch(/safeReturnUrlSchema[\s\S]*from "\.\.\/validation"/);
  });
});
