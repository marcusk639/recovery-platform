import React from 'react';
import {View, Text, StyleSheet, Platform} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNetworkStatus} from '../../hooks/useNetworkStatus';

interface OfflineBannerProps {
  /**
   * Custom message to display when offline
   */
  message?: string;
  /**
   * Whether to show the banner in a compact mode (just icon + short text)
   */
  compact?: boolean;
}

/**
 * A banner component that appears when the device is offline.
 * Only renders when isOffline is explicitly true.
 */
const OfflineBanner: React.FC<OfflineBannerProps> = ({
  message = 'You are offline. Some features may be limited.',
  compact = false,
}) => {
  const {isOffline} = useNetworkStatus();

  // Only render when explicitly offline - no animation, just simple conditional render
  if (!isOffline) {
    return null;
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.content}>
        <Icon
          name="cloud-off-outline"
          size={compact ? 16 : 20}
          color="#FFFFFF"
        />
        <Text style={[styles.text, compact && styles.textCompact]}>
          {compact ? 'Offline' : message}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#616161',
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  containerCompact: {
    paddingTop: Platform.OS === 'ios' ? 48 : 8,
    paddingBottom: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  textCompact: {
    fontSize: 12,
  },
});

export default OfflineBanner;
