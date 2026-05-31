const path = require('path');

module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
    },
    android: {},
  },
  dependencies: {
    'react-native-vector-icons': {
      platforms: {
        ios: null,
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
