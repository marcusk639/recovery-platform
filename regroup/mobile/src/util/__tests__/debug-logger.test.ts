// Mock react-native-fs before importing the module under test
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('[]')),
  exists: jest.fn(() => Promise.resolve(false)),
  unlink: jest.fn(() => Promise.resolve()),
}));

// react-native Platform is available via jest preset
import RNFS from 'react-native-fs';
import { debugLogger, logInfo, logWarn, logError, logDebug } from '../debug-logger';

describe('DebugLogger - console output', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    debugLogger.clearLogs();
    jest.clearAllMocks();
    // Re-spy after clearAllMocks
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('info() calls console.log', () => {
    debugLogger.info('test info message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('info() log message contains "INFO" and the message text', () => {
    debugLogger.info('hello world');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('INFO');
    expect(callArg).toContain('hello world');
  });

  it('warn() calls console.warn', () => {
    debugLogger.warn('test warning');
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('warn() log message contains "WARN" and the message text', () => {
    debugLogger.warn('beware of this');
    const callArg = consoleWarnSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('WARN');
    expect(callArg).toContain('beware of this');
  });

  it('error() calls console.error', () => {
    debugLogger.error('test error');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('error() log message contains "ERROR" and the message text', () => {
    debugLogger.error('something went wrong');
    const callArg = consoleErrorSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('ERROR');
    expect(callArg).toContain('something went wrong');
  });

  it('debug() calls console.log', () => {
    debugLogger.debug('debug info');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('debug() log message contains "DEBUG" and the message text', () => {
    debugLogger.debug('debug details');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('DEBUG');
    expect(callArg).toContain('debug details');
  });

  it('log messages include an ISO timestamp', () => {
    debugLogger.info('timestamp test');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    // ISO timestamp pattern: [2026-02-22T...]
    expect(callArg).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });
});

describe('DebugLogger - data argument', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    debugLogger.clearLogs();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('passes data as second argument to console.log', () => {
    const data = { key: 'value' };
    debugLogger.info('with data', data);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      data,
    );
  });

  it('passes undefined data when no data argument given', () => {
    debugLogger.info('no data');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      undefined,
    );
  });
});

describe('DebugLogger - getLogs and clearLogs', () => {
  beforeEach(async () => {
    await debugLogger.clearLogs();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getLogs returns empty array when RNFS file does not exist', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
    const logs = await debugLogger.getLogs();
    expect(Array.isArray(logs)).toBe(true);
  });

  it('clearLogs calls RNFS.unlink on the log file', async () => {
    await debugLogger.clearLogs();
    expect(RNFS.unlink).toHaveBeenCalled();
  });
});

describe('DebugLogger - getLogsAsString', () => {
  beforeEach(async () => {
    await debugLogger.clearLogs();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getLogsAsString returns a string', async () => {
    const result = await debugLogger.getLogsAsString();
    expect(typeof result).toBe('string');
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logInfo is a function', () => {
    expect(typeof logInfo).toBe('function');
  });

  it('logWarn is a function', () => {
    expect(typeof logWarn).toBe('function');
  });

  it('logError is a function', () => {
    expect(typeof logError).toBe('function');
  });

  it('logDebug is a function', () => {
    expect(typeof logDebug).toBe('function');
  });

  it('logInfo calls console.log', () => {
    const spy = jest.spyOn(console, 'log');
    logInfo('convenience info');
    expect(spy).toHaveBeenCalled();
  });

  it('logError calls console.error', () => {
    const spy = jest.spyOn(console, 'error');
    logError('convenience error');
    expect(spy).toHaveBeenCalled();
  });
});
