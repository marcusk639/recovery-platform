import { simpleDebugLogger, logInfo, logWarn, logError, logDebug } from '../simple-debug-logger';

describe('SimpleDebugLogger - console output', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    simpleDebugLogger.clearLogs();
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
    simpleDebugLogger.info('info message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('info() log message contains "INFO" and the message text', () => {
    simpleDebugLogger.info('hello world');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('INFO');
    expect(callArg).toContain('hello world');
  });

  it('warn() calls console.warn', () => {
    simpleDebugLogger.warn('warning message');
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('warn() log message contains "WARN" and the message text', () => {
    simpleDebugLogger.warn('careful!');
    const callArg = consoleWarnSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('WARN');
    expect(callArg).toContain('careful!');
  });

  it('error() calls console.error', () => {
    simpleDebugLogger.error('error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('error() log message contains "ERROR" and the message text', () => {
    simpleDebugLogger.error('something failed');
    const callArg = consoleErrorSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('ERROR');
    expect(callArg).toContain('something failed');
  });

  it('debug() calls console.log', () => {
    simpleDebugLogger.debug('debug message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('debug() log message contains "DEBUG" and the message text', () => {
    simpleDebugLogger.debug('debug details');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('DEBUG');
    expect(callArg).toContain('debug details');
  });

  it('log messages include an ISO timestamp', () => {
    simpleDebugLogger.info('timestamp check');
    const callArg = consoleLogSpy.mock.calls[0][0] as string;
    expect(callArg).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });
});

describe('SimpleDebugLogger - data argument', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    simpleDebugLogger.clearLogs();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('passes data as second argument to console.log', () => {
    const data = { userId: 'u-001' };
    simpleDebugLogger.info('with data', data);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      data,
    );
  });

  it('passes undefined when no data argument given', () => {
    simpleDebugLogger.info('no data');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      undefined,
    );
  });
});

describe('SimpleDebugLogger - getLogs (in-memory)', () => {
  beforeEach(() => {
    simpleDebugLogger.clearLogs();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getLogs returns an array', () => {
    const logs = simpleDebugLogger.getLogs();
    expect(Array.isArray(logs)).toBe(true);
  });

  it('getLogs is empty after clearLogs', () => {
    simpleDebugLogger.clearLogs();
    const logs = simpleDebugLogger.getLogs();
    expect(logs).toHaveLength(0);
  });

  it('getLogs has one entry after one log call', () => {
    simpleDebugLogger.info('one entry');
    const logs = simpleDebugLogger.getLogs();
    expect(logs).toHaveLength(1);
  });

  it('getLogs returns logs newest first', () => {
    simpleDebugLogger.info('first');
    simpleDebugLogger.info('second');
    simpleDebugLogger.info('third');
    const logs = simpleDebugLogger.getLogs();
    expect(logs[0].message).toBe('third');
    expect(logs[2].message).toBe('first');
  });

  it('log entry has timestamp, level, and message fields', () => {
    simpleDebugLogger.info('entry check');
    const logs = simpleDebugLogger.getLogs();
    const entry = logs[0];
    expect(entry.timestamp).toBeDefined();
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('entry check');
  });

  it('clearLogs empties the in-memory logs', () => {
    simpleDebugLogger.info('before clear');
    simpleDebugLogger.clearLogs();
    expect(simpleDebugLogger.getLogs()).toHaveLength(0);
  });

  it('log entry data is JSON-stringified when provided', () => {
    simpleDebugLogger.info('with data', { key: 'val' });
    const logs = simpleDebugLogger.getLogs();
    expect(logs[0].data).toContain('"key"');
    expect(logs[0].data).toContain('"val"');
  });

  it('log entry data is undefined when no data provided', () => {
    simpleDebugLogger.info('no data entry');
    const logs = simpleDebugLogger.getLogs();
    expect(logs[0].data).toBeUndefined();
  });
});

describe('SimpleDebugLogger - getLogsAsString', () => {
  beforeEach(() => {
    simpleDebugLogger.clearLogs();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns empty string when no logs exist', () => {
    const result = simpleDebugLogger.getLogsAsString();
    expect(result).toBe('');
  });

  it('returns a string when logs exist', () => {
    simpleDebugLogger.info('test message');
    const result = simpleDebugLogger.getLogsAsString();
    expect(typeof result).toBe('string');
    expect(result).toContain('INFO');
    expect(result).toContain('test message');
  });

  it('separates multiple log entries with double newline', () => {
    simpleDebugLogger.info('first');
    simpleDebugLogger.info('second');
    const result = simpleDebugLogger.getLogsAsString();
    expect(result).toContain('\n\n');
  });

  it('includes data in log string when data is provided', () => {
    simpleDebugLogger.info('data entry', { foo: 'bar' });
    const result = simpleDebugLogger.getLogsAsString();
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    simpleDebugLogger.clearLogs();
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

  it('logInfo adds an entry with level "info"', () => {
    logInfo('info msg');
    const logs = simpleDebugLogger.getLogs();
    expect(logs.some(l => l.level === 'info' && l.message === 'info msg')).toBe(true);
  });

  it('logWarn adds an entry with level "warn"', () => {
    logWarn('warn msg');
    const logs = simpleDebugLogger.getLogs();
    expect(logs.some(l => l.level === 'warn' && l.message === 'warn msg')).toBe(true);
  });

  it('logError adds an entry with level "error"', () => {
    logError('error msg');
    const logs = simpleDebugLogger.getLogs();
    expect(logs.some(l => l.level === 'error' && l.message === 'error msg')).toBe(true);
  });

  it('logDebug adds an entry with level "debug"', () => {
    logDebug('debug msg');
    const logs = simpleDebugLogger.getLogs();
    expect(logs.some(l => l.level === 'debug' && l.message === 'debug msg')).toBe(true);
  });
});
