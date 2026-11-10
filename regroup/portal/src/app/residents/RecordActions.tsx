import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PhaseAdvancementBanner from '@mobile/components/phase-advancement-banner/PhaseAdvancementBanner';
import DischargeGuestModal from '@mobile/screens/Profile/DischargeGuestModal';
import { guestKeys } from '@mobile/state/queries/guestQueries';
import { fullName } from './rows';

const button = {
  padding: '6px 12px',
  border: '1px solid #b9c6cf',
  borderRadius: 6,
  background: '#fff',
  color: '#9a2a1f',
  font: 'inherit',
  cursor: 'pointer',
};

// The phone's own discharge and phase advancement, on the record. Every portal
// user is staff, so the banner gets isAdmin; the rules still rank who may discharge.
export function RecordActions({ guest, house }: { guest: any; house: any }) {
  const queryClient = useQueryClient();
  const [discharging, setDischarging] = useState(false);
  const discharged = guest.status === 'discharged';
  return (
    <div style={{ margin: '0 0 16px' }}>
      {!discharged && <PhaseAdvancementBanner guest={guest} house={house} isAdmin />}
      {!discharged && (
        <p style={{ margin: '8px 0 0' }}>
          <button type="button" style={button} onClick={() => setDischarging(true)}>
            Discharge
          </button>
        </p>
      )}
      <DischargeGuestModal
        visible={discharging}
        guestId={guest.id}
        guestName={fullName(guest)}
        onClose={() => setDischarging(false)}
        onSuccess={() => {
          setDischarging(false);
          queryClient.invalidateQueries({ queryKey: guestKeys.list(house.id) });
          queryClient.invalidateQueries({ queryKey: guestKeys.detail(guest.id) });
        }}
      />
    </div>
  );
}
