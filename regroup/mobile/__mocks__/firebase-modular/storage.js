/** Dual-shape @react-native-firebase/storage mock (not part of the operation log). */
function storageRef(path) {
  return {
    fullPath: path,
    putFile: async () => ({ state: 'success', metadata: { fullPath: path } }),
    putString: async () => ({ state: 'success', metadata: { fullPath: path } }),
    getDownloadURL: async () => `https://mock-storage/${path}`,
    delete: async () => {},
  };
}

const instance = { ref: (path) => storageRef(path), useEmulator: () => {} };

function storage() {
  return instance;
}

module.exports = {
  __esModule: true,
  default: storage,
  instance,
  getStorage: () => instance,
  connectStorageEmulator: jest.fn(),
  ref: (_storage, path) => storageRef(path),
  putFile: (ref, file) => ref.putFile(file),
  getDownloadURL: (ref) => ref.getDownloadURL(),
  deleteObject: (ref) => ref.delete(),
  FirebaseStorageTypes: {},
};
