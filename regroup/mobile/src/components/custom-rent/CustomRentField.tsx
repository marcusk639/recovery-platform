import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { RatsText } from '../rats-text';
import RatsButton from '../rats-button/rats-button';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';
import { useUpdateGuest } from '../../state/queries/guestQueries';
import { useMayEditRentMoney } from '../../state/queries/houseTierQueries';
import { MAX_RENT_DOLLARS, scheduleOf } from '../../screens/HouseSettings/rentSettingsHelpers';
import { color, fontSize, normalize } from '../../styles/theme';
import { asCents, dollarsToCents, formatCents, parseDollarsField } from '../../util/money';
import { logException } from '../../util/logging';

interface Props {
  guest: Guest;
  house: House;
  /** The signed-in account: nobody sets their own rate (rules: ownMoneyUnchanged). */
  currentUserId: string;
}

const per = (f: 'weekly' | 'monthly') => (f === 'weekly' ? 'week' : 'month');

const Line = ({ text, testID, style }: { text: string; testID?: string; style?: object }) => (
  <View testID={testID}>
    <RatsText translate={false} text={text} style={style ?? styles.detail} />
  </View>
);

/**
 * A resident's own rent rate, on their profile (rent spec §4.2). The manager types
 * DOLLARS; it is stored as customRent { amountCents, frequency } with the house's
 * current schedule, and the server uses it only while the house charges on that
 * schedule. $0 is allowed (a scholarship bed); clearing writes null. Shown only to
 * a manager or above, and never on their own record (rules: rentMoneyByManager).
 */
const CustomRentField: React.FC<Props> = ({ guest, house, currentUserId }) => {
  const mayEdit = useMayEditRentMoney(house.id);
  const { mutateAsync: updateGuest } = useUpdateGuest();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!mayEdit || (!!guest.userId && guest.userId === currentUserId)) return null;
  if (house.houseType === 'oxford') return null;

  const schedule = scheduleOf(house);
  const custom = guest.customRent ?? null;
  const housePrice = schedule === 'weekly' ? house.weeklyRent : house.monthlyRent;

  const write = async (customRent: Guest['customRent']) => {
    setSaving(true);
    setError(null);
    try {
      await updateGuest({
        guest,
        updatedGuest: { id: guest.id, houseId: guest.houseId, customRent },
      });
      setText('');
    } catch (err) {
      logException(err);
      setError("Couldn't save the rate. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    if (schedule === 'off') return;
    const parsed = parseDollarsField(text);
    if (!parsed.ok) {
      setError('Enter a rate like 600 or 600.50');
      return;
    }
    const max = MAX_RENT_DOLLARS[schedule];
    if (parsed.cents > max * 100) {
      setError(`A ${schedule} rate can be at most $${max.toLocaleString('en-US')}`);
      return;
    }
    write({ amountCents: parsed.cents, frequency: schedule });
  };

  let status: string;
  if (custom) {
    const rate = `Own rate: ${formatCents(asCents(custom.amountCents))} a ${per(custom.frequency)}`;
    status =
      schedule !== 'off' && custom.frequency !== schedule
        ? `${rate}. Not used while rent is ${schedule}.`
        : rate;
  } else {
    status =
      schedule === 'off'
        ? 'Pays the house price'
        : `Pays the house price: ${formatCents(dollarsToCents(housePrice))} a ${per(schedule)}`;
  }

  return (
    <View style={styles.card} testID="custom-rent-field">
      <RatsText translate={false} text="Rent rate" style={styles.title} />
      <Line text={status} testID="custom-rent-status" />
      {schedule === 'off' ? (
        <Line
          testID="custom-rent-needs-schedule"
          text="Set the house's rent schedule first (House Settings → Rent)."
        />
      ) : (
        <>
          <TextInput
            testID="custom-rent-input"
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={`Own rate a ${per(schedule)} ($)`}
            style={styles.input}
          />
          <RatsButton
            testID="custom-rent-save"
            title="Set own rate"
            disabled={saving}
            onPress={onSave}
          />
        </>
      )}
      {custom ? (
        <RatsButton
          testID="custom-rent-clear"
          title="Use the house price"
          light
          disabled={saving}
          onPress={() => write(null)}
        />
      ) : null}
      {error ? <Line text={error} testID="custom-rent-error" style={styles.error} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.white,
    borderRadius: 6,
    padding: normalize(10),
    marginVertical: normalize(6),
    alignSelf: 'stretch',
  },
  title: { fontSize: fontSize.medium, color: color.black },
  detail: { fontSize: fontSize.regular, color: color.dark_grey, marginVertical: normalize(4) },
  input: {
    backgroundColor: color.light_grey,
    borderRadius: 6,
    padding: normalize(10),
    fontSize: fontSize.medium,
    marginVertical: normalize(6),
  },
  error: { fontSize: fontSize.regular, color: color.red, marginVertical: normalize(4) },
});

export default CustomRentField;
