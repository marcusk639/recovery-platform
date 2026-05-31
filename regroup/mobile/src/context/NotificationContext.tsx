import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  Dimensions,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import { RatsText } from '../components/rats-text';
import {
  normalize,
  color,
  fontSize,
  ROW,
  fontFamily,
  CIRCLE,
} from '../styles/theme';
import { RatsIcon, ClickableIcon } from '../components/rats-icon/rats-icon';
import { RatsPopover } from '../components/rats-popover';
import { RatsHR } from '../components/rats-horizontal-rule';

/**
 * Notification Context Types
 */
interface NotificationButton {
  label: string;
  action: () => void;
}

interface NotificationState {
  visible: boolean;
  header: string;
  content: string;
  buttons: NotificationButton[];
  status?: 'fail' | 'succeed';
  timedDismiss: number;
}

interface PopoverState {
  visible: boolean;
  heading: string;
  content: string;
  ref: any;
}

interface NotificationContextType {
  // Toast Notifications
  notify: (
    header: string,
    content: string,
    buttons?: NotificationButton[],
    status?: 'fail' | 'succeed',
    timedDismiss?: number,
  ) => void;
  dismissNotification: () => void;
  notificationVisible: boolean;

  // Popover
  showPopover: (heading: string, content: string) => void;
  hidePopover: () => void;
  setPopoverRef: (ref: any) => void;
  popoverVisible: boolean;
}

/**
 * Notification Context
 */
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * Notification Provider Props
 */
interface NotificationProviderProps {
  children: ReactNode;
}

// Styles
const CONTAINER: ViewStyle = {
  padding: normalize(15),
  zIndex: 100,
  width: '95%',
  backgroundColor: color.black,
  position: 'absolute',
  left: 10,
  borderRadius: 5,
  bottom: 10,
};

const HEADER: TextStyle = {
  fontFamily: fontFamily.bold,
  color: color.white,
  fontSize: fontSize.medium,
};

const CONTENT: TextStyle = { color: color.white };

const BUTTON: TextStyle = {
  fontSize: fontSize.medium,
  color: color.baby_blue,
  fontFamily: fontFamily.bold,
  paddingTop: normalize(10),
  marginBottom: normalize(10),
};

/**
 * Notification Provider Component
 *
 * Provides notification functionality to the entire app, replacing HOCs:
 * - withNotifier
 * - withPopover
 */
