import React, { ComponentType, useState } from 'react';

/**
 * Props provided by withNotifier HOC
 */
export interface WithNotifierProps {
  showNotification: (
    message: string,
    type?: 'success' | 'error' | 'info',
  ) => void;
  hideNotification: () => void;
}

/**
 * Higher-Order Component that provides notification functionality
 * @deprecated Consider using a notification context or toast library instead
 */
export function withNotifier<P extends object>(
  WrappedComponent: ComponentType<P & WithNotifierProps>,
): ComponentType<Omit<P, keyof WithNotifierProps>> {
  const WithNotifierComponent = (props: Omit<P, keyof WithNotifierProps>) => {
    const [, setNotification] = useState<{
      message: string;
      type: string;
    } | null>(null);

    const showNotification = (
      message: string,
      type: 'success' | 'error' | 'info' = 'info',
    ) => {
      setNotification({ message, type });
      // Auto-hide after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    };

    const hideNotification = () => {
      setNotification(null);
    };

    return (
      <WrappedComponent
        {...(props as P)}
        showNotification={showNotification}
        hideNotification={hideNotification}
      />
    );
  };

  WithNotifierComponent.displayName = `withNotifier(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithNotifierComponent;
}

export default withNotifier;
