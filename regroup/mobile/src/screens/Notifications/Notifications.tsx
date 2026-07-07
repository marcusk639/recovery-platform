import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  Switch,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import ScreenHeader from "../../components/screen-header";
import { RatsText } from "../../components/rats-text";
import { RatsIcon } from "../../components/rats-icon";
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  CARD_NO_ELEVATION,
  ROW,
  fontFamily,
} from "../../styles/theme";
import { Notification } from "../../entities/Notification";
import { NotificationPrefs, User } from "../../entities/User";
import { useAppSelector, useAppDispatch } from "../../state/store";
import { updateUser } from "../../state/slices/userSlice";
import { logException } from "../../util/logging";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "../../state/queries/notificationQueries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationsScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  activityUpdates: true,
  choreReminders: true,
  meetingReminders: true,
  adminMessages: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a notification type to a FontAwesome5 icon name and accent colour.
 */
const TYPE_CONFIG: Record<string, { icon: string; iconColor: string }> = {
  dispute: { icon: "gavel", iconColor: color.orange },
  "meeting-added": { icon: "calendar-plus", iconColor: color.green },
  "meeting-forced": { icon: "calendar-times", iconColor: color.red },
  chore_reminder: { icon: "broom", iconColor: color.purple },
  admin_message: { icon: "bullhorn", iconColor: color.baby_blue },
  system_alert: { icon: "exclamation-triangle", iconColor: color.yellow },
  activity_approved: { icon: "check-circle", iconColor: color.green },
  activity_disputed: { icon: "times-circle", iconColor: color.red },
  default: { icon: "bell", iconColor: color.dark_grey },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.default;
}

/**
 * Returns a human-readable relative timestamp.
 * e.g. "Just now", "2 hours ago", "Yesterday", "Jan 5"
 */
function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Notification Row ─────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: Notification;
  onPress: (id: string) => void;
}

