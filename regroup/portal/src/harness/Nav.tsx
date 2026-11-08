import { Routes } from '@mobile/navigation/types';
import { navigationRef } from '@mobile/navigation/service';

// A test harness only, not the portal's navigation.
export function Nav({ houseId }: { houseId: string }) {
  const items: [string, string, string, object?][] = [
    ['nav-residents', 'Residents', Routes.GuestList],
    ['nav-disputes', 'Disputes', Routes.HouseDisputes],
    ['nav-payments', 'Payments', Routes.PaymentDashboard],
    ['nav-documents', 'Documents', Routes.Documents, { houseId, guestId: 'guest-a', title: 'Documents' }],
    ['nav-house-summary', 'House', Routes.HouseSummary],
  ];
  return (
    <nav style={{ width: 170, flex: 'none', padding: 12, background: '#1f3a4d' }}>
      {items.map(([id, label, route, params]) => (
        <button
          key={id}
          id={id}
          style={{ display: 'block', width: '100%', marginBottom: 6 }}
          onClick={() => navigationRef.current?.navigate(route, params)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
