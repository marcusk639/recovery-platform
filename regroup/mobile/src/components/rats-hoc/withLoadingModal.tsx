import React, { ComponentType, useState } from 'react';

/**
 * Props provided by withLoadingModal HOC
 */
export interface WithLoadingModalProps {
  showLoadingModal: (message?: string) => void;
  hideLoadingModal: () => void;
  setLoadingSuccess: () => void;
  setLoadingError: (error: string) => void;
  isLoadingModalVisible: boolean;
}

/**
 * Higher-Order Component that provides loading modal functionality
 * @deprecated Consider using a loading context instead
 */
export function withLoadingModal<P extends object>(
  WrappedComponent: ComponentType<P & WithLoadingModalProps>,
): ComponentType<Omit<P, keyof WithLoadingModalProps>> {
  const WithLoadingModalComponent = (
    props: Omit<P, keyof WithLoadingModalProps>,
  ) => {
    const [isLoadingModalVisible, setIsVisible] = useState(false);

    const showLoadingModal = (_message?: string) => {
      setIsVisible(true);
    };

    const hideLoadingModal = () => {
      setIsVisible(false);
    };

    const setLoadingSuccess = () => {
      // Would typically show success state before hiding
      setTimeout(() => setIsVisible(false), 1000);
    };

    const setLoadingError = (_error: string) => {
      // Would typically show error state
      setTimeout(() => setIsVisible(false), 2000);
    };

    return (
      <WrappedComponent
        {...(props as P)}
        showLoadingModal={showLoadingModal}
        hideLoadingModal={hideLoadingModal}
        setLoadingSuccess={setLoadingSuccess}
        setLoadingError={setLoadingError}
        isLoadingModalVisible={isLoadingModalVisible}
      />
    );
  };

  WithLoadingModalComponent.displayName = `withLoadingModal(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithLoadingModalComponent;
}

export default withLoadingModal;
