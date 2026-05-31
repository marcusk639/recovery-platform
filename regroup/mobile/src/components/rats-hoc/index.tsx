/**
 * Higher-Order Components for RATS app
 *
 * @deprecated Most of these HOCs should be migrated to hooks or context
 */

export { withRats } from './withRats';
export type { HOCProps } from './withRats';

export { withNotifier } from './withNotifier';
export type { WithNotifierProps } from './withNotifier';

export { withPopover } from './withPopover';
export type { WithPopoverProps } from './withPopover';

export { withStatUpdateModal } from './withStatUpdateModal';
export type {
  WithStatUpdateModalProps,
  StatUpdateProps,
  UpdatableStat,
} from './withStatUpdateModal';

export { withLoadingModal } from './withLoadingModal';
export type { WithLoadingModalProps } from './withLoadingModal';

// Default export for backwards compatibility
export { withRats as default } from './withRats';
