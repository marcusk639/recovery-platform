/**
 * Context Providers and Hooks
 *
 * Modern Context API replacements for old HOC patterns.
 * Use these hooks instead of HOCs for cleaner, more maintainable code.
 */

export { ModalProvider, useModal } from './ModalContext';
export { NotificationProvider, useNotification } from './NotificationContext';
export { DataProvider, useData } from './DataContext';

// Re-export theme hooks
import { useThemeHook } from '../styles/theme';
import { useTranslation as useI18nTranslation } from 'react-i18next';

export const useTheme = () => {
  const theme = useThemeHook();
  return { theme };
};

export const useTranslation = () => {
  const { t, i18n } = useI18nTranslation();
  return { t, i18n };
};

/**
 * Migration Guide:
 *
 * Old HOC Pattern:
 * ```tsx
 * export default withNotifier(withFormModal(withPopover(MyComponent)));
 * ```
 *
 * New Hook Pattern:
 * ```tsx
 * import { useModal, useNotification } from '../context';
 *
 * const MyComponent = () => {
 *   const { showFormModal, dismissFormModal } = useModal();
 *   const { notify, showPopover } = useNotification();
 *
 *   return <View>...</View>;
 * };
 *
 * export default MyComponent;
 * ```
 *
 * Benefits:
 * - No prop drilling
 * - Better TypeScript inference
 * - Easier to test
 * - More readable code
 * - Performance optimizations with React.memo
 */
