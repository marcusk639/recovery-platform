// src/util/__tests__/permissions.test.ts
//
// Unit tests for permissions.ts.
// Exports tested:
//   - checkLocationPermissions()
//   - requestLocationPermissions()
//   - checkImagePermissions()
//   - requestImagePermissions()
//   - checkStoragePermissions()
//   - requestStoragePermissions()
//   - checkAndRequestLocationPermissions()
//   - checkAndRequestImagePermissions()
//   - checkAndRequestStoragePermissions()
//
// Notes on strategy:
//   - permissions.ts has a module-level constant `const ios = Platform.OS === 'ios'`
//     that is evaluated once when the module is first required.  We use
//     jest.isolateModules() to re-evaluate the module after setting Platform.OS,
//     ensuring the constant picks up the right OS for each test group.
//   - react-native-permissions is mocked below with jest.fn() instances.
//   - PermissionsAndroid is overridden inside the react-native mock so its
//     methods are jest.fn() instances we can assert on.

jest.mock('react-native-permissions', () => ({
  __esModule: true,
  default: {
    check: jest.fn(),
    request: jest.fn(),
  },
  PERMISSIONS: {
    IOS: {
      LOCATION_ALWAYS: 'ios.permission.LOCATION_ALWAYS',
      LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
    },
    ANDROID: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    UNAVAILABLE: 'unavailable',
  },
}));

