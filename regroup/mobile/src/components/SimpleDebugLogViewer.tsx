import React, { Component } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { simpleDebugLogger } from '../util/simple-debug-logger';
import { normalize, color, fontSize } from '../styles/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

interface State {
  logs: LogEntry[];
  loading: boolean;
}

export class SimpleDebugLogViewer extends Component<{}, State> {
  state: State = {
    logs: [],
    loading: true,
  };

  async componentDidMount() {
    await this.loadLogs();
  }

  loadLogs = async () => {
    this.setState({ loading: true });
    try {
      const logs = simpleDebugLogger.getLogs();
      this.setState({ logs });
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      this.setState({ loading: false });
    }
  };

  clearLogs = async () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all debug logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            simpleDebugLogger.clearLogs();
            this.setState({ logs: [] });
          },
        },
      ],
    );
  };

  shareLogs = async () => {
    try {
      const logsString = simpleDebugLogger.getLogsAsString();
      await Share.share({
        message: logsString,
        title: 'Debug Logs',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share logs');
    }
  };

  getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return color.red;
      case 'warn':
        return color.orange;
      case 'debug':
        return color.blue;
      default:
        return color.black;
    }
  };

  renderLogEntry = (log: LogEntry, index: number) => (
    <View key={index} style={styles.logEntry}>
      <View style={styles.logHeader}>
        <Text style={[styles.timestamp, { color: color.grey }]}>
          {new Date(log.timestamp).toLocaleTimeString()}
        </Text>
        <Text style={[styles.level, { color: this.getLevelColor(log.level) }]}>
          {log.level.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.message}>{log.message}</Text>
      {log.data && (
        <Text style={[styles.data, { color: color.grey }]}>{log.data}</Text>
      )}
    </View>
  );

  render() {
    const { logs, loading } = this.state;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Debug Logs (Memory Only)</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.refreshButton]}
              onPress={this.loadLogs}>
              <Text style={styles.buttonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.shareButton]}
              onPress={this.shareLogs}>
              <Text style={styles.buttonText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={this.clearLogs}>
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.logsContainer}>
          {loading ? (
            <Text style={styles.loadingText}>Loading logs...</Text>
          ) : logs.length === 0 ? (
            <Text style={styles.emptyText}>No logs available</Text>
          ) : (
            logs.map(this.renderLogEntry)
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.white,
  },
  header: {
    padding: normalize(16),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: 'bold',
    marginBottom: normalize(12),
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(8),
    borderRadius: normalize(4),
    minWidth: normalize(80),
    alignItems: 'center',
  },
  refreshButton: {
    backgroundColor: color.blue,
  },
  shareButton: {
    backgroundColor: color.green,
  },
  clearButton: {
    backgroundColor: color.red,
  },
  buttonText: {
    color: color.white,
    fontSize: fontSize.regular,
    fontWeight: '600',
  },
  logsContainer: {
    flex: 1,
    padding: normalize(16),
  },
  loadingText: {
    textAlign: 'center',
    fontSize: fontSize.regular,
    color: color.grey,
    marginTop: normalize(20),
  },
  emptyText: {
    textAlign: 'center',
    fontSize: fontSize.regular,
    color: color.grey,
    marginTop: normalize(20),
  },
  logEntry: {
    marginBottom: normalize(12),
    padding: normalize(12),
    backgroundColor: color.light_grey,
    borderRadius: normalize(4),
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: normalize(4),
  },
  timestamp: {
    fontSize: fontSize.small,
  },
  level: {
    fontSize: fontSize.small,
    fontWeight: 'bold',
  },
  message: {
    fontSize: fontSize.regular,
    marginBottom: normalize(4),
  },
  data: {
    fontSize: fontSize.small,
    fontFamily: 'monospace',
  },
});
