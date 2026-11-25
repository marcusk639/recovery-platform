import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { RootStackParamList } from '../../navigation/types';
import { useMayEditRentMoney } from '../../state/queries/houseTierQueries';
import { color, fontSize, normalize } from '../../styles/theme';
import { auth } from '../../../firebase-setup';
import GuestUpdateForm from './GuestUpdateForm';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * The selected resident's balance, for staff: Rent Owed and Chore Fees in
 * dollars (rent spec §4.6). It is how a manager corrects a charge or gives a
 * credit. It reuses GuestUpdateForm's money fields, which save from the figure
 * shown and, when a charge or payment landed meanwhile, say so and ask before
 * saving. Managers and above only, never on one's own record (the rules refuse
 * both: rentMoneyByManager, ownMoneyUnchanged), checked here too.
 */
const GuestBalanceScreen: React.FC<Props> = ({ navigation }) => {
  const { guest } = useSelectedGuest();
  const mayEdit = useMayEditRentMoney(guest?.houseId ?? '');
  const ownRecord = !!guest?.userId && guest.userId === auth.currentUser?.uid;

  return (
    <View style={styles.container} testID="guest-balance-screen">
      <ScreenHeader header="Balance" />
      {guest && mayEdit && !ownRecord ? (
        <GuestUpdateForm navigation={navigation} moneyOnly onSaved={navigation.goBack} />
      ) : (
        <View testID="guest-balance-not-allowed" style={styles.note}>
          <RatsText
            translate={false}
            text="Only a house manager or owner can change a resident's balance, and never their own."
            style={styles.noteText}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white },
  note: { padding: normalize(20) },
  noteText: { fontSize: fontSize.regular, color: color.dark_grey },
});

export default GuestBalanceScreen;
