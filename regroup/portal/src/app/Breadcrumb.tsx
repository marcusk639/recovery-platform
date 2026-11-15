import type { ReactNode } from 'react';
import { useGuest } from '@mobile/state/queries/guestQueries';
import { useHouse } from '@mobile/state/queries/houseQueries';
import { HouseLink } from './HouseLink';
import { font, link } from './ui';
import { HOME_ROUTE, RESIDENT_ROUTE, residentPath, SECTIONS, sectionPath } from './urls';

const separator = <span aria-hidden="true" style={{ color: '#8a98a3' }}> › </span>;

function Crumb(props: { current: boolean; href: string; route: string; params?: object; children: ReactNode }) {
  if (props.current) return <span aria-current="page" style={{ fontWeight: 600 }}>{props.children}</span>;
  return (
    <HouseLink href={props.href} route={props.route} params={props.params} style={link}>
      {props.children}
    </HouseLink>
  );
}

// The resident's name shows only once their record is confirmed to be in this
// house, so it never appears above "This resident isn't in this house."
export function Breadcrumb({ houseId, guestId, routeName }: { houseId: string; guestId: string | null; routeName: string }) {
  const { data: house } = useHouse(houseId, true);
  const { data: guest } = useGuest(guestId ?? '', !!guestId);
  const confirmed = !!guestId && (guest as any)?.houseId === houseId;
  const houseCurrent = routeName === SECTIONS.summary.route;
  return (
    <nav aria-label="Breadcrumb" style={{ padding: '10px 16px 6px', background: '#fff', font: `14px/1.4 ${font}` }}>
      <HouseLink href="/" route={HOME_ROUTE} style={link}>
        All houses
      </HouseLink>
      {separator}
      <Crumb current={houseCurrent} href={sectionPath(houseId, 'summary')} route={SECTIONS.summary.route} params={{ houseId }}>
        {(house as any)?.name ?? '…'}
      </Crumb>
      {confirmed && (
        <>
          {separator}
          <Crumb
            current={routeName === RESIDENT_ROUTE}
            href={residentPath(houseId, guestId)}
            route={RESIDENT_ROUTE}
            params={{ houseId, guestId }}>
            {`${(guest as any).firstName ?? ''} ${(guest as any).lastName ?? ''}`.trim()}
          </Crumb>
        </>
      )}
    </nav>
  );
}
