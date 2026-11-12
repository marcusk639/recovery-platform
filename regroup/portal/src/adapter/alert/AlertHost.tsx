import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Modal } from 'react-native-web';
import { closeAlert, currentAlert, dismissButton, subscribe } from './alert-store';

// Built on react-native-web's Modal, so it stacks above a screen's open Modal
// and takes over focus from that Modal's focus trap.
export function AlertHost() {
  const alert = useSyncExternalStore(subscribe, currentAlert);
  const firstButton = useRef<HTMLButtonElement>(null);
  const dismiss = () => {
    const button = alert && dismissButton(alert.buttons);
    if (alert && button) closeAlert(alert.id, button);
  };

  // Handled here because react-native-web's Modal only responds to Escape once
  // it is active. Stopping the event keeps a Modal underneath from closing too.
  useEffect(() => {
    if (!alert) return undefined;
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      dismiss();
    };
    window.addEventListener('keyup', onKeyUp, true);
    return () => window.removeEventListener('keyup', onKeyUp, true);
  });

  if (!alert) return null;
  return (
    <Modal
      key={alert.id}
      visible
      transparent
      // The focus trap puts focus on the Modal once it is active, not on a button.
      onShow={() => setTimeout(() => firstButton.current?.focus(), 0)}>
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
              <button key={index} ref={index === 0 ? firstButton : undefined} type="button" onClick={() => closeAlert(alert.id, button)}>
                {button.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
