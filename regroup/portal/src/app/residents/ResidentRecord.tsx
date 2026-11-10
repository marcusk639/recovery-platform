import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelectedHouse } from '@mobile/hooks/useSelectedHouse';
import { Routes } from '@mobile/navigation/types';
import { useGuest } from '@mobile/state/queries/guestQueries';
import { HouseLink } from '../HouseLink';
import { isRouteReleased, SHOW_LATER_AREAS } from '../houses/areas';
import { formatDay } from '../houses/summary';
import { heading, link, muted, page } from '../ui';
import { residentPath, sectionPath } from '../urls';
import { useHouseAccess } from '../useHouseAccess';
import { RecordActions } from './RecordActions';
import { OpenItemsSection, PaymentsSection, RecoverySection, WeekSection } from './RecordSections';
import { fullName, phaseLabel, roomOf } from './rows';

// One resident. Read-only in P3, apart from links to the phone's own screens.
// ResidentGate has already confirmed the resident belongs to this house.
export function ResidentRecord() {
  const navigation = useNavigation<any>();
  const guestId: string | undefined = (useRoute().params as any)?.guestId;
  const { house } = useSelectedHouse() as { house: any };
  const { data } = useGuest(guestId ?? '', !!guestId);
  const guest = data as any;
  const { view } = useHouseAccess(house?.id ?? '');

  if (!house) return null;
  if (!guestId || !guest) {
    return (
      <div style={page}>
        <p>
          Choose a resident from the <a href={sectionPath(house.id, 'residents')}>list</a>.
        </p>
      </div>
    );
  }
  const room = roomOf(house.rooms, guest.id);
  const movedIn = formatDay(guest.moveInDate);
  const documents = isRouteReleased(Routes.Documents, SHOW_LATER_AREAS)
    ? () => navigation.navigate(Routes.Documents, { houseId: house.id, guestId: guest.id, title: `${guest.firstName ?? ''} Documents` })
    : null;
  return (
    <div style={page}>
      <h1 style={{ ...heading, marginBottom: 4 }}>{fullName(guest)}</h1>
      <p data-testid="record-header" style={{ margin: '0 0 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ textTransform: 'capitalize' }}>{guest.status ?? 'active'}</span>
        <span>· {phaseLabel(guest)}</span>
        <span>· {room ? `Room ${room}` : <span style={muted}>No room</span>}</span>
        <span>· {movedIn ? `Moved in ${movedIn}` : <span style={muted}>Move-in not recorded</span>}</span>
        <span>
          ·{' '}
          <HouseLink href={`${residentPath(house.id, guest.id)}/profile`} route={Routes.GuestInfo} params={{ houseId: house.id, guestId: guest.id }} style={link}>
            Full profile
          </HouseLink>
        </span>
      </p>
      <RecordActions guest={guest} house={house} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
        <WeekSection guest={guest} house={house} />
        <PaymentsSection guest={guest} houseId={house.id} />
        <RecoverySection guest={guest} fullView={view === 'full'} />
        <OpenItemsSection guest={guest} houseId={house.id} onDocuments={documents} />
      </div>
    </div>
  );
}