const NotificationRow: React.FC<NotificationRowProps> = React.memo(
  ({ notification, onPress }) => {
    const { icon, iconColor } = getTypeConfig(notification.type);
    const isUnread = !notification.read;

    const containerStyle: ViewStyle = {
      ...CARD_NO_ELEVATION,
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: normalize(14),
      paddingHorizontal: normalize(16),
      marginBottom: 2,
      borderLeftWidth: isUnread ? 4 : 0,
      borderLeftColor: isUnread ? iconColor : "transparent",
    };

    const dateStr = notification.date || notification.createdAt;

    return (
      <TouchableOpacity
        testID={`notification-row-${notification.id}`}
        activeOpacity={0.7}
        onPress={() => onPress(notification.id)}
      >
        <View style={containerStyle}>
          {/* Icon circle */}
          <View
            style={{
              width: normalize(38),
              height: normalize(38),
              borderRadius: normalize(19),
              backgroundColor: iconColor + "22", // 13% opacity tint
              alignItems: "center",
              justifyContent: "center",
              marginRight: normalize(12),
              flexShrink: 0,
            }}
          >
            <RatsIcon
              name={icon}
              size={normalize(16)}
              style={{ color: iconColor }}
            />
          </View>

          {/* Text content */}
          <View style={{ flex: 1 }}>
            <View
              style={[
                ROW,
                { alignItems: "center", marginBottom: normalize(2) },
              ]}
            >
              <View
                testID={`notification-subject-${notification.id}`}
                style={{ flex: 1 }}
              >
                <RatsText
                  text={notification.subject || "Notification"}
                  style={{
                    fontSize: fontSize.regular_medium,
                    fontFamily: isUnread ? fontFamily.bold : fontFamily.roboto,
                    color: color.black,
                  }}
                />
              </View>
              {isUnread && (
                <View
                  testID={`notification-unread-dot-${notification.id}`}
                  style={{
                    width: normalize(8),
                    height: normalize(8),
                    borderRadius: normalize(4),
                    backgroundColor: iconColor,
                    marginLeft: normalize(6),
                    flexShrink: 0,
                  }}
                />
              )}
            </View>

            {!!notification.message && (
              <View testID={`notification-message-${notification.id}`}>
                <RatsText
                  text={notification.message}
                  numberOfLines={2}
                  style={{
                    fontSize: fontSize.small,
                    color: color.dark_grey,
                    marginBottom: normalize(4),
                  }}
                />
              </View>
            )}

            {!!dateStr && (
              <RatsText
                text={getRelativeTime(dateStr)}
                style={{
                  fontSize: fontSize.extraSmall,
                  color: color.grey,
                }}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <View
    testID="notifications-empty-state"
    style={{
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: normalize(80),
    }}
  >
    <RatsIcon
      name="check-circle"
      size={normalize(48)}
      style={{ color: color.green, marginBottom: normalize(16) }}
    />
    <RatsText
      text="You're all caught up!"
      style={{
        fontSize: fontSize.medium_large,
        fontFamily: fontFamily.bold,
        color: color.dark_grey,
        marginBottom: normalize(8),
      }}
    />
    <RatsText
      text="No new notifications"
      style={{ fontSize: fontSize.regular, color: color.grey }}
    />
  </View>
);

// ─── Preferences section ──────────────────────────────────────────────────────

interface PrefRowProps {
  label: string;
  value: boolean;
  testID: string;
  onToggle: (val: boolean) => void;
}

const PrefRow: React.FC<PrefRowProps> = ({
  label,
  value,
  testID,
  onToggle,
}) => (
  <View
    style={[
      CARD_NO_ELEVATION,
      ROW,
      {
        alignItems: "center",
        paddingVertical: normalize(14),
        paddingHorizontal: normalize(16),
        marginBottom: 2,
      },
    ]}
  >
    <RatsText
      text={label}
      style={{ flex: 1, fontSize: fontSize.regular_medium, color: color.black }}
    />
    <Switch
      testID={testID}
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: color.medium_grey, true: color.main }}
      thumbColor={color.white}
    />
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  navigation,
}) => {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.uid || user?.id || "";
  const dispatch = useAppDispatch();

  // Hardened 2026-07-05: these toggles were local useState only (with a code
  // comment acknowledging they weren't persisted) — every selection silently
  // reset on next app launch. Now backed by user.notificationPrefs, patched
  // via the same updateUser thunk already used elsewhere (e.g. messaging
  // tokens), with an optimistic local update that rolls back on failure.
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    user?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS
  );

  const togglePref = useCallback(
    (key: keyof NotificationPrefs) => async (val: boolean) => {
      const previousPrefs = prefs;
      const nextPrefs = { ...prefs, [key]: val };
      setPrefs(nextPrefs);
      if (!user) return;
      try {
        await dispatch(
          updateUser({
            user: user as User,
            updates: { notificationPrefs: nextPrefs },
          })
        ).unwrap();
      } catch (error) {
        logException(error, "Failed to persist notification preferences");
        setPrefs(previousPrefs);
      }
    },
    [prefs, user, dispatch]
  );

  // ─── Data fetching ───────────────────────────────────────────────────────
  const {
    data: notifications = [],
    isLoading,
    refetch,
    isFetching,
  } = useNotifications(userId, !!userId);

  const markRead = useMarkNotificationRead(userId);
  const markAllRead = useMarkAllNotificationsRead(userId);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const hasUnread = unreadCount > 0;

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleNotificationPress = useCallback(
    (notificationId: string) => {
      markRead.mutate(notificationId);
    },
    [markRead]
  );

  const handleMarkAllRead = useCallback(() => {
    if (hasUnread) {
      markAllRead.mutate();
    }
  }, [hasUnread, markAllRead]);

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderPreferences = () => (
    <View testID="notification-preferences-section">
      <View
        style={[
          CARD_STYLE,
          {
            paddingHorizontal: normalize(16),
            paddingVertical: normalize(12),
            marginTop: normalize(8),
            marginBottom: 2,
          },
        ]}
      >
        <RatsText
          text="Notification Preferences"
          style={{
            fontSize: fontSize.medium,
            fontFamily: fontFamily.bold,
            color: color.dark_grey,
          }}
        />
      </View>
      <PrefRow
        label="Activity approvals & disputes"
        value={prefs.activityUpdates}
        testID="pref-toggle-activity"
        onToggle={togglePref("activityUpdates")}
      />
      <PrefRow
        label="Chore reminders"
        value={prefs.choreReminders}
        testID="pref-toggle-chore"
        onToggle={togglePref("choreReminders")}
      />
      <PrefRow
        label="Meeting reminders"
        value={prefs.meetingReminders}
        testID="pref-toggle-meeting"
        onToggle={togglePref("meetingReminders")}
      />
      <PrefRow
        label="Admin messages"
        value={prefs.adminMessages}
        testID="pref-toggle-admin"
        onToggle={togglePref("adminMessages")}
      />
    </View>
  );

  const renderNotifications = () => {
    if (isLoading) {
      // Show preferences section while loading — list area is empty
      return null;
    }

    if (notifications.length === 0) {
      return <EmptyState />;
    }

    return (
      <View>
        {/* Section header */}
        <View
          style={[
            CARD_STYLE,
            {
              paddingHorizontal: normalize(16),
              paddingVertical: normalize(12),
              marginBottom: 2,
            },
          ]}
        >
          <RatsText
            text="Recent Notifications"
            style={{
              fontSize: fontSize.medium,
              fontFamily: fontFamily.bold,
              color: color.dark_grey,
            }}
          />
        </View>

        {/* Notification rows */}
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onPress={handleNotificationPress}
          />
        ))}
      </View>
    );
  };

  return (
    <View
      testID="notifications-screen"
      style={{ flex: 1, backgroundColor: color.light_grey }}
    >
      {/* Header */}
      <ScreenHeader
        renderBackButton
        header="Notifications"
        container={{ marginBottom: 2 }}
      >
        {hasUnread && (
          <TouchableOpacity
            testID="mark-all-read-button"
            onPress={handleMarkAllRead}
            style={{ paddingVertical: normalize(4) }}
          >
            <RatsText
              text="Mark all read"
              style={{
                fontSize: fontSize.small,
                color: color.baby_blue,
                fontFamily: fontFamily.bold,
              }}
            />
          </TouchableOpacity>
        )}
      </ScreenHeader>

      {/* Scrollable content */}
      <ScrollView
        testID="notifications-list"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={color.main}
          />
        }
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {renderNotifications()}
        {renderPreferences()}
      </ScrollView>
    </View>
  );
};

export default NotificationsScreen;
