import { useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useGuest } from '@mobile/state/queries/guestQueries';
import { selectGuestById } from '@mobile/state/slices/guestsSlice';
import { noticeStyle } from '../Notice';
import { sectionPath } from '../urls';

function Message({ houseId, children }: { houseId: string; children: ReactNode }) {
  return (
    <div style={noticeStyle}>
      <p>{children}</p>
      <p>
        <a href={sectionPath(houseId, 'residents')}>Back to the residents</a>
      </p>
    </div>
  );
}

// The resident's screen renders, and the resident is selected for reused screens,
// only once their record is confirmed to belong to the house in the URL.
export function ResidentGate({ houseId, guestId, children }: { houseId: string; guestId: string; children: ReactNode }) {
  const dispatch = useDispatch();
  const { data: guest, status } = useGuest(guestId, true);
  const selected = useSelector((state: any) => state.guests.selectedGuestId);
  const belongs = status === 'success' && (guest as any)?.houseId === houseId;

  useEffect(() => {
    if (belongs && selected !== guestId) dispatch(selectGuestById(guestId));
  }, [belongs, selected, guestId, dispatch]);

  if (status === 'pending') {
    return (
      <p role="status" style={noticeStyle}>
        Loading this resident...
      </p>
    );
  }
  if (status === 'error' || !guest) return <Message houseId={houseId}>Couldn't open this resident.</Message>;
  if (!belongs) return <Message houseId={houseId}>This resident isn't in this house.</Message>;
  return selected === guestId ? <>{children}</> : null;
}
