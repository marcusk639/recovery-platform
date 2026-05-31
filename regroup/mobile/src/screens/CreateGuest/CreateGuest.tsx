import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../../styles/theme';
import CreateGuestForm from './CreateGuestForm';
import { Guest } from '../../entities/Guest';

const CreateGuestScreen: React.FC = () => {
  return (
    <View style={styles.container} testID="create-guest-screen">
      <CreateGuestForm guest={new Guest()} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    backgroundColor: color.white,
  },
});

export default CreateGuestScreen;
