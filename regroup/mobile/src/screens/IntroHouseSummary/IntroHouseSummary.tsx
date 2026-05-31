import React, { useState, useCallback } from 'react';
import { House } from '../../entities/House';
import { View, ViewStyle, TouchableOpacity, TextStyle } from 'react-native';
import RatsScrollView from '../../components/rats-scroll-view';
import { RatsText } from '../../components/rats-text';
import {
  fontSize,
  ROW,
  CARD_STYLE,
  normalize,
  color,
  fontFamily,
} from '../../styles/theme';
import { Routes, AuthStackNavigationProp } from '../../navigation/types';
import Admin from '../../entities/Admin';
import {
  initializeInvitation,
  setSignUpRole,
} from '../../state/slices/userSlice';
import { isNil, map, size } from 'lodash';
import { Admins } from '../../types';
import RatsAvatar from '../../components/rats-avatar';
import { callNumber } from '../../util/phone';
import ImageHeader from '../../components/image-header';
import { getAddressDisplay } from '../../util/address';
import { RatsIcon } from '../../components/rats-icon';
import { houseImage } from '../../../assets/index';
import WeekStatSummary from '../../components/week-stat-summary';
import { camelCaseToDisplayForm } from '../../util/display';
import {
  HEALTH_ICON_MAP,
  getHealthByPercentage,
  HEALTH_STATUS_MAP,
} from '../../util/guest';
import { calculateHouseHealth } from '../../util/house';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';

interface Props {
  navigation: AuthStackNavigationProp;
}