// The react-native preset already mocks the whole package. We only need to
// override PermissionsAndroid so its individual methods are jest.fn().
jest.mock('react-native', () => {
  const preset = jest.requireMock('react-native/jest/setup');
  // jest preset for react-native provides a module mock without TurboModules
  // We extend it with jest.fn() versions of PermissionsAndroid methods.
  const RN = jest.genMockFromModule('react-native') as any;
  RN.Platform = { OS: 'ios', Version: '14', select: (obj: any) => obj.ios ?? obj.default };
  RN.PermissionsAndroid = {
    check: jest.fn(),
    request: jest.fn(),
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      CAMERA: 'android.permission.CAMERA',
      READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
  };
  RN.Dimensions = { get: jest.fn(() => ({ width: 375, height: 812, scale: 1, fontScale: 1 })) };
  return RN;
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Set Platform.OS on the cached mock before isolating modules. */
function setPlatformOS(os: 'ios' | 'android') {
  const { Platform } = require('react-native');
  Platform.OS = os;
}

/** Load a fresh copy of permissions.ts with the given OS active. */
function loadPermissions(os: 'ios' | 'android') {
  setPlatformOS(os);
  let mod: typeof import('../permissions');
  jest.isolateModules(() => {
    mod = require('../permissions');
  });
  return mod!;
}

/** Get the jest.fn() instances from the mocked modules. */
function mocks() {
  const Permissions = require('react-native-permissions').default;
  const { PermissionsAndroid } = require('react-native');
  return {
    permCheck: Permissions.check as jest.Mock,
    permRequest: Permissions.request as jest.Mock,
    andCheck: PermissionsAndroid.check as jest.Mock,
    andRequest: PermissionsAndroid.request as jest.Mock,
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── checkLocationPermissions ─────────────────────────────────────────────────

describe('checkLocationPermissions', () => {
  it('iOS — true when LOCATION_ALWAYS is granted', async () => {
    const { permCheck } = mocks();
    permCheck
      .mockResolvedValueOnce('granted')  // LOCATION_ALWAYS
      .mockResolvedValueOnce('denied');  // LOCATION_WHEN_IN_USE
    const { checkLocationPermissions } = loadPermissions('ios');
    await expect(checkLocationPermissions()).resolves.toBe(true);
  });

  it('iOS — true when LOCATION_WHEN_IN_USE is granted', async () => {
    const { permCheck } = mocks();
    permCheck
      .mockResolvedValueOnce('denied')   // LOCATION_ALWAYS
      .mockResolvedValueOnce('granted'); // LOCATION_WHEN_IN_USE
    const { checkLocationPermissions } = loadPermissions('ios');
    await expect(checkLocationPermissions()).resolves.toBe(true);
  });

  it('iOS — false when both permissions are denied', async () => {
    const { permCheck } = mocks();
    permCheck.mockResolvedValue('denied');
    const { checkLocationPermissions } = loadPermissions('ios');
    await expect(checkLocationPermissions()).resolves.toBe(false);
  });

  it('Android — true when ACCESS_FINE_LOCATION is granted', async () => {
    const { permCheck } = mocks();
    permCheck.mockResolvedValueOnce('granted');
    const { checkLocationPermissions } = loadPermissions('android');
    await expect(checkLocationPermissions()).resolves.toBe(true);
  });

  it('Android — false when ACCESS_FINE_LOCATION is denied', async () => {
    const { permCheck } = mocks();
    permCheck.mockResolvedValueOnce('denied');
    const { checkLocationPermissions } = loadPermissions('android');
    await expect(checkLocationPermissions()).resolves.toBe(false);
  });
});

// ─── requestLocationPermissions ───────────────────────────────────────────────

describe('requestLocationPermissions', () => {
  it('iOS — returns true without calling PermissionsAndroid.request', async () => {
    const { andRequest } = mocks();
    const { requestLocationPermissions } = loadPermissions('ios');
    await expect(requestLocationPermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — returns true when request resolves to "granted"', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('granted');
    const { requestLocationPermissions } = loadPermissions('android');
    await expect(requestLocationPermissions()).resolves.toBe(true);
  });

  it('Android — returns false when request is denied', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('denied');
    const { requestLocationPermissions } = loadPermissions('android');
    await expect(requestLocationPermissions()).resolves.toBe(false);
  });
});

// ─── checkImagePermissions ────────────────────────────────────────────────────

describe('checkImagePermissions', () => {
  it('iOS — returns true without calling PermissionsAndroid.check', async () => {
    const { andCheck } = mocks();
    const { checkImagePermissions } = loadPermissions('ios');
    await expect(checkImagePermissions()).resolves.toBe(true);
    expect(andCheck).not.toHaveBeenCalled();
  });

  it('Android — returns true when CAMERA is granted', async () => {
    const { andCheck } = mocks();
    andCheck.mockResolvedValueOnce(true);
    const { checkImagePermissions } = loadPermissions('android');
    await expect(checkImagePermissions()).resolves.toBe(true);
  });

  it('Android — returns false when CAMERA is denied', async () => {
    const { andCheck } = mocks();
    andCheck.mockResolvedValueOnce(false);
    const { checkImagePermissions } = loadPermissions('android');
    await expect(checkImagePermissions()).resolves.toBe(false);
  });
});

// ─── requestImagePermissions ─────────────────────────────────────────────────

describe('requestImagePermissions', () => {
  it('iOS — returns true without calling PermissionsAndroid.request', async () => {
    const { andRequest } = mocks();
    const { requestImagePermissions } = loadPermissions('ios');
    await expect(requestImagePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — returns true when CAMERA request is granted', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('granted');
    const { requestImagePermissions } = loadPermissions('android');
    await expect(requestImagePermissions()).resolves.toBe(true);
  });

  it('Android — returns false when CAMERA request is denied', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('denied');
    const { requestImagePermissions } = loadPermissions('android');
    await expect(requestImagePermissions()).resolves.toBe(false);
  });
});

// ─── checkStoragePermissions ─────────────────────────────────────────────────

describe('checkStoragePermissions', () => {
  it('iOS — returns true without calling PermissionsAndroid.check', async () => {
    const { andCheck } = mocks();
    const { checkStoragePermissions } = loadPermissions('ios');
    await expect(checkStoragePermissions()).resolves.toBe(true);
    expect(andCheck).not.toHaveBeenCalled();
  });

  it('Android — returns true when READ_EXTERNAL_STORAGE is granted', async () => {
    const { andCheck } = mocks();
    andCheck.mockResolvedValueOnce(true);
    const { checkStoragePermissions } = loadPermissions('android');
    await expect(checkStoragePermissions()).resolves.toBe(true);
  });

  it('Android — returns false when READ_EXTERNAL_STORAGE is denied', async () => {
    const { andCheck } = mocks();
    andCheck.mockResolvedValueOnce(false);
    const { checkStoragePermissions } = loadPermissions('android');
    await expect(checkStoragePermissions()).resolves.toBe(false);
  });
});

// ─── requestStoragePermissions ────────────────────────────────────────────────

describe('requestStoragePermissions', () => {
  it('iOS — returns true without calling PermissionsAndroid.request', async () => {
    const { andRequest } = mocks();
    const { requestStoragePermissions } = loadPermissions('ios');
    await expect(requestStoragePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — returns true when request is granted', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('granted');
    const { requestStoragePermissions } = loadPermissions('android');
    await expect(requestStoragePermissions()).resolves.toBe(true);
  });

  it('Android — returns false when request is denied', async () => {
    const { andRequest } = mocks();
    andRequest.mockResolvedValueOnce('denied');
    const { requestStoragePermissions } = loadPermissions('android');
    await expect(requestStoragePermissions()).resolves.toBe(false);
  });
});

// ─── checkAndRequestLocationPermissions ──────────────────────────────────────

describe('checkAndRequestLocationPermissions', () => {
  describe('on iOS', () => {
    it('returns true immediately when already granted (skips request)', async () => {
      const { permCheck, permRequest } = mocks();
      permCheck
        .mockResolvedValueOnce('granted') // LOCATION_ALWAYS
        .mockResolvedValueOnce('denied');
      const { checkAndRequestLocationPermissions } = loadPermissions('ios');
      const result = await checkAndRequestLocationPermissions();
      expect(result).toBe(true);
      expect(permRequest).not.toHaveBeenCalled();
    });

    it('requests LOCATION_WHEN_IN_USE when not granted, returns true on success', async () => {
      const { permCheck, permRequest } = mocks();
      permCheck.mockResolvedValue('denied');
      permRequest.mockResolvedValueOnce('granted');
      const { checkAndRequestLocationPermissions } = loadPermissions('ios');
      await expect(checkAndRequestLocationPermissions()).resolves.toBe(true);
      expect(permRequest).toHaveBeenCalled();
    });

    it('returns false when iOS request is denied', async () => {
      const { permCheck, permRequest } = mocks();
      permCheck.mockResolvedValue('denied');
      permRequest.mockResolvedValueOnce('denied');
      const { checkAndRequestLocationPermissions } = loadPermissions('ios');
      await expect(checkAndRequestLocationPermissions()).resolves.toBe(false);
    });
  });

  describe('on Android', () => {
    it('calls PermissionsAndroid.request when PermissionsAndroid.check is false', async () => {
      const { permCheck, andCheck, andRequest } = mocks();
      permCheck.mockResolvedValueOnce('denied'); // checkLocationPermissions
      andCheck.mockResolvedValueOnce(false);
      andRequest.mockResolvedValueOnce('granted');
      const { checkAndRequestLocationPermissions } = loadPermissions('android');
      await checkAndRequestLocationPermissions();
      expect(andRequest).toHaveBeenCalled();
    });

    it('skips PermissionsAndroid.request when PermissionsAndroid.check is true', async () => {
      const { permCheck, andCheck, andRequest } = mocks();
      permCheck.mockResolvedValueOnce('denied');
      andCheck.mockResolvedValueOnce(true);
      const { checkAndRequestLocationPermissions } = loadPermissions('android');
      await checkAndRequestLocationPermissions();
      expect(andRequest).not.toHaveBeenCalled();
    });
  });
});

// ─── checkAndRequestImagePermissions ─────────────────────────────────────────

describe('checkAndRequestImagePermissions', () => {
  it('iOS — returns true without requesting anything', async () => {
    const { andRequest } = mocks();
    const { checkAndRequestImagePermissions } = loadPermissions('ios');
    await expect(checkAndRequestImagePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — returns true when already granted (no request)', async () => {
    const { andCheck, andRequest } = mocks();
    andCheck.mockResolvedValueOnce(true);
    const { checkAndRequestImagePermissions } = loadPermissions('android');
    await expect(checkAndRequestImagePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — requests and returns true when not already granted', async () => {
    const { andCheck, andRequest } = mocks();
    andCheck.mockResolvedValueOnce(false);
    andRequest.mockResolvedValueOnce('granted');
    const { checkAndRequestImagePermissions } = loadPermissions('android');
    await expect(checkAndRequestImagePermissions()).resolves.toBe(true);
    expect(andRequest).toHaveBeenCalled();
  });
});

// ─── checkAndRequestStoragePermissions ───────────────────────────────────────

describe('checkAndRequestStoragePermissions', () => {
  it('iOS — returns true without requesting anything', async () => {
    const { andRequest } = mocks();
    const { checkAndRequestStoragePermissions } = loadPermissions('ios');
    await expect(checkAndRequestStoragePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — returns true when already granted (no request)', async () => {
    const { andCheck, andRequest } = mocks();
    andCheck.mockResolvedValueOnce(true);
    const { checkAndRequestStoragePermissions } = loadPermissions('android');
    await expect(checkAndRequestStoragePermissions()).resolves.toBe(true);
    expect(andRequest).not.toHaveBeenCalled();
  });

  it('Android — requests and returns true when not already granted', async () => {
    const { andCheck, andRequest } = mocks();
    andCheck.mockResolvedValueOnce(false);
    andRequest.mockResolvedValueOnce('granted');
    const { checkAndRequestStoragePermissions } = loadPermissions('android');
    await expect(checkAndRequestStoragePermissions()).resolves.toBe(true);
    expect(andRequest).toHaveBeenCalled();
  });
});
