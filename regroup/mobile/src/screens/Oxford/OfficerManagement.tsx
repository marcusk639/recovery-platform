import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { differenceInDays, parseISO } from "date-fns";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

import RatsScrollView from "../../components/rats-scroll-view";
import ScreenHeader from "../../components/screen-header";
import Section from "../../components/rats-interactable-section";
import RatsButton from "../../components/rats-button/rats-button";
import { RatsText } from "../../components/rats-text";

import { useAppSelector } from "../../state/store";
import { useOxfordGate } from "../../hooks/useOxfordGate";
import { useGuests } from "../../state/queries/guestQueries";
import { Officer, OfficerRole } from "../../entities/oxford/Officer";
import { Guest } from "../../entities/Guest";
import {
  useOfficers,
  useCreateOfficer,
  useRemoveOfficer,
} from "../../state/queries/oxfordQueries";
import { color, normalize, fontSize } from "../../styles/theme";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const OFFICER_ROLES: {
  role: OfficerRole;
  label: string;
  icon: string;
  iconColor: string;
}[] = [
  {
    role: "president",
    label: "President",
    icon: "star",
    iconColor: color.yellow,
  },
  {
    role: "treasurer",
    label: "Treasurer",
    icon: "dollar-sign",
    iconColor: color.green,
  },
  {
    role: "secretary",
    label: "Secretary",
    icon: "pencil-alt",
    iconColor: color.baby_blue,
  },
  {
    role: "comptroller",
    label: "Comptroller",
    icon: "calculator",
    iconColor: color.purple,
  },
];