const contentStyle: ViewStyle = {
  flexGrow: 1,
  alignItems: 'center',
  justifyContent: 'flex-start',
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

  const dispatch = useAppDispatch();

  // RTK Typed Selectors (no more 'as any')
  const { house } = useSelectedHouse();
  const admins = useAppSelector(state => state.admin.houseAdmins);

  const startSignUp = useCallback(() => {
    if (!house) return;
    // Create a minimal Invitation object - actual values will be set during signup
    const invitation = {
      houseId: house.id,
      type: 'guest' as const,
      inviterId: '',
      email: '',
      initialPhase: '',
      expirationDate: new Date(),
      ownerId: '',
      id: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch(initializeInvitation(invitation));
    dispatch(setSignUpRole('guest'));
    navigation.navigate(Routes.Signup, {});
  }, [dispatch, house, navigation]);

  const toggleCollapsible = useCallback(
    (user: Admin) => () => {
      setCollapsedUsers(prevState => {
        const newCollapsedUsers: { [id: string]: boolean } = {};
        Object.keys(prevState).forEach(key => {
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
    [],
  );

  const renderAvatarItem = (user: Admin, description: string) => {
    return (
      <View style={[ROW]}>
        <RatsAvatar
          name={user.firstName + ' ' + user.lastName}
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
            text={user.firstName + ' ' + user.lastName}
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
        style={[ROW, CARD_STYLE, { marginBottom: 1, padding: normalize(15) }]}>
        <View>
          <View>
            {renderAvatarItem(
              user,
              user.superAdmin ? 'Operator' : 'Administrator',
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderCollapsibles = () => {
    const Collapsibles: JSX.Element[] = [];
    Collapsibles.push(
      ...map(admins, admin => {
        return renderUserCollapsible(admin);
      }),
    );
    return Collapsibles;
  };

  const renderStar = (house: House) => {
    const number = isNil(house.rating) ? 3 : house.rating;
    return (
      <View
        style={[
          ROW,
          { marginHorizontal: normalize(15), alignItems: 'center' },
        ]}>
        <RatsIcon
          solid
          name="star"
          size={20}
          style={{ color: color.yellow, marginRight: 2 }}
        />
        <RatsText
          text={number + '.0'}
          translate={false}
          style={{ color: color.yellow }}
        />
      </View>
    );
  };

  const renderHouseSummary = (house: House) => {
    return (
      <WeekStatSummary
        percentage={calculateHouseHealth(house.health)}
        header="HOUSE HEALTH"
        rightSideContainer={{ justifyContent: 'flex-start' }}
        rightSideContent={
          <View style={{ flex: 1 }}>
            <View style={{ ...ROW, flex: 1 }}>
              <View
                style={{
                  flex: 0.6,
                  justifyContent: 'space-between',
                  marginRight: normalize(10),
                }}>
                <RatsText text="CERTIFIED" style={{ color: color.dark_grey }} />
                <RatsText
                  text="SPOTS OPEN"
                  style={{ color: color.dark_grey }}
                />
                <RatsText text="GENDER" style={{ color: color.dark_grey }} />
              </View>
              <View style={{ flex: 0.4, justifyContent: 'space-between' }}>
                <RatsIcon
                  name={house.certified ? 'check' : 'times'}
                  size={20}
                  style={{ color: house.certified ? color.green : color.red }}
                />
                <RatsText
                  text={`${house.maximumCapacity - house.currentCapacity} of ${
                    house.maximumCapacity
                  }`}
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
        }>
        <View style={{ marginTop: normalize(15), marginBottom: normalize(5) }}>
          {renderApplyButton(house)}
        </View>
      </WeekStatSummary>
    );
  };

  const renderApplyButton = (house: House): JSX.Element | null => {
    // return <RatsButton title="APPLY" onPress={() => { }} light style={STAT_BUTTON_TEXT} />;
    return null;
  };

  const renderIconSection = (
    house: House,
    value: 'rooms' | 'baths' | 'wifi' | 'beds' | 'health',
  ) => {
    const ATTRIBUTES = {
      rooms: {
        icon: 'archive',
        text: size(house.rooms),
      },
      baths: {
        icon: 'bath',
        text: house.baths,
      },
      wifi: {
        icon: 'wifi',
        text: house.wifi,
      },
      beds: {
        icon: 'bed',
        text: map(house.rooms, room => room.beds).length,
      },
      health: {
        icon: HEALTH_ICON_MAP[
          getHealthByPercentage(calculateHouseHealth(house.health))
        ],
        text: HEALTH_STATUS_MAP[
          getHealthByPercentage(calculateHouseHealth(house.health))
        ].toLowerCase(),
      },
    };
    return (
      <View>
        <View style={[ROW, { alignItems: 'center', justifyContent: 'center' }]}>
          <RatsIcon
            name={ATTRIBUTES[value].icon}
            size={normalize(25)}
            style={{ color: color.dark_grey, marginRight: normalize(5) }}
          />
          {value !== 'health' && (
            <RatsText
              text={ATTRIBUTES[value].text}
              translate={false}
              style={{
                fontSize: fontSize.medium,
                fontFamily: fontFamily.bold,
                color: color.light_black,
              }}
            />
          )}
        </View>
        <RatsText
          style={{ alignSelf: 'center' as const, color: color.light_black }}
          text={
            value === 'wifi'
              ? 'WiFi'
              : value === 'health'
              ? camelCaseToDisplayForm(ATTRIBUTES[value].text)
              : camelCaseToDisplayForm(value)
          }
          translate={false}
        />
      </View>
    );
  };

  const renderSubheader = (house: House) => {
    const HOUSE_DESCRIPTION_TEXT: TextStyle = {
      fontSize: fontSize.regular,
      color: color.light_black,
    };
    const number = Math.round(Math.random());
    return (
      <View
        style={[
          CARD_STYLE,
          { marginBottom: 1, justifyContent: 'space-between' },
        ]}>
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
              name={number ? 'check' : 'times'}
              style={{
                ...HOUSE_DESCRIPTION_TEXT,
                color: number ? color.green : color.red,
                marginRight: normalize(5),
              }}
              size={20}
            />
            <RatsText
              style={HOUSE_DESCRIPTION_TEXT}
              text={number ? 'Certified' : 'Not Certified'}
            />
          </View>
        </View>
        {renderAmenities(house)}
      </View>
    );
  };

  const renderCost = (house: House) => {
    const COST: ViewStyle = {
      justifyContent: 'center',
      alignItems: 'center',
    };
    const COST_TEXT: TextStyle = {
      color: '#f10c45',
      fontSize: fontSize.medium,
      fontFamily: fontFamily.bold,
    };
    const getCost = (cost: number | string) => `$${cost || 0}`;
    return (
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginBottom: 1,
            justifyContent: 'space-between',
            paddingVertical: normalize(15),
            paddingHorizontal: normalize(30),
          },
        ]}>
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

  const renderLocation = (house: House) => {
    return (
      <View
        style={[
          CARD_STYLE,
          ROW,
          {
            marginBottom: 1,
            padding: normalize(15),
            justifyContent: 'space-between',
          },
        ]}>
        <View>
          <RatsText
            style={{ color: color.dark_grey, marginBottom: normalize(3) }}
            text="LOCATION"
          />
          <RatsText
            style={{
              fontFamily: fontFamily.bold,
              fontSize: fontSize.regular_medium,
              marginBottom: normalize(3),
            }}
            text={house.street}
          />
          <RatsText
            style={{
              fontFamily: fontFamily.bold,
              fontSize: fontSize.regular_medium,
            }}
            text={getAddressDisplay('', house.city, house.state, house.zip)}
          />
        </View>
        <TouchableOpacity
          onPress={
            house.phoneNumber ? () => callNumber(house.phoneNumber!) : undefined
          }
          activeOpacity={house.phoneNumber ? 0.2 : 1.0}
          style={{
            justifyContent: 'center',
            paddingRight: normalize(20),
            alignItems: 'center',
          }}>
          <RatsIcon
            name="phone"
            style={{ color: house.phoneNumber ? color.green : color.grey }}
            size={30}
          />
          <RatsText
            text={house.phoneNumber ? house.phoneNumber : 'No Contact Info'}
            style={{
              color: house.phoneNumber ? color.green : color.grey,
              fontSize: fontSize.small,
            }}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderAmenities = (house: House) => {
    return (
      <View
        style={[
          ROW,
          {
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 20,
            paddingBottom: 5,
            paddingHorizontal: 5,
          },
        ]}>
        {['rooms', 'baths', 'wifi', 'beds'].map(v =>
          renderIconSection(house, v as any),
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
        vacancy={house.currentCapacity < house.maximumCapacity}
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
