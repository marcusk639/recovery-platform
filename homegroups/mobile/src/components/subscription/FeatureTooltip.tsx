import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FeatureTooltipProps {
  featureId: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom';
  children: React.ReactNode;
}

const FeatureTooltip: React.FC<FeatureTooltipProps> = ({
  featureId,
  title,
  description,
  position = 'top',
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const key = `tooltip_dismissed_${featureId}`;
    AsyncStorage.getItem(key).then(value => {
      if (!mounted || value) return;
      setDismissed(false);
      timer = setTimeout(() => {
        if (mounted) setVisible(true);
      }, 1000);
    });
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [featureId]);

  const dismiss = async () => {
    setVisible(false);
    setDismissed(true);
    const key = `tooltip_dismissed_${featureId}`;
    await AsyncStorage.setItem(key, 'true');
  };

  if (dismissed) return <>{children}</>;

  return (
    <View>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={dismiss}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={dismiss}>
          <View
            style={[
              styles.tooltip,
              position === 'bottom' ? styles.tooltipBottom : styles.tooltipTop,
            ]}>
            <View style={styles.tooltipContent}>
              <Icon name="star" size={20} color="#FFFFFF" />
              <View style={styles.tooltipText}>
                <Text style={styles.tooltipTitle}>{title}</Text>
                <Text style={styles.tooltipDescription}>{description}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={dismiss}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    maxWidth: 300,
    backgroundColor: '#2196F3',
  },
  tooltipTop: {
    marginBottom: 100,
  },
  tooltipBottom: {
    marginTop: 100,
  },
  tooltipContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  tooltipText: {
    marginLeft: 12,
    flex: 1,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tooltipDescription: {
    fontSize: 14,
    marginTop: 4,
    color: '#FFFFFF',
    opacity: 0.9,
  },
});

export default FeatureTooltip;
