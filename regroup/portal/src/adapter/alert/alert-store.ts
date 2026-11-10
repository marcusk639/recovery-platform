// React Native's Alert.alert, backed by a queue that AlertHost renders.
// react-native-web's own Alert.alert is an empty function.
export interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface QueuedAlert {
  id: number;
  title?: string;
  message?: string;
  buttons: AlertButton[];
}

let queue: QueuedAlert[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const setQueue = (next: QueuedAlert[]) => {
  queue = next;
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const currentAlert = (): QueuedAlert | undefined => queue[0];

// The phone's dispute prompts mark Cancel by its text, with no style.
export const cancelButton = (buttons: AlertButton[]) =>
  buttons.find((b) => b.style === 'cancel' || b.text === 'Cancel');

// The last alert closed, and when: lets a leave guard tell a finished form from an abandoned one.
let lastClosed: { title?: string; at: number } | undefined;
export const lastClosedAlert = () => lastClosed;

export function closeAlert(id: number, button?: AlertButton): void {
  if (queue[0]?.id !== id) return;
  lastClosed = { title: queue[0].title, at: Date.now() };
  setQueue(queue.slice(1));
  button?.onPress?.();
}

export const resetAlerts = () => setQueue([]);

export const Alert = {
  alert(title?: string, message?: string, buttons?: AlertButton[], _options?: unknown): void {
    const shown = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    setQueue([...queue, { id: nextId++, title, message, buttons: shown }]);
  },
};
