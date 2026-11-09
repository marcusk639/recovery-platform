import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { navigationRef } from '@mobile/navigation/service';

// A real link, so it can open in a new tab. A plain click navigates in place while
// a navigator is mounted. After a crash the boundary has unmounted the navigator, so
// the browser's full page load is the recovery, and the session survives it.
export function HouseLink(props: {
  id?: string;
  href: string;
  route: string;
  params?: object;
  current?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent) => {
    const navigation = navigationRef.current;
    if (event.metaKey || event.ctrlKey || event.shiftKey || !navigation?.isReady?.()) return;
    event.preventDefault();
    navigation.navigate(props.route, props.params);
  };
  return (
    <a id={props.id} href={props.href} aria-current={props.current ? 'page' : undefined} style={props.style} onClick={onClick}>
      {props.children}
    </a>
  );
}
