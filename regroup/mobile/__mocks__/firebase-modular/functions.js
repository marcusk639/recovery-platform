/**
 * Dual-shape @react-native-firebase/functions mock. A callable invocation logs
 * { op: 'call', path: <name>, data } on both API shapes and resolves with
 * { data } from seedCall(name, data), or {} when nothing was seeded.
 */
const { state, record, maybeFail } = require('./log');

function callable(name) {
  return async (data) => {
    record({ op: 'call', path: name, data });
    maybeFail('call', name);
    const seeded = state.calls.get(name);
    return { data: seeded === undefined ? {} : JSON.parse(JSON.stringify(seeded)) };
  };
}

const instance = {
  httpsCallable: (name) => callable(name),
  useEmulator: () => {},
  useFunctionsEmulator: () => {},
};

function functions() {
  return instance;
}

module.exports = {
  __esModule: true,
  default: functions,
  instance,
  getFunctions: () => instance,
  httpsCallable: (_functions, name) => callable(name),
  connectFunctionsEmulator: () => {},
};
