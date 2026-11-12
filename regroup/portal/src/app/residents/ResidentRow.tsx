import { RatsIcon } from '@mobile/components/rats-icon';
import { Routes } from '@mobile/navigation/types';
import { getHealthByPercentage, HEALTH_COLOR_MAP, HEALTH_ICON_MAP } from '@mobile/util/guest';
import { HouseLink } from '../HouseLink';
import { healthLabel } from '../houses/healthLabel';
import { formatDay } from '../houses/summary';
import { danger, link, muted, td } from '../ui';
import { residentPath } from '../urls';
import { balanceLabel, fullName, phaseLabel } from './rows';

export type Week = { state: 'loading' } | { state: 'error' } | { state: 'unscored' } | { state: 'ready'; percent: number };

function WeekCell({ week }: { week: Week }) {
  if (week.state === 'loading') return <span aria-label="Loading" style={muted}>…</span>;
  if (week.state === 'error') return <span style={danger}>Couldn't load</span>;
  if (week.state === 'unscored') return <span style={muted}>No phase rules</span>;
  const health = getHealthByPercentage(week.percent);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <RatsIcon name={(HEALTH_ICON_MAP as any)[health]} size={16} style={{ color: (HEALTH_COLOR_MAP as any)[health] }} />
      {`${week.percent}% ${healthLabel(week.percent)}`}
    </span>
  );
}

export function ResidentRow(props: { guest: any; houseId: string; room: string | null; week: Week; showBalance: boolean }) {
  const { guest, houseId } = props;
  return (
    <tr data-testid="guest-list-item">
      <td style={td}>
        <HouseLink href={residentPath(houseId, guest.id)} route={Routes.GuestOverview} params={{ houseId, guestId: guest.id }} style={link}>
          {fullName(guest)}
        </HouseLink>
      </td>
      <td style={{ ...td, textTransform: 'capitalize' }}>{guest.status ?? 'active'}</td>
      <td style={td}>{phaseLabel(guest)}</td>
      <td style={td}>{props.room ?? <span style={muted}>—</span>}</td>
      <td style={td}>{formatDay(guest.moveInDate) ?? <span style={muted}>Not recorded</span>}</td>
      <td style={td}>
        <WeekCell week={props.week} />
      </td>
      {props.showBalance && <td style={td}>{balanceLabel(guest.rentOwed)}</td>}
    </tr>
  );
}
