// Stand-ins the build generates for native features. See tools/replacements.mjs.
import { Component, type ComponentType, type ReactNode } from 'react';

export class NativeFeatureUnavailable extends Error {
  constructor(feature: string) {
    super(`Not available on the web yet: ${feature}`);
    this.name = 'NativeFeatureUnavailable';
  }
}

// Properties React and the module system read, which must look absent.
const INTERNAL = new Set([
  '$$typeof', 'then', 'contextType', 'contextTypes', 'childContextTypes', 'defaultProps', 'displayName',
  'getDefaultProps', 'getDerivedStateFromError', 'getDerivedStateFromProps', 'propTypes', 'toJSON', '__esModule',
]);

// A class renders under React's `new`, while a plain call reaches the apply
// trap, so one value can act both as a component and as a function.
function standIn(render: () => ReactNode, onCall: () => unknown, child: (key: string) => unknown): ComponentType<any> {
  class StandIn extends Component {
    render() {
      return render();
    }
  }
  return new Proxy(StandIn, {
    apply: onCall,
    get(target, key, receiver) {
      if (typeof key === 'symbol' || INTERNAL.has(key)) return undefined;
      if (key in target) return Reflect.get(target, key, receiver);
      return child(key);
    },
  }) as ComponentType<any>;
}

export function deferred(feature: string): ComponentType<any> {
  return standIn(
    () => <span role="alert">not available on the web yet: {feature}</span>,
    () => {
      throw new NativeFeatureUnavailable(feature);
    },
    (key) => deferred(`${feature}.${key}`),
  );
}

export function inert(feature: string): ComponentType<any> {
  return standIn(
    () => null,
    () => inert(feature),
    (key) => inert(`${feature}.${key}`),
  );
}
