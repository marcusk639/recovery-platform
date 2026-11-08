import { uploadBytes, type StorageReference, type UploadMetadata } from 'firebase/storage';

export * from 'firebase/storage';

// RN Firebase's putFile. A "local file" in the browser is a blob URL.
export async function putFile(reference: StorageReference, localUri: string, metadata?: UploadMetadata) {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error(`Could not read the local file (${response.status}).`);
  return uploadBytes(reference, await response.blob(), metadata);
}
