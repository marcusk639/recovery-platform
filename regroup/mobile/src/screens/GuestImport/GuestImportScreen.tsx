import React, { useState } from 'react';
import { Alert, View, FlatList, StyleSheet } from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import { readFile } from '@dr.pogodin/react-native-fs';
import { useQueryClient } from '@tanstack/react-query';
import { parseGuestCsv, importGuestsFromRows, GuestImportRow } from '../../services/guestImport';
import { useData } from '../../context/DataContext';
import { guestKeys } from '../../state/queries/guestQueries';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { color, normalize, fontSize } from '../../styles/theme';
import { logException } from '../../util/logging';

const GuestImportScreen: React.FC = () => {
  // DataContext exposes the selected house as currentHouse; reading `house`
  // (which it doesn't have) made every import return early (P5 Task 17).
  const { currentHouse } = useData();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<GuestImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handlePickFile = async () => {
    try {
      // CSV as well as plain text: Android reports a .csv file as text/csv (or
      // text/comma-separated-values), which a plain-text-only filter greyed out.
      const [file] = await pick({ type: [types.csv, types.plainText].flat() });
      const [copy] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: file.name ?? 'import.csv' }],
        destination: 'cachesDirectory',
      });
      if (copy.status === 'error') {
        logException(new Error(copy.copyError), 'GuestImportScreen: keepLocalCopy');
        setParseError('Could not read file. Make sure it is a valid CSV.');
        return;
      }
      // Never log `content`: it holds residents' names and contact details.
      const content = await readFile(copy.localUri, 'utf8');
      const parsed = parseGuestCsv(content);
      setRows(parsed);
      setParseError(null);
      setImportedCount(null);
    } catch (error) {
      // The parser's own message names the problem (e.g. a missing column) and
      // holds no file content, so show it as it is.
      if (error instanceof Error && error.name === 'GuestCsvError') {
        setRows([]);
        setParseError(error.message);
      } else if (!(isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)) {
        setParseError('Could not read file. Make sure it is a valid CSV.');
        logException(error);
      }
    }
  };

  const handleImport = async () => {
    if (!currentHouse?.id || rows.length === 0) {
      return;
    }
    setLoading(true);
    try {
      const count = await importGuestsFromRows(currentHouse.id, rows);
      setImportedCount(count);
      setRows([]);
      // The guest list, the guest tab and the balances read these.
      queryClient.invalidateQueries({ queryKey: guestKeys.all });
    } catch (error) {
      Alert.alert('Import Failed', 'Please check your CSV and try again.');
      logException(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <RatsLoadingIndicator />;
  }

  return (
    <View style={styles.screen} testID="guest-import-screen">
      <ScreenHeader renderBackButton header="Import Residents" />
      <View style={styles.container}>
        <RatsText translate={false} text="Import Residents from CSV" style={styles.header} />
        <RatsText
          translate={false}
          text="Required columns: firstName, lastName, email, sobrietyDate, drugOfChoice"
          style={styles.hint}
        />

        <RatsButton title="Pick CSV File" onPress={handlePickFile} testID="pick-csv-button" />

        {parseError && <RatsText translate={false} text={parseError} style={styles.error} />}

        {importedCount !== null && (
          <RatsText
            translate={false}
            text={`Successfully imported ${importedCount} resident${
              importedCount !== 1 ? 's' : ''
            }`}
            style={styles.success}
          />
        )}

        {rows.length > 0 && (
          <>
            <RatsText
              translate={false}
              text={`${rows.length} residents ready to import`}
              style={styles.preview}
            />
            <FlatList
              data={rows.slice(0, 10)}
              keyExtractor={(_, idx) => String(idx)}
              renderItem={({ item }) => (
                <RatsText
                  translate={false}
                  text={`${item.firstName} ${item.lastName}`}
                  style={styles.row}
                />
              )}
            />
            <RatsButton
              title={`Import ${rows.length} Residents`}
              onPress={handleImport}
              testID="import-button"
            />
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.white,
  },
  container: {
    flex: 1,
    backgroundColor: color.white,
    padding: normalize(20),
  },
  header: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  hint: {
    fontSize: fontSize.small,
    color: color.grey,
    marginBottom: normalize(20),
  },
  error: {
    fontSize: fontSize.regular,
    color: color.red,
    marginBottom: normalize(12),
  },
  success: {
    fontSize: fontSize.regular,
    color: color.blue,
    fontWeight: '600',
    marginBottom: normalize(12),
  },
  preview: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontWeight: '600',
    marginBottom: normalize(8),
  },
  row: {
    fontSize: fontSize.small,
    color: color.grey,
    paddingVertical: normalize(4),
  },
});

export default GuestImportScreen;
