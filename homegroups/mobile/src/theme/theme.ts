import {Dimensions} from 'react-native';

const {width, height} = Dimensions.get('window');

export const theme = {
  colors: {
    // Primary Colors
    primary: {
      main: '#1976D2',
      light: '#90CAF9',
      dark: '#1565C0',
      contrast: '#FFFFFF',
    },
    // Secondary Colors
    secondary: {
      main: '#4CAF50',
      light: '#81C784',
      dark: '#388E3C',
      contrast: '#FFFFFF',
    },
    // Neutral Colors
    neutral: {
      white: '#FFFFFF',
      grey50: '#FAFAFA',
      grey100: '#F5F5F5',
      grey200: '#EEEEEE',
      grey300: '#E0E0E0',
      grey400: '#BDBDBD',
      grey500: '#9E9E9E',
      grey600: '#757575',
      grey700: '#616161',
      grey800: '#424242',
      grey900: '#212121',
      black: '#000000',
    },
    // Status Colors
    status: {
      success: '#4CAF50',
      warning: '#FFC107',
      error: '#F44336',
      info: '#2196F3',
    },
    // Background Colors
    background: {
      primary: '#FFFFFF',
      secondary: '#F5F5F5',
      tertiary: '#EEEEEE',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    fontSize: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      xxxl: 32,
    },
    lineHeight: {
      xs: 16,
      sm: 20,
      md: 24,
      lg: 28,
      xl: 32,
      xxl: 36,
      xxxl: 40,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
  },
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.18,
      shadowRadius: 1.0,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.3,
      shadowRadius: 4.65,
      elevation: 8,
    },
  },
  dimensions: {
    screenWidth: width,
    screenHeight: height,
  },
  animation: {
    duration: {
      fast: 200,
      normal: 300,
      slow: 500,
    },
    easing: {
      easeInOut: 'easeInOut',
      easeOut: 'easeOut',
      easeIn: 'easeIn',
    },
  },
};
