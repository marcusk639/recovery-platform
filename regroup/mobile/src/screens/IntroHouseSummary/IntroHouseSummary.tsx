import React, { useState, useCallback } from "react";
import { HouseListing } from "../../entities/HouseListing";
import { View, ViewStyle, TouchableOpacity, TextStyle } from "react-native";
import RatsScrollView from "../../components/rats-scroll-view";
import { RatsText } from "../../components/rats-text";
import {
  fontSize,
  ROW,
  CARD_STYLE,
  normalize,
  color,
  fontFamily,
} from "../../styles/theme";
import { Routes, AuthScreenNavigationProp } from "../../navigation/types";
import Admin from "../../entities/Admin";
import { isNil, map } from "lodash";
import { Admins } from "../../types";
import RatsAvatar from "../../components/rats-avatar";
import RatsButton from "../../components/rats-button/rats-button";
import { callNumber } from "../../util/phone";
import ImageHeader from "../../components/image-header";
import { getAddressDisplay } from "../../util/address";
import { RatsIcon } from "../../components/rats-icon";
import { houseImage } from "../../../assets/index";
import WeekStatSummary from "../../components/week-stat-summary";
import { camelCaseToDisplayForm } from "../../util/display";
import { useAppSelector } from "../../state/store";
import { useSelectedHouse } from "../../hooks/useSelectedHouse";
import { useHouseListing } from "../../state/queries/houseListingQueries";
import { STAT_BUTTON_TEXT } from "../../styles/theme";

interface Props {
  navigation: AuthScreenNavigationProp;
}

/** The share of beds open, 0 to 100, for the summary ring. */
const openShare = (house: HouseListing): number =>
  house.maximumCapacity
    ? Math.round(((house.openBeds ?? 0) / house.maximumCapacity) * 100)
    : 0;

const contentStyle: ViewStyle = {
  flexGrow: 1,
  alignItems: "center",
  justifyContent: "flex-start",
  backgroundColor: color.light_grey,
};

/**
 * Intro House Summary Screen
 *
 * Displays detailed information about a house for prospective residents.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 2 'as any' casts)
 * - No HOCs used in this screen
 */
