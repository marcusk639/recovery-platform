/**
 * Crashlytics utility functions for error reporting and logging
 *
 * This module provides a centralized way to log errors and events to Firebase Crashlytics.
 * Use these functions throughout the app to ensure consistent error tracking.
 */

import crashlytics from '@react-native-firebase/crashlytics';

/**
 * Log a non-fatal error to Crashlytics
 * Use this for errors that don't crash the app but should be tracked
 *
 * @param error - The error object to record
 * @param context - Optional context string describing where the error occurred
 */
export const logError = (error: Error, context?: string): void => {
  try {
    if (context) {
      crashlytics().log(`Error context: ${context}`);
    }
    crashlytics().recordError(error);
  } catch (e) {
    console.error('Failed to log error to Crashlytics:', e);
  }
};

/**
 * Log a message to Crashlytics
 * These logs will appear in the crash report to help debug issues
 *
 * @param message - The message to log
 */
export const logMessage = (message: string): void => {
  try {
    crashlytics().log(message);
  } catch (e) {
    console.error('Failed to log message to Crashlytics:', e);
  }
};

/**
 * Set a custom key-value pair for crash reports
 * Use this to add app-specific context to crash reports
 *
 * @param key - The attribute key
 * @param value - The attribute value
 */
export const setAttribute = async (
  key: string,
  value: string,
): Promise<void> => {
  try {
    await crashlytics().setAttribute(key, value);
  } catch (e) {
    console.error('Failed to set Crashlytics attribute:', e);
  }
};

/**
 * Set multiple custom attributes at once
 *
 * @param attributes - Object containing key-value pairs
 */
export const setAttributes = async (
  attributes: Record<string, string>,
): Promise<void> => {
  try {
    await crashlytics().setAttributes(attributes);
  } catch (e) {
    console.error('Failed to set Crashlytics attributes:', e);
  }
};

/**
 * Log screen navigation for crash context
 *
 * @param screenName - The name of the screen being navigated to
 */
export const logScreenView = (screenName: string): void => {
  try {
    crashlytics().log(`Screen: ${screenName}`);
  } catch (e) {
    console.error('Failed to log screen view to Crashlytics:', e);
  }
};

/**
 * Log a user action for crash context
 *
 * @param action - Description of the user action
 */
export const logUserAction = (action: string): void => {
  try {
    crashlytics().log(`User action: ${action}`);
  } catch (e) {
    console.error('Failed to log user action to Crashlytics:', e);
  }
};

/**
 * Log API call for crash context
 *
 * @param endpoint - The API endpoint being called
 * @param method - HTTP method (GET, POST, etc.)
 */
export const logApiCall = (endpoint: string, method: string = 'GET'): void => {
  try {
    crashlytics().log(`API call: ${method} ${endpoint}`);
  } catch (e) {
    console.error('Failed to log API call to Crashlytics:', e);
  }
};

/**
 * Force a crash for testing purposes (only use in development!)
 * This will immediately crash the app to test crash reporting
 */
export const testCrash = (): void => {
  crashlytics().crash();
};

export default {
  logError,
  logMessage,
  setAttribute,
  setAttributes,
  logScreenView,
  logUserAction,
  logApiCall,
  testCrash,
};

