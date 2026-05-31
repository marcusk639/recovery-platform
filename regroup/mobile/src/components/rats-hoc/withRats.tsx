import React, { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { themes } from '../../styles/theme';

/**
 * Higher-Order Component that provides translation and theme to wrapped components.
 *
 * Provides props:
 * - t: Translation function from i18next
 * - theme: Current theme object
 *
 * @deprecated Consider using hooks directly: useTranslation()
 */
export function withRats<P extends object>(
  WrappedComponent: ComponentType<P & { t?: any; theme?: any }>,
): ComponentType<Omit<P, 't' | 'theme'>> {
  const WithRatsComponent = (props: Omit<P, 't' | 'theme'>) => {
    const { t } = useTranslation();

    return <WrappedComponent {...(props as P)} t={t} theme={themes.default} />;
  };

  WithRatsComponent.displayName = `withRats(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithRatsComponent;
}

/**
 * HOC Props interface - use this when defining component props
 * that will be wrapped with withRats
 */
export interface HOCProps {
  t?: (key: string, options?: object) => string;
  theme?: any;
}

export default withRats;
