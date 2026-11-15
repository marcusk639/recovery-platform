// @react-native-documents/picker, as DocumentListScreen uses it, on a browser
// file input. A picked file's uri is a blob URL, which putFile can read.
export const types = { pdf: 'application/pdf', images: 'image/*', allFiles: '*/*' };
export const errorCodes = { OPERATION_CANCELED: 'OPERATION_CANCELED' };

const cancelled = () => Object.assign(new Error('The picker was cancelled.'), { code: errorCodes.OPERATION_CANCELED });

export const isErrorWithCode = (error: unknown): error is Error & { code: string } =>
  error instanceof Error && typeof (error as { code?: unknown }).code === 'string';

export function pick({ type }: { type: string[] }) {
  return new Promise<{ uri: string; name: string; type: string; size: number }[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type.join(',');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      input.remove();
      const file = input.files?.[0];
      if (!file) {
        reject(cancelled());
        return;
      }
      resolve([{ uri: URL.createObjectURL(file), name: file.name, type: file.type, size: file.size }]);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      reject(cancelled());
    });
    document.body.appendChild(input);
    input.click();
  });
}

// A blob URL stays valid until the page closes, so it is already a local copy.
export const keepLocalCopy = async ({ files }: { files: { uri: string; fileName: string }[]; destination?: string }) =>
  files.map((file) => ({ status: 'success' as const, sourceUri: file.uri, localUri: file.uri }));