export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  // Notification State
  const [notification, setNotification] = useState<NotificationState>({
    visible: false,
    header: '',
    content: '',
    buttons: [],
    timedDismiss: 0,
  });

  // Popover State
  const [popover, setPopover] = useState<PopoverState>({
    visible: false,
    heading: 'Heading',
    content: 'Content',
    ref: null,
  });

  // Animation
  const animatedValue = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Notification Actions
  const notify = useCallback(
    (
      header: string,
      content: string,
      buttons: NotificationButton[] = [],
      status?: 'fail' | 'succeed',
      timedDismiss: number = 5,
    ) => {
      setNotification({
        visible: true,
        header,
        content,
        buttons,
        status,
        timedDismiss,
      });

      // Animate in
      Animated.timing(animatedValue, {
        toValue: -normalize(10),
        duration: 1000,
        useNativeDriver: true,
      }).start();

      // Auto dismiss if timedDismiss is set
      if (timedDismiss > 0) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          dismissNotification();
        }, timedDismiss * 1000);
      }
    },
    [animatedValue],
  );

  const dismissNotification = useCallback(() => {
    Animated.timing(animatedValue, {
      toValue: Dimensions.get('window').height,
      duration: 1000,
      useNativeDriver: true,
    }).start(() => {
      setNotification(prev => ({ ...prev, visible: false }));
    });

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [animatedValue]);

  // Popover Actions
  const showPopover = useCallback((heading: string, content: string) => {
    setPopover(prev => ({
      ...prev,
      visible: true,
      heading,
      content,
    }));
  }, []);

  const hidePopover = useCallback(() => {
    setPopover(prev => ({ ...prev, visible: false }));
  }, []);

  const setPopoverRef = useCallback((ref: any) => {
    setPopover(prev => {
      // Only update if ref actually changed to prevent infinite loops
      if (prev.ref === ref) {
        return prev;
      }
      return { ...prev, ref };
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Context Value (memoized to prevent infinite re-renders)
  const value: NotificationContextType = useMemo(() => ({
    notify,
    dismissNotification,
    notificationVisible: notification.visible,
    showPopover,
    hidePopover,
    setPopoverRef,
    popoverVisible: popover.visible,
  }), [
    notify,
    dismissNotification,
    notification.visible,
    showPopover,
    hidePopover,
    setPopoverRef,
    popover.visible,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}

      {/* Toast Notification */}
      {notification.visible && (
        <Animated.View
          style={[CONTAINER, { transform: [{ translateY: animatedValue }] }]}>
          <View style={[ROW]}>
            {(notification.status === 'succeed' || notification.status === 'fail') && (
              <View
                style={[
                  CIRCLE,
                  {
                    marginRight: normalize(10),
                    backgroundColor:
                      notification.status === 'succeed' ? color.green : color.red,
                  },
                ]}>
                <RatsIcon
                  name={
                    notification.status === 'succeed'
                      ? 'check-square'
                      : 'exclamation-triangle'
                  }
                  solid
                  style={{ color: color.white }}
                  size={20}
                />
              </View>
            )}
            <View style={{ alignItems: 'flex-start', width: '100%' }}>
              <RatsText
                text={notification.header}
                translate={false}
                style={[HEADER]}
              />
              <View
                style={{
                  flexWrap: 'wrap',
                  width: '90%',
                  flexDirection: 'row',
                }}>
                <RatsText
                  text={notification.content}
                  translate={false}
                  style={[CONTENT]}
                />
              </View>
              {notification.buttons.map((button, index) => (
                <TouchableOpacity
                  key={button.label + index}
                  onPress={() => {
                    button.action();
                    dismissNotification();
                  }}>
                  <RatsText
                    text={button.label}
                    translate={false}
                    style={BUTTON}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{ marginLeft: 'auto' }}
              onPress={dismissNotification}>
              <RatsIcon size={20} name="times" style={{ color: color.white }} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Popover */}
      <RatsPopover
        mode={"rn-modal" as any}
        placement={"top" as any}
        popoverStyle={{ borderRadius: 5 }}
        isVisible={popover.visible}
        from={popover.ref as any}>
        <View
          style={{
            backgroundColor: color.white,
            padding: normalize(12),
            width: Dimensions.get('window').width * 0.75,
          }}>
          <View
            style={[
              ROW,
              { justifyContent: 'space-between', alignItems: 'center' },
            ]}>
            <RatsText
              style={{
                fontSize: fontSize.medium_large,
                fontFamily: fontFamily.bold,
              }}
              text={popover.heading}
            />
            <ClickableIcon
              containerProps={{ onPress: hidePopover }}
              iconProps={{
                size: normalize(20),
                name: 'times',
                style: { color: color.black },
              }}
            />
          </View>
          <RatsHR
            style={{
              marginTop: normalize(5),
              marginBottom: normalize(10),
              borderBottomColor: color.baby_blue,
            }}
          />
          <RatsText
            style={{ fontSize: fontSize.regular_medium2 }}
            text={popover.content}
          />
        </View>
      </RatsPopover>
    </NotificationContext.Provider>
  );
};

/**
 * useNotification Hook
 *
 * Custom hook to access notification context
 *
 * @example
 * const { notify, showPopover } = useNotification();
 * notify('Success', 'Operation completed', [], 'succeed');
 * showPopover('Help', 'This is a help message');
 */
export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