const IntroHouseSummary: React.FC<Props> = ({ navigation }) => {
  const [collapsedUsers, setCollapsedUsers] = useState<{
    [id: string]: boolean;
  }>({});

  // RTK Typed Selectors (no more 'as any')
  // A prospective resident is signed out (the app's anonymous session), so
  // this reads the house's public listing, not houses/{id}, which is for its
  // members only (EMU-009).
  const { houseId } = useSelectedHouse();
  const { data: house } = useHouseListing(houseId);
  const admins = useAppSelector((state) => state.admin.houseAdmins);

  // D1 = option (a) (P5 Task 16): a prospective resident applies on the
  // anonymous session the app already holds. Self-signup stays on the landing
  // screen's sign-up entry.
  const startApplication = useCallback(() => {
    if (!house) return;
    navigation.navigate(Routes.Apply, {
      houseId: house.id,
      houseName: house.name,
    });
  }, [house, navigation]);

  const toggleCollapsible = useCallback(
    (user: Admin) => () => {
      setCollapsedUsers((prevState) => {
        const newCollapsedUsers: { [id: string]: boolean } = {};
        Object.keys(prevState).forEach((key) => {
          if (newCollapsedUsers[key] && key !== user.id) {
            newCollapsedUsers[key] = false;
          }
        });
        newCollapsedUsers[user.id] =
          prevState[user.id] === undefined ||
          prevState[user.id] === null ||
          prevState[user.id] === true
            ? false
            : true;
        return newCollapsedUsers;
      });
    },
    []
  );

  const renderAvatarItem = (user: Admin, description: string) => {
    return (
      <View style={[ROW]}>
        <RatsAvatar
          name={user.firstName + " " + user.lastName}
          style={{
            height: normalize(45),
            width: normalize(45),
            borderRadius: normalize(45),
            marginRight: normalize(15),
          }}
          source={{ uri: user.avatar }}
          resizeMethod="resize"
          resizeMode="cover"
        />
        <View>
          <RatsText
            text={user.firstName + " " + user.lastName}
            translate={false}
            style={{ fontSize: fontSize.medium, fontFamily: fontFamily.bold }}
          />
          <RatsText
            text={description}
            translate={false}
            style={{ fontSize: fontSize.regular, color: color.dark_grey }}
          />
        </View>
      </View>
    );
  };

  const renderUserCollapsible = (user: Admin) => {
    return (
      <View
        key={user.id}
        style={[ROW, CARD_STYLE, { marginBottom: 1, padding: normalize(15) }]}
      >
        <View>
          <View>
            {renderAvatarItem(
              user,
              user.superAdmin ? "Operator" : "Administrator"
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderCollapsibles = () => {
    const Collapsibles: React.JSX.Element[] = [];
    Collapsibles.push(
      ...map(admins, (admin) => {
        return renderUserCollapsible(admin);
      })
    );
    return Collapsibles;
  };

  const renderStar = (house: HouseListing) => {
    const number = isNil(house.rating) ? 3 : house.rating;
    return (
      <View
        style={[ROW, { marginHorizontal: normalize(15), alignItems: "center" }]}
      >
        <RatsIcon
          solid
          name="star"
          size={20}
          style={{ color: color.yellow, marginRight: 2 }}
        />
        <RatsText
          text={number + ".0"}
          translate={false}
          style={{ color: color.yellow }}
        />
      </View>
    );
  };

  const renderHouseSummary = (house: HouseListing) => {
    return (
      <WeekStatSummary
        // House health comes from residents' activity, so the listing has
        // none; the ring shows the share of beds open.
        percentage={openShare(house)}
        header="OPENINGS"
        rightSideContainer={{ justifyContent: "flex-start" }}
        rightSideContent={
          <View style={{ flex: 1 }}>
            <View style={{ ...ROW, flex: 1 }}>
              <View
                style={{
                  flex: 0.6,
                  justifyContent: "space-between",
                  marginRight: normalize(10),
                }}
              >
                <RatsText text="CERTIFIED" style={{ color: color.dark_grey }} />
                <RatsText
                  text="SPOTS OPEN"
                  style={{ color: color.dark_grey }}
                />
                <RatsText text="GENDER" style={{ color: color.dark_grey }} />
              </View>
              <View style={{ flex: 0.4, justifyContent: "space-between" }}>
                <RatsIcon
                  name={house.certified ? "check" : "times"}
                  size={20}
                  style={{ color: house.certified ? color.green : color.red }}
                />
                <RatsText
                  text={`${house.openBeds ?? 0} of ${house.maximumCapacity ?? 0}`}
                  style={{
                    fontSize: fontSize.regular,
                    color: color.black,
                    fontFamily: fontFamily.bold,
                  }}
                />
                <RatsText
                  text={house.gender}
                  style={{
                    fontSize: fontSize.regular,
                    color: color.black,
                    fontFamily: fontFamily.bold,
                  }}
                />
              </View>
            </View>
          </View>
        }
      >
        <View style={{ marginTop: normalize(15), marginBottom: normalize(5) }}>
          {renderApplyButton(house)}
        </View>
      </WeekStatSummary>
    );
  };

  const renderApplyButton = (house: HouseListing): React.JSX.Element | null => {
    return (
      <RatsButton
        testID="apply-button"
        title="APPLY"
        onPress={startApplication}
        light
        style={STAT_BUTTON_TEXT}
      />
    );
  };

  const renderIconSection = (
    house: HouseListing,
    value: "rooms" | "baths" | "wifi" | "beds"
  ) => {
    const ATTRIBUTES = {
      rooms: {
        icon: "archive",
        text: house.roomCount,
      },
      baths: {
        icon: "bath",
        text: house.baths,
      },
      wifi: {
        icon: "wifi",
        text: house.wifi,
      },
      beds: {
        icon: "bed",
        text: house.bedCount,
      },
    };
    return (
      <View>
        <View style={[ROW, { alignItems: "center", justifyContent: "center" }]}>
          <RatsIcon
            name={ATTRIBUTES[value].icon}
            size={normalize(25)}
            style={{ color: color.dark_grey, marginRight: normalize(5) }}
          />
          <RatsText
            text={ATTRIBUTES[value].text}
            translate={false}
            style={{
              fontSize: fontSize.medium,
              fontFamily: fontFamily.bold,
              color: color.light_black,
            }}
          />
        </View>
        <RatsText
          style={{ alignSelf: "center" as const, color: color.light_black }}
          text={
            value === "wifi" ? "WiFi" : camelCaseToDisplayForm(value)
          }
          translate={false}
        />
      </View>
    );
  };

  const renderSubheader = (house: HouseListing) => {
    const HOUSE_DESCRIPTION_TEXT: TextStyle = {
      fontSize: fontSize.regular,
      color: color.light_black,
    };
    const certified = house.certified;
    return (
      <View
        style={[
          CARD_STYLE,
          { marginBottom: 1, justifyContent: "space-between" },
        ]}
      >
        <RatsText
          text={house.name}
          translate={false}
          style={{ fontSize: fontSize.medium_large }}
        />
        <View style={[ROW, { paddingTop: normalize(5) }]}>
          <RatsText
            text="12 Step"
            translate={false}
            style={{ ...HOUSE_DESCRIPTION_TEXT, color: color.light_black }}
          />
          {renderStar(house)}
          <View style={ROW}>
            <RatsIcon
              name={certified ? "check" : "times"}
              style={{
                ...HOUSE_DESCRIPTION_TEXT,
                color: certified ? color.green : color.red,
                marginRight: normalize(5),
              }}
              size={20}
            />
            <RatsText
              style={HOUSE_DESCRIPTION_TEXT}
              text={certified ? "Certified" : "Not Certified"}
            />
          </View>
        </View>
        {renderAmenities(house)}
      </View>
    );
  };

  const renderCost = (house: HouseListing) => {
    const COST: ViewStyle = {
      justifyContent: "center",
      alignItems: "center",
    };
    const COST_TEXT: TextStyle = {
      color: "#f10c45",
      fontSize: fontSize.medium,
      fontFamily: fontFamily.bold,
    };
    const getCost = (cost: number | string | undefined) => `$${cost || 0}`;
    return (
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginBottom: 1,
            justifyContent: "space-between",
            paddingVertical: normalize(15),
            paddingHorizontal: normalize(30),
          },
        ]}
      >
        <View style={COST}>
          <RatsText text={getCost(house.monthlyRent)} style={COST_TEXT} />
          <RatsText
            text="MONTHLY"
            translate={false}
            style={{ color: color.light_black }}
          />
        </View>
        <View style={COST}>
          <RatsText text={getCost(house.weeklyRent)} style={COST_TEXT} />
          <RatsText
            text="WEEKLY"
            translate={false}
            style={{ color: color.light_black }}
          />
        </View>
        <View style={COST}>
          <RatsText text={getCost(house.depositsAndFees)} style={COST_TEXT} />
          <RatsText
            text="DEPOSITS"
            translate={false}
            style={{ color: color.light_black }}
          />
        </View>
      </View>
    );
  };

  const renderLocation = (house: HouseListing) => {
    return (
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginBottom: 1,
            padding: normalize(15),
            justifyContent: "space-between",
          },
        ]}
      >
        <View>
          <RatsText
            style={{ color: color.dark_grey, marginBottom: normalize(3) }}
            text="LOCATION"
          />
          <RatsText
            style={{
              fontFamily: fontFamily.bold,
              fontSize: fontSize.regular_medium,
            }}
            text={getAddressDisplay("", house.city, house.state, house.zip)}
          />
        </View>
        <TouchableOpacity
          onPress={
            house.phoneNumber ? () => callNumber(house.phoneNumber!) : undefined
          }
          activeOpacity={house.phoneNumber ? 0.2 : 1.0}
          style={{
            justifyContent: "center",
            paddingRight: normalize(20),
            alignItems: "center",
          }}
        >
          <RatsIcon
            name="phone"
            style={{ color: house.phoneNumber ? color.green : color.grey }}
            size={30}
          />
          <RatsText
            text={house.phoneNumber ? house.phoneNumber : "No Contact Info"}
            style={{
              color: house.phoneNumber ? color.green : color.grey,
              fontSize: fontSize.small,
            }}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderAmenities = (house: HouseListing) => {
    return (
      <View
        style={[
          ROW,
          {
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 20,
            paddingBottom: 5,
            paddingHorizontal: 5,
          },
        ]}
      >
        {["rooms", "baths", "wifi", "beds"].map((v) =>
          renderIconSection(house, v as any)
        )}
      </View>
    );
  };

  if (!house) {
    return null;
  }

  return (
    <RatsScrollView contentContainerStyle={contentStyle}>
      <ImageHeader
        image={house.imageUrl ? { uri: house.imageUrl } : houseImage}
        onHelpPress={() => {}}
        vacancy={(house.openBeds ?? 0) > 0}
        navigation={navigation}
      />
      {renderSubheader(house)}
      {renderCost(house)}
      {renderLocation(house)}
      {renderHouseSummary(house)}
      <View style={{ ...CARD_STYLE, marginBottom: 1 }}>
        <RatsText
          translate={false}
          text="ADMINISTRATORS"
          style={{ fontFamily: fontFamily.bold }}
        />
      </View>
      {renderCollapsibles()}
    </RatsScrollView>
  );
};

export default IntroHouseSummary;
