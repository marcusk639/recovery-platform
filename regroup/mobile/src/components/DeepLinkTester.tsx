import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import {
  testDeepLinkCapability,
  testOpenDeepLink,
  debugConfig,
} from '../services/debug-deep-links';
import { SimpleDebugLogViewer } from './SimpleDebugLogViewer';

interface DeepLinkTesterProps {
  visible?: boolean;
}

export const DeepLinkTester: React.FC<DeepLinkTesterProps> = ({
  visible = __DEV__,
}) => {
  const [canOpenURL, setCanOpenURL] = useState<boolean | null>(null);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [showLogViewer, setShowLogViewer] = useState(false);

  useEffect(() => {
    if (visible) {
      testDeepLinkCapability().then(setCanOpenURL);
    }
  }, [visible]);

  const addResult = (result: string) => {
    setTestResults(prev => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${result}`,
    ]);
  };

  const testScheme = async (scheme: string, name: string) => {
    try {
      addResult(`Testing ${name}: ${scheme}`);
      const canOpen = await Linking.canOpenURL(scheme);
      addResult(`${name} canOpenURL: ${canOpen}`);

      if (canOpen) {
        const opened = await Linking.openURL(scheme);
        addResult(`${name} opened successfully: ${opened}`);
      } else {
        addResult(`${name} cannot be opened`);
      }
    } catch (error) {
      addResult(`${name} error: ${error}`);
    }
  };

  const runAllTests = async () => {
    setTestResults([]);
    addResult('Starting deep link tests...');

    // Test custom schemes
    await testScheme(
      debugConfig.testUrls.invitation,
      'Custom Scheme Invitation',
    );

    // Test universal links
    await testScheme(
      debugConfig.testUrls.universalInvitation,
      'Universal Link Invitation',
    );

    // Test bundle ID scheme
    const bundleIdScheme = debugConfig.testUrls.invitation.replace(
      'regroup-app://',
      'com.rats.dev://',
    );
    await testScheme(bundleIdScheme, 'Bundle ID Scheme');

    addResult('All tests completed');
  };

  const clearResults = () => {
    setTestResults([]);
  };

  if (!visible) {
    return null;
  }

  if (showLogViewer) {
    return (
      <View style={styles.fullScreenContainer}>
        <SimpleDebugLogViewer />
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowLogViewer(false)}>
          <Text style={styles.closeButtonText}>Close Logs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deep Link Tester</Text>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Platform: {Platform.OS}</Text>
        <Text style={styles.infoText}>
          Debug Mode: {__DEV__ ? 'Yes' : 'No'}
        </Text>
        <Text style={styles.infoText}>
          Can Open URL:{' '}
          {canOpenURL === null ? 'Testing...' : canOpenURL ? 'Yes' : 'No'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={runAllTests}>
          <Text style={styles.buttonText}>Run All Tests</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={clearResults}>
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.logButton]}
          onPress={() => setShowLogViewer(true)}>
          <Text style={styles.buttonText}>View Logs</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resultsContainer}>
        <Text style={styles.resultsTitle}>Test Results:</Text>
        {testResults.map((result, index) => (
          <Text key={index} style={styles.resultText}>
            {result}
          </Text>
        ))}
      </View>

      <View style={styles.testUrlsContainer}>
        <Text style={styles.testUrlsTitle}>Test URLs:</Text>
        <Text style={styles.testUrl}>
          Custom: {debugConfig.testUrls.invitation}
        </Text>
        <Text style={styles.testUrl}>
          Universal: {debugConfig.testUrls.universalInvitation}
        </Text>
        <Text style={styles.testUrl}>
          Bundle ID:{' '}
          {debugConfig.testUrls.invitation.replace(
            'regroup-app://',
            'com.rats.dev://',
          )}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 15,
    borderRadius: 10,
    zIndex: 1000,
  },
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1001,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 5,
    zIndex: 1002,
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 15,
  },
  infoText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
  },
  logButton: {
    backgroundColor: '#28a745',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  resultsContainer: {
    maxHeight: 200,
    marginBottom: 15,
  },
  resultsTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  resultText: {
    color: '#00ff00',
    fontSize: 10,
    marginBottom: 2,
  },
  testUrlsContainer: {
    maxHeight: 150,
  },
  testUrlsTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  testUrl: {
    color: '#ffff00',
    fontSize: 10,
    marginBottom: 2,
  },
});
