import { canAccessHouse } from './access';
import { useCurrentHouseId } from './current-house';
import { HouseLink } from './HouseLink';
import { signOutAndReset } from './session';
import { HOME_ROUTE, SECTIONS, sectionPath, type Section } from './urls';
import { useRoles } from './useRoles';

const ORDER: Section[] = ['summary', 'residents', 'applications', 'payments', 'disputes', 'activities', 'reports'];
const NAV_IDS: Record<Section, string> = {
  summary: 'nav-house-summary',
  residents: 'nav-residents',
  applications: 'nav-applications',
  payments: 'nav-payments',
  disputes: 'nav-disputes',
  activities: 'nav-activities',
  reports: 'nav-reports',
};

const link = { display: 'block', padding: '8px 16px', color: '#d7e3ea', textDecoration: 'none' };

export function Sidebar() {
  const houseId = useCurrentHouseId();
  const roles = useRoles();
  const showSections = houseId !== null && canAccessHouse(roles, houseId);
  const path = typeof location === 'undefined' ? '' : location.pathname;
  return (
    <nav
      aria-label="Main"
      style={{
        width: 200,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
        background: '#1f3a4d',
        font: '14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
      <div style={{ padding: '0 16px 12px', color: '#fff', fontSize: 16, fontWeight: 700 }}>Regroup</div>
      <HouseLink id="nav-home" href="/" route={HOME_ROUTE} current={path === '/'} style={link}>
        Houses
      </HouseLink>
      {showSections &&
        ORDER.map((section) => {
          const href = sectionPath(houseId, section);
          return (
            <HouseLink
              key={section}
              id={NAV_IDS[section]}
              href={href}
              route={SECTIONS[section].route}
              params={{ houseId }}
              current={path === href}
              style={link}>
              {SECTIONS[section].label}
            </HouseLink>
          );
        })}
      <button
        id="sign-out"
        type="button"
        onClick={() => signOutAndReset()}
        style={{ margin: 'auto 16px 0', padding: 8, font: 'inherit', cursor: 'pointer' }}>
        Sign out
      </button>
    </nav>
  );
}
