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
import {
  parseGuestCsvReport,
  importGuests,
  GuestImportRow,
  GuestImportResult,
  SkippedGuestRow,
} from '../../services/guestImport';
import { useHouseMoneyAccess } from '../../state/queries/houseTierQueries';
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
  // Owner decision 2026-11-27: owners and managers only. The same tiers as
  // the house's money, so a peer leader who reaches this route is refused.
  const access = useHouseMoneyAccess(currentHouse?.id ?? '');
  const [rows, setRows] = useState<GuestImportRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedGuestRow[]>([]);
  const [picked, setPicked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GuestImportResult | null>(null);
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
      const report = parseGuestCsvReport(content);
      setRows(report.rows);
      setSkipped(report.skipped);
      setPicked(true);
      setParseError(null);
      setResult(null);
    } catch (error) {
      // The parser's own message names the problem (e.g. a missing column) and
      // holds no file content, so show it as it is.
      if (error instanceof Error && error.name === 'GuestCsvError') {
        setRows([]);
        setSkipped([]);
        setPicked(false);
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
      setResult(await importGuests(currentHouse.id, rows));
      setRows([]);
      setSkipped([]);
      setPicked(false);
      // The guest list, the guest tab and the balances read these.
      queryClient.invalidateQueries({ queryKey: guestKeys.all });
    } catch (error) {
      Alert.alert('Import Failed', 'Please check your CSV and try again.');
      logException(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || access === 'checking') {
    return <RatsLoadingIndicator />;
  }
  if (access === 'no') {
    return (
      <View style={styles.screen} testID="guest-import-no-access">
        <ScreenHeader renderBackButton header="Import Residents" />
        <View style={styles.container}>
          <RatsText
            translate={false}
            text="Only the house's owner or a manager can import residents."
            style={styles.hint}
          />
        </View>
      </View>
    );
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

        {result && (
          <RatsText
            translate={false}
            text={resultMessage(result)}
            style={result.failed > 0 ? styles.error : styles.success}
          />
        )}

        {picked && (
          <>
            <RatsText
              translate={false}
              text={`${rows.length} ready, ${skipped.length} skipped`}
              style={styles.preview}
            />
            {skipped.slice(0, 20).map(s => (
              <RatsText
                key={s.row}
                translate={false}
                text={`Row ${s.row}: ${s.reason}`}
                style={styles.skipped}
              />
            ))}
            {skipped.length > 20 && (
              <RatsText
                translate={false}
                text={`and ${skipped.length - 20} more skipped rows`}
                style={styles.skipped}
              />
            )}
          </>
        )}

        {rows.length > 0 && (
          <>
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What an import did, and whether to run it again. */
export function resultMessage(r: GuestImportResult): string {
  const already = r.alreadyResidents
    ? ` ${r.alreadyResidents} ${r.alreadyResidents === 1 ? 'was' : 'were'} already on file.`
    : '';
  if (r.failed > 0) {
    return `${r.imported} imported, ${r.failed} failed.${already} Importing the same file again is safe: it adds only the ones missing.`;
  }
  return `Successfully imported ${plural(r.imported, 'resident')}.${already}`;
}

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
  skipped: {
    fontSize: fontSize.small,
    color: color.red,
    paddingVertical: normalize(2),
  },
  row: {
    fontSize: fontSize.small,
    color: color.grey,
    paddingVertical: normalize(4),
  },
});

export default GuestImportScreen;
