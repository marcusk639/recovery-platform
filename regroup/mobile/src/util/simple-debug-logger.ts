interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

class SimpleDebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  log(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
    };

    // Add to memory
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Console log for immediate visibility
    const logMessage = `[${
      entry.timestamp
    }] ${level.toUpperCase()}: ${message}`;
    switch (level) {
      case 'error':
        console.error(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'debug':
        console.log(logMessage, data);
        break;
      default:
        console.log(logMessage, data);
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs].reverse(); // Return newest first
  }

  clearLogs() {
    this.logs = [];
  }

  // Get logs as formatted string for sharing
  getLogsAsString(): string {
    return this.logs
      .map(log => {
        let line = `[${log.timestamp}] ${log.level.toUpperCase()}: ${
          log.message
        }`;
        if (log.data) {
          line += `\n${log.data}`;
        }
        return line;
      })
      .join('\n\n');
  }
}

export const simpleDebugLogger = new SimpleDebugLogger();

// Convenience functions
export const logInfo = (message: string, data?: any) =>
  simpleDebugLogger.info(message, data);
export const logWarn = (message: string, data?: any) =>
  simpleDebugLogger.warn(message, data);
export const logError = (message: string, data?: any) =>
  simpleDebugLogger.error(message, data);
export const logDebug = (message: string, data?: any) =>
  simpleDebugLogger.debug(message, data);
