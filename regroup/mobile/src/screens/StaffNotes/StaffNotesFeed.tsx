/**
 * StaffNotesFeed
 *
 * Admin-only feed for either:
 *  - resident_note: notes about a specific guest (route param guestId required)
 *  - shift_log:    house-wide shift-handoff notes
 *
 * Renders a header, an "Add Note" composer, and a scrollable list with
 * pin/delete affordances per note. The screen NEVER appears for non-admins
 * (Firestore rules also block reads, so a non-admin who reaches this screen
 * sees an empty feed).
 */
import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import { RatsIcon } from '../../components/rats-icon';
import EmptyScreen from '../../components/empty-screen';
import {
  color,
  primaryColors,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
} from '../../styles/theme';
import { logException } from '../../util/logging';
import { Routes, RootStackParamList } from '../../navigation/types';
import { StaffNote, STAFF_NOTE_MAX_LENGTH } from '../../entities/StaffNote';
import {
  useResidentNotes,
  useShiftLogs,
  useAddStaffNote,
  useDeleteStaffNote,
  usePinStaffNote,
} from '../../state/queries/staffNoteQueries';

type Props = NativeStackScreenProps<RootStackParamList, Routes.StaffNotes>;

const formatTimestamp = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const StaffNotesFeed: React.FC<Props> = ({ route, navigation }) => {
  const { houseId, type, guestId, guestName } = route.params;

  const headerTitle =
    type === 'shift_log'
      ? 'Shift Log'
      : `Notes${guestName ? ` — ${guestName}` : ''}`;

  // Reads — exactly one hook is enabled at a time.
  const residentQuery = useResidentNotes(
    houseId,
    guestId ?? '',
    type === 'resident_note',
  );
  const shiftLogQuery = useShiftLogs(houseId, type === 'shift_log');

  const notes: StaffNote[] = useMemo(() => {
    return type === 'resident_note'
      ? residentQuery.data ?? []
      : shiftLogQuery.data ?? [];
  }, [type, residentQuery.data, shiftLogQuery.data]);

  const isLoading =
    type === 'resident_note'
      ? residentQuery.isLoading
      : shiftLogQuery.isLoading;

  // Writes
  const addNote = useAddStaffNote(houseId);
  const deleteNote = useDeleteStaffNote(houseId);
  const pinNote = usePinStaffNote(houseId);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await addNote.mutateAsync({
        type,
        content: trimmed,
        guestId: type === 'resident_note' ? guestId : undefined,
      });
      setDraft('');
    } catch (err) {
      logException(err);
      Alert.alert('Could not save note', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [draft, addNote, type, guestId]);

  const onDelete = useCallback(
    (note: StaffNote) => {
      Alert.alert('Delete note?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote.mutateAsync({
                noteId: note.id,
                guestId: note.guestId,
              });
            } catch (err) {
              logException(err);
              Alert.alert('Could not delete note', 'Please try again.');
            }
          },
        },
      ]);
    },
    [deleteNote],
  );

  const onTogglePin = useCallback(
    async (note: StaffNote) => {
      try {
        await pinNote.mutateAsync({
          noteId: note.id,
          pinned: !note.pinned,
          guestId: note.guestId,
        });
      } catch (err) {
        logException(err);
      }
    },
    [pinNote],
  );

  const renderItem = useCallback(
    ({ item }: { item: StaffNote }) => (
      <View
        testID={`staff-note-row-${item.id}`}
        style={[
          CARD_STYLE,
          {
            marginHorizontal: normalize(12),
            marginVertical: normalize(4),
            padding: normalize(12),
            backgroundColor: item.pinned ? color.yellow : color.white,
          },
        ]}>
        <View style={[ROW, { justifyContent: 'space-between' }]}>
          <RatsText
            style={{ fontSize: fontSize.medium, fontWeight: '600' }}
            text={item.authorName}
          />
          <RatsText
            style={{ fontSize: fontSize.small, color: color.medium_grey }}
            text={formatTimestamp(item.createdAt)}
          />
        </View>
        <RatsText
          style={{
            fontSize: fontSize.medium,
            marginTop: normalize(8),
            color: color.dark_grey,
          }}
          text={item.content}
        />
        <View
          style={[
            ROW,
            { justifyContent: 'flex-end', marginTop: normalize(8) },
          ]}>
          <TouchableOpacity
            testID={`staff-note-pin-${item.id}`}
            onPress={() => onTogglePin(item)}
            style={{ marginRight: normalize(16) }}>
            <RatsIcon
              name={item.pinned ? 'thumbtack' : 'thumbtack'}
              color={item.pinned ? primaryColors.primary : color.medium_grey}
              size={normalize(16)}
            />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`staff-note-delete-${item.id}`}
            onPress={() => onDelete(item)}>
            <RatsIcon
              name="trash"
              color={color.medium_grey}
              size={normalize(16)}
            />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [onDelete, onTogglePin],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="staff-notes-feed-screen">
      <ScreenHeader header={headerTitle} />

      {/* Composer */}
      <View
        style={[
          CARD_STYLE,
          {
            margin: normalize(12),
            padding: normalize(12),
            backgroundColor: color.white,
          },
        ]}>
        <TextInput
          testID="staff-note-input"
          placeholder={
            type === 'shift_log'
              ? 'Log notes for the next shift…'
              : 'Add a private note about this resident…'
          }
          placeholderTextColor={color.medium_grey}
          value={draft}
          onChangeText={setDraft}
          maxLength={STAFF_NOTE_MAX_LENGTH}
          multiline
          style={{
            minHeight: normalize(80),
            fontSize: fontSize.medium,
            color: color.dark_grey,
            textAlignVertical: 'top',
          }}
        />
        <View
          style={[
            ROW,
            { justifyContent: 'space-between', marginTop: normalize(8) },
          ]}>
          <RatsText
            style={{ fontSize: fontSize.small, color: color.medium_grey }}
            text={`${draft.length}/${STAFF_NOTE_MAX_LENGTH}`}
          />
          <TouchableOpacity
            testID="staff-note-submit"
            disabled={!draft.trim() || submitting}
            onPress={onSubmit}
            style={{
              opacity: !draft.trim() || submitting ? 0.4 : 1,
              backgroundColor: primaryColors.primary,
              paddingHorizontal: normalize(16),
              paddingVertical: normalize(8),
              borderRadius: normalize(4),
            }}>
            {submitting ? (
              <ActivityIndicator color={color.white} />
            ) : (
              <RatsText
                style={{ color: color.white, fontWeight: '600' }}
                text="Add Note"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View
          testID="staff-notes-loading"
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={primaryColors.primary} />
        </View>
      ) : notes.length === 0 ? (
        <EmptyScreen
          message={
            type === 'shift_log'
              ? 'No shift logs yet. Add the first one above.'
              : 'No notes for this resident yet.'
          }
        />
      ) : (
        <FlatList
          testID="staff-notes-list"
          data={notes}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: normalize(24) }}
        />
      )}
    </SafeAreaView>
  );
};

export default StaffNotesFeed;
