import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsKeyboardToolbar } from '../../components/rats-keyboard';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { RootStackParamList } from '../../navigation/types';
import { useGuests } from '../../state/queries/guestQueries';
import { useUpdateHouse } from '../../state/queries/houseQueries';
import { useMayEditRentMoney } from '../../state/queries/houseTierQueries';
import { useRentPreview } from '../../state/queries/rentChargeQueries';
import { RentPreview } from '../../services/rentCharges';
import { CARD_STYLE, SAVE_BUTTON, color, fontSize, normalize } from '../../styles/theme';
import { asDollars, dollarsToCents, formatCents } from '../../util/money';
import { logException } from '../../util/logging';
import RentPreviewList from './RentPreviewList';
import {
  initialPriceText,
  parseRentPrice,
  RentSchedule,
  rentUpdateFor,
  scheduleOf,
  staleCustomRates,
} from './rentSettingsHelpers';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const CHOICES: Array<{ value: RentSchedule; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'off', label: 'Off' },
];

const Text = ({ text, style, testID }: { text: string; style?: object; testID?: string }) => (
  <View testID={testID}>
    <RatsText translate={false} text={text} style={style} />
  </View>
);

/** "Weekly: $175.00 a week", or that charging is off. */
function currentSummary(house: Parameters<typeof scheduleOf>[0]): string {
  const schedule = scheduleOf(house);
  if (schedule === 'off') return 'Rent charging is off. Residents are not charged.';
  const dollars = schedule === 'weekly' ? house.weeklyRent : house.monthlyRent;
  const price = formatCents(dollarsToCents(dollars ?? asDollars(0)));
  return `${schedule === 'weekly' ? 'Weekly' : 'Monthly'}: ${price} a ${schedule === 'weekly' ? 'week' : 'month'}`;
}

/**
 * House Settings → Rent (rent spec §4.1). A manager or owner sets the schedule and
 * the price in DOLLARS, sees what each current resident would be charged
 * (previewRentCharges), then confirms. Off ('both') charges nobody. Peer leaders see
 * it read-only, as the rules refuse their writes (rank >= 2); Oxford houses pay the
 * equal expense share, never a price schedule.
 */
const RentSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { house, houseId } = useSelectedHouse();
  const mayEdit = useMayEditRentMoney(houseId ?? '');
  const { data: guests = {} } = useGuests(houseId ?? '');
  const updateHouse = useUpdateHouse();
  const preview = useRentPreview();

  const [chosen, setChosen] = useState<RentSchedule | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<{ key: string; result: RentPreview } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!house || !houseId) return null;
  const schedule = chosen ?? scheduleOf(house);
  const priceText = typed ?? initialPriceText(house, schedule);
  const key = `${schedule}:${priceText}`;
  const shown = previewed?.key === key ? previewed.result : null;
  const oxford = house.houseType === 'oxford';

  const choose = (next: RentSchedule) => {
    setChosen(next);
    setTyped(initialPriceText(house, next));
    setError(null);
  };

  const save = async (values: ReturnType<typeof rentUpdateFor>) => {
    setSaving(true);
    try {
      await updateHouse.mutateAsync({ houseId, values });
      navigation.goBack();
    } catch (err) {
      logException(err);
      setError("Couldn't save rent settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onPreview = async () => {
    if (schedule === 'off') return;
    const parsed = parseRentPrice(priceText, schedule);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    try {
      const result = await preview.mutateAsync({
        houseId,
        frequency: schedule,
        price: parsed.dollars,
      });
      setPreviewed({ key, result });
    } catch {
      setError("Couldn't load the preview. Try again.");
    }
  };

  const onConfirm = () => {
    if (schedule === 'off') return;
    const parsed = parseRentPrice(priceText, schedule);
    if (parsed.ok) save(rentUpdateFor(schedule, parsed.dollars));
  };

  const readOnly = !mayEdit || oxford;

  return (
    <View style={styles.container} testID="rent-settings-screen">
      <ScreenHeader header="Rent" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text text={currentSummary(house)} style={styles.summary} testID="rent-current" />
        {oxford ? (
          <Text
            testID="rent-oxford-note"
            style={styles.note}
            text="Oxford houses split expenses equally among members, so they have no rent price schedule."
          />
        ) : null}
        {!mayEdit && !oxford ? (
          <Text
            testID="rent-read-only-note"
            style={styles.note}
            text="Only a house manager or owner can change rent."
          />
        ) : null}
        {readOnly ? null : (
          <>
            <View style={styles.choices}>
              {CHOICES.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  testID={`rent-schedule-${c.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: schedule === c.value }}
                  onPress={() => choose(c.value)}
                  style={[styles.choice, schedule === c.value && styles.choiceSelected]}
                >
                  <RatsText translate={false} text={c.label} style={styles.choiceText} />
                </TouchableOpacity>
              ))}
            </View>
            {schedule === 'off' ? (
              <RatsButton
                testID="rent-save-off-button"
                title="Turn off rent charges"
                disabled={saving}
                onPress={() => save(rentUpdateFor('off'))}
                containerStyle={SAVE_BUTTON}
              />
            ) : (
              <>
                <RatsText
                  translate={false}
                  text={`Price a ${schedule === 'weekly' ? 'week' : 'month'} ($)`}
                  style={styles.label}
                />
                <TextInput
                  testID="rent-price-input"
                  value={priceText}
                  onChangeText={(t) => {
                    setTyped(t);
                    setError(null);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="175"
                  style={styles.input}
                />
                <Text
                  style={styles.note}
                  text="A new price starts with the next period. Residents already here are first charged at the start of the next period; anyone who moves in later is charged for the days left in their first one."
                />
                <RatsButton
                  testID="rent-preview-button"
                  title="Preview charges"
                  light
                  disabled={preview.isPending}
                  onPress={onPreview}
                  containerStyle={SAVE_BUTTON}
                />
              </>
            )}
            {error ? <Text testID="rent-error" text={error} style={styles.error} /> : null}
            {shown && schedule !== 'off' ? (
              <>
                <RentPreviewList
                  residents={shown.residents}
                  stale={staleCustomRates(guests, schedule)}
                  schedule={schedule}
                />
                <RatsButton
                  testID="rent-confirm-button"
                  title="Confirm and save"
                  disabled={saving}
                  onPress={onConfirm}
                  containerStyle={SAVE_BUTTON}
                />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={[CARD_STYLE, styles.footer]}>
        <RatsButton
          testID="rent-done-button"
          title="Done"
          onPress={navigation.goBack}
          containerStyle={SAVE_BUTTON}
        />
      </SafeAreaView>
      <RatsKeyboardToolbar />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  content: { padding: normalize(10), flexGrow: 1 },
  summary: { fontSize: fontSize.medium, color: color.black, marginBottom: normalize(8) },
  note: { fontSize: fontSize.regular, color: color.dark_grey, marginVertical: normalize(6) },
  choices: { flexDirection: 'row', marginVertical: normalize(8) },
  choice: {
    flex: 1,
    paddingVertical: normalize(10),
    marginHorizontal: normalize(4),
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.baby_blue,
    backgroundColor: color.white,
    alignItems: 'center',
  },
  choiceSelected: { backgroundColor: color.light_blue },
  choiceText: { fontSize: fontSize.regular_medium, color: color.black },
  label: { fontSize: fontSize.regular, marginTop: normalize(6) },
  input: {
    backgroundColor: color.white,
    borderRadius: 6,
    padding: normalize(10),
    fontSize: fontSize.medium,
    marginVertical: normalize(6),
  },
  error: { color: color.red, fontSize: fontSize.regular, marginVertical: normalize(6) },
  footer: { paddingVertical: normalize(20) },
});

export default RentSettingsScreen;
