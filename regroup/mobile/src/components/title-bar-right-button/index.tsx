import React from 'react';
import {
  TouchableOpacity,
  ImageProps,
  View,
  ImageSourcePropType,
  Image,
} from 'react-native';
import { normalize, color } from '../../styles/theme';
import { connect } from 'react-redux';
import routes, { tabs } from '../../constants/routes';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import RatsAvatar from '../rats-avatar';
import Admin from '../../entities/Admin';
import { placeholderUserIcon, circleLogo } from '../../../assets';
import { User } from '../../entities/User';
import { Routes } from '../../navigation/types';
interface Props {
  imageStyle?: any;
  imageSource: ImageSourcePropType;
  name: string;
  onPress: (event: any) => void;
  clickable?: boolean;
}

const TitleBarRightButton = (props: Props & Partial<ImageProps>) => {
  const { imageStyle, onPress, imageSource, name, clickable = true } = props;
  return (
    <TouchableOpacity
      activeOpacity={clickable ? 0.2 : 1.0}
      onPress={clickable ? onPress : undefined}
      style={{ paddingRight: normalize(10) }}>
      <RatsAvatar
        name={name}
        source={imageSource}
        style={[
          {
            height: normalize(35),
            width: normalize(35),
            borderRadius: normalize(35 / 2),
            tintColor: color.white,
          },
          imageStyle,
        ]}
      />
    </TouchableOpacity>
  );
};

interface ConnectedTitleBarButtonProps {
  firstButtonSource?: Guest & House;
  secondButtonSource?: any;
  house: House;
  user: Guest | Admin;
  guest: Guest;
  userEntity: User;
  navigation?: any;
}

const mapStateToProps = (state: any) => {
  return {
    firstButtonSource: state.guests.selectedGuest,
    secondButtonSource: state.user && state.user.user?.isAdmin,
    house: state.houses.selectedHouse,
    guest: state.guests.selectedGuest,
    user: state.admin.userAsAdmin || state.guests.userAsGuest,
    userEntity: state.user.user,
  };
};

const ConnectedTitleBarButton = connect(
  mapStateToProps,
  null,
)(
  ({
    firstButtonSource,
    secondButtonSource,
    house,
  }: ConnectedTitleBarButtonProps) => {
    const navigation = useNavigation<NavigationProp<ParamListBase>>();

    return (
      <View style={{ flexDirection: 'row' }}>
        {firstButtonSource && (
          <TitleBarRightButton
            name={
              firstButtonSource.firstName + ' ' + firstButtonSource.lastName
            }
            imageStyle={{ tintColor: null }}
            onPress={() => navigation.navigate(Routes.Personal)}
            imageSource={{ uri: firstButtonSource?.avatar }}
          />
        )}
      </View>
    );
  },
);

const HouseSelectionButton = connect(
  mapStateToProps,
  null,
)(({ house, userEntity }: ConnectedTitleBarButtonProps) => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  return (
    <TitleBarRightButton
      name={house.name}
      clickable={userEntity && userEntity.isAdmin}
      imageStyle={{
        tintColor: undefined,
        height: normalize(40),
        width: normalize(40),
        borderRadius: normalize(40 / 2),
      }}
      onPress={() => navigation.navigate(Routes.HouseList)}
      imageSource={{ uri: house?.avatar }}
    />
  );
});

const GuestSelectionButton = connect(
  mapStateToProps,
  null,
)(({ guest }: ConnectedTitleBarButtonProps) => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  return (
    <TitleBarRightButton
      name={guest.firstName + ' ' + guest.lastName}
      imageStyle={{
        tintColor: undefined,
        marginRight: 5,
        height: normalize(40),
        width: normalize(40),
        borderRadius: normalize(40 / 2),
      }}
      onPress={() => navigation.navigate(Routes.GuestList)}
      imageSource={{ uri: guest?.avatar }}
    />
  );
});

const UserPersonalButton = connect(
  mapStateToProps,
  null,
)(({ user }: ConnectedTitleBarButtonProps) => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const size = normalize(30);
  if (user) {
    return (
      <TitleBarRightButton
        name={user.firstName + ' ' + user.lastName}
        imageStyle={{
          tintColor: undefined,
          height: size,
          width: size,
          borderRadius: size / 2,
        }}
        onPress={() => navigation.navigate(Routes.Personal)}
        imageSource={{ uri: user.avatar }}
      />
    );
  } else {
    return (
      <Image
        style={{
          height: normalize(35),
          width: normalize(35),
          borderRadius: 35 / 2,
        }}
        source={circleLogo}
        resizeMethod="resize"
        resizeMode="cover"
      />
    );
  }
});

export {
  TitleBarRightButton,
  ConnectedTitleBarButton,
  HouseSelectionButton,
  UserPersonalButton,
  GuestSelectionButton,
};
