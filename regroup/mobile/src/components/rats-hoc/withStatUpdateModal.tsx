import React, { ComponentType, useState } from 'react';

/**
 * Types of stats that can be updated
 */
export type UpdatableStat =
  | 'meeting'
  | 'medication'
  | 'hoursWorked'
  | 'choreCompleted'
  | 'metPrimarySupporter';

/**
 * Props provided by withStatUpdateModal HOC
 */
export interface WithStatUpdateModalProps {
  showStatUpdateModal: (statType: string, currentValue?: number) => void;
  hideStatUpdateModal: () => void;
  isStatUpdateModalVisible: boolean;
  statModalType: string | null;
}

/**
 * Props for stat update functionality
 */
export interface StatUpdateProps extends WithStatUpdateModalProps {
  updateStat: (
    statType: UpdatableStat,
    value: number | boolean,
  ) => Promise<void>;
}

/**
 * Higher-Order Component that provides stat update modal functionality
 * @deprecated Consider using a modal context instead
 */
export function withStatUpdateModal<P extends object>(
  WrappedComponent: ComponentType<P & WithStatUpdateModalProps>,
): ComponentType<Omit<P, keyof WithStatUpdateModalProps>> {
  const WithStatUpdateModalComponent = (
    props: Omit<P, keyof WithStatUpdateModalProps>,
  ) => {
    const [isStatUpdateModalVisible, setIsVisible] = useState(false);
    const [statModalType, setStatModalType] = useState<string | null>(null);

    const showStatUpdateModal = (statType: string, _currentValue?: number) => {
      setStatModalType(statType);
      setIsVisible(true);
    };

    const hideStatUpdateModal = () => {
      setIsVisible(false);
      setStatModalType(null);
    };

    return (
      <WrappedComponent
        {...(props as P)}
        showStatUpdateModal={showStatUpdateModal}
        hideStatUpdateModal={hideStatUpdateModal}
        isStatUpdateModalVisible={isStatUpdateModalVisible}
        statModalType={statModalType}
      />
    );
  };

  WithStatUpdateModalComponent.displayName = `withStatUpdateModal(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithStatUpdateModalComponent;
}

export default withStatUpdateModal;
