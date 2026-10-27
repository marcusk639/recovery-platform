const path = require('path');

module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
    },
    android: {},
  },
  dependencies: {
    // Android links only v10 (the one the JS imports and fonts.gradle uses), iOS
    // only v11's common. Both packages' Android sides define a VectorIconsPackage,
    // and autolinking both makes the generated PackageList.java ambiguous.
    'react-native-vector-icons': {
      platforms: {
        ios: null,
      },
    },
    '@react-native-vector-icons/common': {
      platforms: {
        android: null,
      },
    },
    // The deprecated @react-native-community/clipboard and its successor
    // @react-native-clipboard/clipboard both ship
    // com.reactnativecommunity.clipboard.ClipboardPackage (a duplicate class on
    // Android) and the same RNCClipboard native module. Link only the successor;
    // the old package's JS reaches it through NativeModules.RNCClipboard.
    '@react-native-community/clipboard': {
      platforms: {
        android: null,
      },
    },
    '@flyskywhy/react-native-gcanvas': {
      platforms: {
        android: {
          packageImportPath:
            'import com.taobao.gcanvas.bridges.rn.GReactPackage;',
        },
      },
    },
  },
  assets: ['./node_modules/react-native-vector-icons/Fonts'],
};
