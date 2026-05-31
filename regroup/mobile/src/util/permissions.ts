import Geolocation from '@react-native-community/geolocation';
import Permissions, { PERMISSIONS, RESULTS } from 'react-native-permissions';
import { PermissionsAndroid, Platform } from 'react-native';

const ios = Platform.OS === 'ios';

export const checkLocationPermissions = async () => {
  if (Platform.OS === 'ios') {
    const always = await Permissions.check(PERMISSIONS.IOS.LOCATION_ALWAYS);
    const whenInUse = await Permissions.check(
      PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    );
    return always === RESULTS.GRANTED || whenInUse === RESULTS.GRANTED;
  }

  if (Platform.OS === 'android') {
    const permission = await Permissions.check(
      PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    );
    return permission === RESULTS.GRANTED;
  }
};

export const requestLocationPermissions = async () => {
  const status = ios
    ? 'granted'
    : await PermissionsAndroid.request(
        'android.permission.ACCESS_FINE_LOCATION',
      );
  return status === 'granted';
};

export const checkImagePermissions = async () => {
  return ios || PermissionsAndroid.check('android.permission.CAMERA');
};

export const requestImagePermissions = async () => {
  const status = ios
    ? 'granted'
    : await PermissionsAndroid.request('android.permission.CAMERA');
  return status === 'granted';
};

export const checkStoragePermissions = async () => {
  return (
    ios || PermissionsAndroid.check('android.permission.READ_EXTERNAL_STORAGE')
  );
};

export const requestStoragePermissions = async () => {
  const status = ios
    ? 'granted'
    : await PermissionsAndroid.request(
        'android.permission.READ_EXTERNAL_STORAGE',
      );
  return status === 'granted';
};

export const checkAndRequestLocationPermissions = async () => {
  let permission = await checkLocationPermissions();

  if (!permission && Platform.OS === 'ios') {
    const result = await Permissions.request(
      PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
    );
    return result === RESULTS.GRANTED;
    //   Geolocation.requestAuthorization();
    //   Geolocation.setRNConfiguration({
    //     skipPermissionRequests: false,
    //     authorizationLevel: 'whenInUse',
    //  });
  }

  if (Platform.OS === 'android') {
    const permission = await PermissionsAndroid.check(
      'android.permission.ACCESS_FINE_LOCATION',
    );
    if (!permission) {
      return PermissionsAndroid.request(
        'android.permission.ACCESS_FINE_LOCATION',
      );
    }
  }

  return permission;
};

export const checkAndRequestImagePermissions = async () => {
  let permission = ios || (await checkImagePermissions());
  if (!permission) {
    permission = await requestImagePermissions();
  }
  return permission;
};

export const checkAndRequestStoragePermissions = async () => {
  let permission = ios || (await checkStoragePermissions());
  if (!permission) {
    permission = await requestStoragePermissions();
  }
  return permission;
};
