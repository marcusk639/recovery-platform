import { Alert } from 'react-native';
import { logException } from '../../util/logging';

/**
 * Handle storage errors by logging and propagating them
 *
 * Callers should catch and handle these errors appropriately
 * (e.g., show user-friendly messages in UI)
 */
export const handleError = (error: any): never => {
  logException(error);

  let errorMessage: string;

  switch (error.code) {
    case 'storage/object-not-found': {
      errorMessage = 'File not found';
      Alert.alert('File not found!');
      break;
    }
    case 'storage/unauthorized': {
      errorMessage = 'Unauthorized access to storage';
      Alert.alert('Unauthorized');
      break;
    }
    case 'storage/canceled': {
      errorMessage = 'Storage operation canceled';
      // Don't show alert for canceled operations
      break;
    }
    case 'storage/unknown':
    default: {
      errorMessage = 'Unknown storage error';
      Alert.alert('Unknown error');
      break;
    }
  }

  // Propagate error for caller to handle
  throw new Error(`Storage error: ${errorMessage}`);
};
