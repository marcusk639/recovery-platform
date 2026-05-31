import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ViewStyle,
  ListRenderItemInfo,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries';
import {
  useChoreRotation,
  useSetRotationOrder,
  useAdvanceRotation,
} from '../../state/queries/choreRotationQueries';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import {
  color,
  fontSize,
  normalize,
  fontFamily,
  CARD_STYLE,
  SAVE_BUTTON,
} from '../../styles/theme';
import { Guest } from '../../entities/Guest';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const ITEM_STYLE: ViewStyle = {
  ...CARD_STYLE,
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: normalize(12),
  paddingHorizontal: normalize(16),
  marginBottom: 2,
};

const ARROW_BTN: ViewStyle = {
  paddingHorizontal: normalize(12),
  paddingVertical: normalize(6),
};

const ChoreRotationSetupScreen: React.FC<Props> = ({ navigation }) => {
  const { house } = useSelectedHouse();
  const houseId = house?.id ?? '';

  const { data: rotation, isLoading: rotationLoading } = useChoreRotation(
    houseId,
    !!houseId,
  );
  const { data: queryGuests, isLoading: guestsLoading } = useGuests(
    houseId,
    !!houseId,
  );

  const setRotation = useSetRotationOrder(houseId);
  const advanceRotation = useAdvanceRotation(houseId);

  const allGuests = queryGuests ? (Object.values(queryGuests) as Guest[]) : [];
  const activeGuests = allGuests.filter(
    g => g.status === 'active' || !g.status,
  );

  // Ordered guest ID list for the rotation
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedChore, setSelectedChore] = useState<string>('');

  // Use primitive key so the effect is stable even when React Query returns new object references
  const rotationKey = rotation
    ? `${rotation.choreName}:${rotation.guestIds.join(',')}`
    : null;

  useEffect(() => {
    if (rotation) {
      setOrderedIds(rotation.guestIds);
      setSelectedChore(rotation.choreName);
    } else if (activeGuests.length > 0) {
      setOrderedIds(activeGuests.map(g => g.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationKey]);

  useEffect(() => {
    if (!selectedChore && house?.chores) {
      const firstChore = Object.keys(house.chores)[0];
      if (firstChore) setSelectedChore(firstChore);
    }
  }, [house?.chores, selectedChore]);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setOrderedIds(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setOrderedIds(prev => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedChore || orderedIds.length === 0) {
      Alert.alert('Error', 'Select a chore and add at least one resident.');
      return;
    }
    try {
      await setRotation.mutateAsync({
        choreName: selectedChore,
        guestIds: orderedIds,
      });
      Alert.alert('Saved', 'Rotation order saved.');
    } catch {
      Alert.alert('Error', 'Could not save rotation. Please try again.');
    }
  }, [selectedChore, orderedIds, setRotation]);

  const handleAdvanceNow = useCallback(() => {
    Alert.alert(
      'Advance Rotation',
      'This will move to the next resident immediately. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          onPress: () =>
            advanceRotation.mutate(undefined, {
              onSuccess: () => Alert.alert('Done', 'Rotation advanced.'),
              onError: () =>
                Alert.alert('Error', 'Could not advance rotation.'),
            }),
        },
      ],
    );
  }, [advanceRotation]);

  const guestById = useCallback(
    (id: string) => activeGuests.find(g => g.id === id),
    [activeGuests],
  );

  const renderItem = ({ item, index }: ListRenderItemInfo<string>) => {
    const guest = guestById(item);
    const name = guest
      ? `${guest.firstName ?? ''} ${guest.lastName ?? ''}`.trim() || 'Resident'
      : item;
    const isCurrent = rotation?.currentIndex === index;

    return (
      <View style={ITEM_STYLE} testID={`rotation-row-${index}`}>
        <RatsText
          translate={false}
          text={`${index + 1}. ${name}${isCurrent ? '  (current)' : ''}`}
          style={{
            flex: 1,
            fontSize: fontSize.medium,
            color: isCurrent ? color.cobalt : color.black,
            fontFamily: isCurrent ? fontFamily.bold : fontFamily.roboto,
          }}
        />
        <TouchableOpacity
          style={ARROW_BTN}
          onPress={() => moveUp(index)}
          disabled={index === 0}
          testID={`move-up-${index}`}>
          <RatsText
            translate={false}
            text="▲"
            style={{ color: index === 0 ? color.medium_grey : color.cobalt }}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={ARROW_BTN}
          onPress={() => moveDown(index)}
          disabled={index === orderedIds.length - 1}
          testID={`move-down-${index}`}>
          <RatsText
            translate={false}
            text="▼"
            style={{
              color:
                index === orderedIds.length - 1
                  ? color.medium_grey
                  : color.cobalt,
            }}
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (rotationLoading || guestsLoading) {
    return <RatsLoadingIndicator />;
  }

  const choreOptions = house?.chores ? Object.keys(house.chores) : [];

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader header="Chore Rotation" />

      {/* Chore selector */}
      <View style={[CARD_STYLE, { padding: normalize(16), marginBottom: 2 }]}>
        <RatsText
          translate={false}
          text="Chore to rotate:"
          style={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
            marginBottom: normalize(8),
          }}
        />
        {choreOptions.map(chore => (
          <TouchableOpacity
            key={chore}
            onPress={() => setSelectedChore(chore)}
            testID={`chore-option-${chore}`}
            style={{
              paddingVertical: normalize(6),
              paddingHorizontal: normalize(8),
              borderRadius: normalize(4),
              backgroundColor:
                selectedChore === chore ? color.baby_blue : color.light_grey,
              marginBottom: normalize(4),
            }}>
            <RatsText
              translate={false}
              text={chore}
              style={{
                fontSize: fontSize.medium,
                color: selectedChore === chore ? color.cobalt : color.black,
                fontFamily:
                  selectedChore === chore ? fontFamily.bold : fontFamily.roboto,
              }}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Resident order */}
      <View
        style={[
          CARD_STYLE,
          {
            paddingVertical: normalize(10),
            paddingHorizontal: normalize(16),
            marginBottom: 2,
          },
        ]}>
        <RatsText
          translate={false}
          text="Rotation order (top = first):"
          style={{ fontSize: fontSize.regular, color: color.dark_grey }}
        />
      </View>

      <FlatList
        testID="rotation-list"
        data={orderedIds}
        keyExtractor={id => id}
        renderItem={renderItem}
        scrollEnabled={true}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* Action buttons */}
      <View style={[CARD_STYLE, { padding: normalize(16), marginTop: 'auto' }]}>
        <RatsButton
          onPress={handleSave}
          title="Save Order"
          containerStyle={[SAVE_BUTTON, { marginBottom: normalize(12) }]}
          testID="save-rotation-button"
        />
        <RatsButton
          onPress={handleAdvanceNow}
          title="Advance Rotation Now"
          containerStyle={SAVE_BUTTON}
          testID="advance-rotation-button"
        />
      </View>
    </View>
  );
};

export default ChoreRotationSetupScreen;
