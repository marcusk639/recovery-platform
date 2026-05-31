// src/screens/Documents/DocumentListScreen.tsx
import React, { useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'react-native-document-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon } from '../../components/rats-icon';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  ROW,
} from '../../styles/theme';
import { logException } from '../../util/logging';
import {
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
} from '../../state/queries/documentQueries';
import {
  HouseDocument,
  DOCUMENT_CATEGORY_LABELS,
  isDocumentExpiringSoon,
} from '../../entities/Document';
import { Routes, RootStackParamList } from '../../navigation/types';
import { DocumentCategory } from '../../entities/Document';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentsRouteProp = RouteProp<RootStackParamList, Routes.Documents>;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: Array<{ label: string; value: DocumentCategory }> = [
  { label: 'Lease Agreement', value: 'lease' },
  { label: 'ID / Photo ID', value: 'id' },
  { label: 'Intake Paperwork', value: 'intake' },
  { label: 'Drug Test Result', value: 'drug_test' },
  { label: 'Compliance Certificate', value: 'compliance' },
  { label: 'Other', value: 'other' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: HouseDocument;
  onDelete: (doc: HouseDocument) => void;
}

const DocumentRow: React.FC<DocumentRowProps> = ({ doc, onDelete }) => {
  const expiring = isDocumentExpiringSoon(doc);
  const expired =
    doc.expiresAt != null && new Date(doc.expiresAt).getTime() < Date.now();

  const handleOpen = () => {
    Linking.openURL(doc.storageUrl).catch(err => {
      logException(err);
      Alert.alert('Error', 'Could not open this document.');
    });
  };

  const expiryLabel = (() => {
    if (!doc.expiresAt) return null;
    const date = new Date(doc.expiresAt).toLocaleDateString();
    if (expired) return `Expired ${date}`;
    if (expiring) return `Expires ${date}`;
    return `Expires ${date}`;
  })();

  return (
    <View
      style={[CARD_STYLE, styles.docRow, expiring && styles.docRowWarning]}
      testID={`document-row-${doc.id}`}>
      {/* Left: icon + info */}
      <TouchableOpacity
        style={[ROW, { flex: 1 }]}
        onPress={handleOpen}
        activeOpacity={0.7}
        testID={`document-open-${doc.id}`}>
        <RatsIcon
          name={doc.fileType === 'pdf' ? 'file-pdf' : 'file-image'}
          solid
          size={normalize(24)}
          style={{
            color: doc.fileType === 'pdf' ? color.red : color.baby_blue,
            marginRight: normalize(10),
          }}
        />
        <View style={{ flex: 1 }}>
          <RatsText
            translate={false}
            text={doc.fileName}
            style={styles.docFileName}
          />
          <RatsText
            translate={false}
            text={DOCUMENT_CATEGORY_LABELS[doc.category]}
            style={styles.docCategory}
          />
          {expiryLabel && (
            <View style={styles.expiryRow}>
              {(expiring || expired) && (
                <RatsIcon
                  name="exclamation-triangle"
                  solid
                  size={normalize(11)}
                  style={{
                    color: expired ? color.red : color.orange,
                    marginRight: normalize(4),
                  }}
                />
              )}
              <RatsText
                translate={false}
                text={expiryLabel}
                style={[
                  styles.expiryLabel,
                  expired && { color: color.red },
                  expiring && !expired && { color: color.orange },
                ]}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Right: delete */}
      <TouchableOpacity
        onPress={() => onDelete(doc)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID={`document-delete-${doc.id}`}>
        <RatsIcon
          name="trash-alt"
          solid
          size={normalize(18)}
          style={{ color: color.red }}
        />
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const DocumentListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<DocumentsRouteProp>();
  const { houseId, guestId, title } = route.params;

  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<DocumentCategory>('other');

  const { data: documents, isLoading } = useDocuments(houseId, guestId);
  const uploadMutation = useUploadDocument(houseId);
  const deleteMutation = useDeleteDocument(houseId);

  // ── Upload flow ────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    try {
      const file = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
      });

      Alert.alert('Choose Category', 'What type of document is this?', [
        ...CATEGORY_OPTIONS.map(opt => ({
          text: opt.label,
          onPress: () => doUpload(file, opt.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        logException(err);
        Alert.alert('Error', 'Could not open the file picker.');
      }
    }
  };

  const doUpload = async (
    file: DocumentPicker.DocumentPickerResponse,
    category: DocumentCategory,
  ) => {
    if (!file.uri || !file.name) {
      Alert.alert('Error', 'Invalid file selected.');
      return;
    }
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        houseId,
        guestId,
        localPath: file.uri,
        fileName: file.name,
        mimeType: file.type,
        category,
      });
    } catch (err) {
      Alert.alert(
        'Upload Failed',
        'Could not upload the document. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Delete flow ────────────────────────────────────────────────────────────

  const handleDelete = (doc: HouseDocument) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.fileName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                docId: doc.id,
                storagePath: doc.storagePath,
                guestId: doc.guestId,
              });
            } catch (_err) {
              Alert.alert('Error', 'Could not delete the document.');
            }
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <RatsLoadingIndicator />;
  }

  const isEmpty = !documents || documents.length === 0;

  return (
    <View style={styles.container} testID="document-list-screen">
      <ScreenHeader header={title || 'Documents'} />

      <RatsButton
        title={uploading ? 'Uploading...' : 'Upload Document'}
        onPress={uploading ? undefined : handleUpload}
        testID="upload-document-button"
      />

      {(uploadMutation.isLoading || uploading) && (
        <ActivityIndicator
          size="small"
          color={color.main}
          style={{ marginVertical: normalize(8) }}
          testID="upload-loading-indicator"
        />
      )}

      {isEmpty ? (
        <View style={styles.emptyContainer} testID="empty-documents">
          <RatsIcon
            name="folder-open"
            solid
            size={normalize(48)}
            style={{ color: color.light_grey, marginBottom: normalize(12) }}
          />
          <RatsText
            translate={false}
            text="No documents yet"
            style={styles.emptyText}
          />
          <RatsText
            translate={false}
            text="Tap Upload Document to add one."
            style={styles.emptySubtext}
          />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DocumentRow doc={item} onDelete={handleDelete} />
          )}
          contentContainerStyle={{ paddingBottom: normalize(24) }}
          testID="document-list"
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.white,
    padding: normalize(16),
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(8),
    padding: normalize(12),
  },
  docRowWarning: {
    borderLeftWidth: 3,
    borderLeftColor: color.orange,
  },
  docFileName: {
    fontSize: fontSize.medium,
    color: color.black,
    fontWeight: '600',
  },
  docCategory: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: normalize(3),
  },
  expiryLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.large,
    color: color.dark_grey,
    fontWeight: '600',
    marginBottom: normalize(4),
  },
  emptySubtext: {
    fontSize: fontSize.regular,
    color: color.grey,
  },
});

export default DocumentListScreen;
