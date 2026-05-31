import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Returns true while the soft keyboard is visible. Use to hide bulky chrome
 * (e.g., wizard progress indicators) during text entry.
 *
 * @example
 * const keyboardVisible = useKeyboardVisible();
 * return (
 *   <>
 *     {!keyboardVisible && <RatsWizardProgress ... />}
 *     <TextInput ... />
 *   </>
 * );
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      setVisible(true),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
