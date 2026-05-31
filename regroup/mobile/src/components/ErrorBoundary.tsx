import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { color, normalize, fontSize } from '../styles/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console for now (Sentry can be added later)
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              We're sorry, but something unexpected happened. Please try again.
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.errorDetails}>
                {this.state.error.message}
              </Text>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleRetry}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.light_grey,
    padding: normalize(20),
  },
  content: {
    backgroundColor: 'white',
    padding: normalize(30),
    borderRadius: normalize(10),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: fontSize.extraLarge,
    fontWeight: 'bold',
    color: color.dark_grey,
    marginBottom: normalize(10),
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.regular,
    color: color.grey,
    textAlign: 'center',
    marginBottom: normalize(20),
    lineHeight: normalize(20),
  },
  errorDetails: {
    fontSize: fontSize.small,
    color: color.red,
    textAlign: 'center',
    marginBottom: normalize(20),
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: color.baby_blue,
    paddingHorizontal: normalize(20),
    paddingVertical: normalize(10),
    borderRadius: normalize(5),
  },
  retryButtonText: {
    color: 'white',
    fontSize: fontSize.regular,
    fontWeight: 'bold',
  },
});

export default ErrorBoundary;
