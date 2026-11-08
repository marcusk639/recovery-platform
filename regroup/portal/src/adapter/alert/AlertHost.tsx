import { useSyncExternalStore } from 'react';
import { Modal } from 'react-native-web';
import { cancelButton, closeAlert, currentAlert, subscribe } from './alert-store';

// Built on react-native-web's Modal, so it stacks above a screen's open Modal
// and takes over focus from that Modal's focus trap.
export function AlertHost() {
  const alert = useSyncExternalStore(subscribe, currentAlert);
  if (!alert) return null;
  const dismiss = () => closeAlert(alert.id, cancelButton(alert.buttons));
  return (
    <Modal key={alert.id} visible transparent onRequestClose={dismiss}>
      <div
        data-testid="alert-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.4)',
        }}>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={alert.title}
          style={{
            width: 420,
            maxWidth: 'calc(100vw - 32px)',
            padding: 20,
            borderRadius: 8,
            background: '#fff',
            color: '#1c2430',
            font: '15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
          {alert.title && <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>{alert.title}</h2>}
          {alert.message && <p style={{ margin: '0 0 16px' }}>{alert.message}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
            {alert.buttons.map((button, index) => (
              <button key={index} type="button" onClick={() => closeAlert(alert.id, button)}>
                {button.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
