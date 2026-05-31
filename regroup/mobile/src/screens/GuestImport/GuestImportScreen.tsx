import React, { useState } from 'react';
import { Alert, View, FlatList, StyleSheet } from 'react-native';
import * as DocumentPicker from 'react-native-document-picker';
import * as RNFS from 'react-native-fs';
import { useNavigation } from '@react-navigation/native';
import {
  parseGuestCsv,
  importGuestsFromRows,
  GuestImportRow,
} from '../../services/guestImport';
import { useData } from '../../context/DataContext';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { color, normalize, fontSize } from '../../styles/theme';
import { logException } from '../../util/logging';

const GuestImportScreen: React.FC = () => {
  const navigation = useNavigation();
  const { house } = useData();
  const [rows, setRows] = useState<GuestImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handlePickFile = async () => {
    try {
      const [file] = await DocumentPicker.pick({
        type: [DocumentPicker.types.plainText],
      });
      const content = await RNFS.readFile(file.uri, 'utf8');
      const parsed = parseGuestCsv(content);
      setRows(parsed);
      setParseError(null);
      setImportedCount(null);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        setParseError('Could not read file. Make sure it is a valid CSV.');
        logException(error);
      }
    }
  };

  const handleImport = async () => {
    if (!house?.id || rows.length === 0) {
      return;
    }
    setLoading(true);
    try {
      const count = await importGuestsFromRows(house.id, rows);
      setImportedCount(count);
      setRows([]);
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
    <View style={styles.container}>
      <RatsText
        translate={false}
        text="Import Residents from CSV"
        style={styles.header}
      />
      <RatsText
        translate={false}
        text="Required columns: firstName, lastName, email, sobrietyDate, drugOfChoice"
        style={styles.hint}
      />

      <RatsButton
        title="Pick CSV File"
        onPress={handlePickFile}
        testID="pick-csv-button"
      />

      {parseError && (
        <RatsText translate={false} text={parseError} style={styles.error} />
      )}

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
  );
};

const styles = StyleSheet.create({
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
