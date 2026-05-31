import React from 'react';
import {View, Text, StyleSheet, ActivityIndicator, Image} from 'react-native';

const SplashScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/logo.jpg')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Homegroups</Text>
      <Text style={styles.subtitle}>Supporting your recovery journey</Text>
      <ActivityIndicator style={styles.loading} size="large" color="#2196F3" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 32,
    textAlign: 'center',
  },
  loading: {
    marginTop: 24,
  },
});

export default SplashScreen;