const OfficerManagement: React.FC<Props> = ({ navigation }) => {
  const { allowed, houseId } = useOxfordGate();
  // React Query is the source of truth for guests; the Redux slot is dead
  // in production (cacheGuests is never dispatched). See .full-review [A2].
  const { data: guests = {} } = useGuests(houseId, allowed);

  const [assigningRole, setAssigningRole] = useState<OfficerRole | null>(null);

  const {
    data: officers = [],
    isLoading: loading,
    isFetching,
    refetch,
  } = useOfficers(houseId, allowed);

  const createOfficerMutation = useCreateOfficer();
  const removeOfficerMutation = useRemoveOfficer();

  // Guest lookups inside the render loop (4 roles × N residents) used to
  // run Object.values(guests).find() every render. Build the map once.
  const guestByUserId = useMemo(() => {
    const map: Record<string, Guest> = {};
    for (const g of Object.values(guests) as Guest[]) {
      if (g.userId) {
        map[g.userId] = g;
      }
    }
    return map;
  }, [guests]);

  const guestList = useMemo(() => Object.values(guests) as Guest[], [guests]);

  const getOfficerForRole = useCallback(
    (role: OfficerRole): Officer | undefined =>
      officers.find((o) => o.role === role && o.isActive),
    [officers],
  );

  const getGuestName = useCallback(
    (userId: string | undefined, fallbackName?: string): string => {
      const guest = userId ? guestByUserId[userId] : undefined;
      const guestName = guest
        ? `${guest.firstName || ""} ${guest.lastName || ""}`.trim()
        : "";
      // Officers created during onboarding (oxfordOnboardingMutations.ts)
      // have no userId and are never linked to a guest account — fall back
      // to the name captured at onboarding time before giving up.
      return guestName || fallbackName || "Unknown";
    },
    [guestByUserId],
  );

  const getTermWarning = (officer: Officer): string | null => {
    const daysLeft = differenceInDays(
      parseISO(officer.termEndDate),
      new Date(),
    );
    if (daysLeft <= 30 && daysLeft >= 0) {
      return `Expires in ${daysLeft} days`;
    }
    return null;
  };

  const handleRemoveOfficer = useCallback(
    async (officer: Officer) => {
      if (!houseId) {
        return;
      }
      try {
        await removeOfficerMutation.mutateAsync({ id: officer.id, houseId });
      } catch {
        Alert.alert("Error", "Failed to remove officer. Please try again.");
      }
    },
    [houseId, removeOfficerMutation],
  );

  const handleAssignOfficer = (role: OfficerRole) => {
    setAssigningRole(role);
  };

  const handleGuestSelected = async (guest: Guest) => {
    if (!houseId || !assigningRole) {
      return;
    }

    try {
      await createOfficerMutation.mutateAsync({
        houseId,
        userId: guest.userId,
        role: assigningRole,
        termStartDate: new Date().toISOString().split("T")[0],
        termEndDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        isActive: true,
        electedAt: new Date().toISOString(),
      });
      Alert.alert("Success", `${guest.firstName} assigned as ${assigningRole}`);
      setAssigningRole(null);
    } catch {
      Alert.alert("Error", "Failed to assign officer. Please try again.");
    }
  };

  if (!allowed) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Officer Management" renderBackButton />
        <View style={{ padding: normalize(24), alignItems: "center" }}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={{ color: color.dark_grey, fontSize: fontSize.regular }}
            translate={false}
          />
        </View>
      </RatsScrollView>
    );
  }

  if (loading) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Officer Management" renderBackButton />
        <ActivityIndicator
          color={color.baby_blue}
          style={{ marginTop: normalize(40) }}
        />
      </RatsScrollView>
    );
  }

  if (assigningRole) {
    return (
      <RatsScrollView>
        <ScreenHeader
          header={`Assign ${
            assigningRole.charAt(0).toUpperCase() + assigningRole.slice(1)
          }`}
          renderBackButton
          onBackPress={() => setAssigningRole(null)}
        />
        <View style={{ padding: normalize(16) }}>
          <RatsText
            text="Select a resident to assign:"
            style={{
              fontSize: fontSize.medium,
              color: color.dark_grey,
              marginBottom: normalize(12),
            }}
          />
          <FlatList
            data={guestList}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Section
                name={
                  `${item.firstName || ""} ${item.lastName || ""}`.trim() ||
                  "Resident"
                }
                description={item.id}
                boxedIconName="user"
                iconBackgroundColor={color.baby_blue}
                onPress={() => handleGuestSelected(item)}
              />
            )}
            ListEmptyComponent={
              <RatsText
                text="No residents found"
                style={{
                  color: color.dark_grey,
                  fontSize: fontSize.regular,
                  marginTop: normalize(20),
                }}
              />
            }
          />
          <RatsButton
            title="Cancel"
            light
            containerStyle={{ marginTop: normalize(16) }}
            onPress={() => setAssigningRole(null)}
          />
        </View>
      </RatsScrollView>
    );
  }

  return (
    <RatsScrollView
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !loading}
          onRefresh={refetch}
        />
      }
    >
      <ScreenHeader header="Officer Management" renderBackButton />
      <View style={{ padding: normalize(16) }}>
        {OFFICER_ROLES.map(({ role, label, icon, iconColor }) => {
          const currentOfficer = getOfficerForRole(role);
          const currentName = currentOfficer
            ? getGuestName(currentOfficer.userId, currentOfficer.name)
            : "Unassigned";
          const warning = currentOfficer
            ? getTermWarning(currentOfficer)
            : null;
          const description = warning
            ? `${currentName} · ⚠ ${warning}`
            : currentName;

          return (
            <React.Fragment key={role}>
              <Section
                name={label}
                description={description}
                boxedIconName={icon}
                iconBackgroundColor={iconColor}
                onPress={() => handleAssignOfficer(role)}
                iconName="chevron-right"
              />
              {currentOfficer && (
                <TouchableOpacity
                  testID={`remove-officer-${role}`}
                  onPress={() => handleRemoveOfficer(currentOfficer)}
                  style={{
                    alignSelf: "flex-end",
                    marginTop: -8,
                    marginBottom: 8,
                    marginRight: normalize(16),
                    padding: normalize(4),
                  }}
                >
                  <RatsText
                    translate={false}
                    text="Remove"
                    style={{ color: color.red, fontSize: fontSize.small }}
                  />
                </TouchableOpacity>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </RatsScrollView>
  );
};

export default OfficerManagement;
