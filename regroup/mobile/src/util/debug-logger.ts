import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory
  private logFile = `${RNFS.DocumentDirectoryPath}/debug-logs.json`;

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

    // Save to file periodically
    this.saveToFile();
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

  private async saveToFile() {
    try {
      const logData = JSON.stringify(this.logs, null, 2);
      await RNFS.writeFile(this.logFile, logData, 'utf8');
    } catch (error) {
      console.error('Failed to save debug logs to file:', error);
    }
  }

  async getLogs(): Promise<LogEntry[]> {
    try {
      const exists = await RNFS.exists(this.logFile);
      if (exists) {
        const content = await RNFS.readFile(this.logFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to read debug logs from file:', error);
    }
    return this.logs;
  }

  async clearLogs() {
    this.logs = [];
    try {
      await RNFS.unlink(this.logFile);
    } catch (error) {
      // File might not exist, that's okay
    }
  }

  // Get logs as formatted string for sharing
  async getLogsAsString(): Promise<string> {
    const logs = await this.getLogs();
    return logs
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

export const debugLogger = new DebugLogger();

// Convenience functions
export const logInfo = (message: string, data?: any) =>
  debugLogger.info(message, data);
export const logWarn = (message: string, data?: any) =>
  debugLogger.warn(message, data);
export const logError = (message: string, data?: any) =>
  debugLogger.error(message, data);
export const logDebug = (message: string, data?: any) =>
  debugLogger.debug(message, data);
