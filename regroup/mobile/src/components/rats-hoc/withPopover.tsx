import React, { ComponentType, useState } from 'react';

/**
 * Props provided by withPopover HOC
 */
export interface WithPopoverProps {
  showPopover: (
    content: React.ReactNode,
    position?: { x: number; y: number },
  ) => void;
  hidePopover: () => void;
  isPopoverVisible: boolean;
}

/**
 * Higher-Order Component that provides popover functionality
 * @deprecated Consider using a modal/popover context instead
 */
export function withPopover<P extends object>(
  WrappedComponent: ComponentType<P & WithPopoverProps>,
): ComponentType<Omit<P, keyof WithPopoverProps>> {
  const WithPopoverComponent = (props: Omit<P, keyof WithPopoverProps>) => {
    const [isPopoverVisible, setIsPopoverVisible] = useState(false);

    const showPopover = (
      _content: React.ReactNode,
      _position?: { x: number; y: number },
    ) => {
      setIsPopoverVisible(true);
    };

    const hidePopover = () => {
      setIsPopoverVisible(false);
    };

    return (
      <WrappedComponent
        {...(props as P)}
        showPopover={showPopover}
        hidePopover={hidePopover}
        isPopoverVisible={isPopoverVisible}
      />
    );
  };

  WithPopoverComponent.displayName = `withPopover(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithPopoverComponent;
}

export default withPopover;
