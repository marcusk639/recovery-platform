import { HouseLink } from './HouseLink';
import { SHOW_LATER_AREAS, sectionsFor } from './houses/areas';
import { font } from './ui';
import { SECTIONS, sectionForRoute, sectionPath, type Section } from './urls';
import { useHouseAccess } from './useHouseAccess';

const ID: Record<Section, string> = {
  summary: 'nav-house-summary',
  residents: 'nav-residents',
  beds: 'nav-beds',
  applications: 'nav-applications',
  payments: 'nav-payments',
  disputes: 'nav-disputes',
  activities: 'nav-activities',
  drugTests: 'nav-drug-tests',
  issues: 'nav-issues',
  complaints: 'nav-complaints',
  reports: 'nav-reports',
};

const tab = (current: boolean) => ({
  padding: '8px 10px',
  color: current ? '#1d2a33' : '#1f5f8b',
  fontWeight: current ? 700 : 500,
  textDecoration: 'none',
  borderBottom: current ? '2px solid #1f5f8b' : '2px solid transparent',
  whiteSpace: 'nowrap' as const,
});

// The house's sections. While a manager's tier is being confirmed, the full-view
// tabs stay out rather than appearing and then vanishing for a peer leader.
export function HouseTabs({ houseId, routeName }: { houseId: string; routeName: string }) {
  const { view } = useHouseAccess(houseId);
  const currentSection = sectionForRoute(routeName);
  return (
    <nav
      aria-label="House sections"
      style={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, padding: '0 16px', borderBottom: '1px solid #dde3e8', background: '#fff', font: `14px/1.4 ${font}` }}>
      {sectionsFor(SHOW_LATER_AREAS, view === 'full').map((section) => (
        <HouseLink
          key={section}
          id={ID[section]}
          href={sectionPath(houseId, section)}
          route={SECTIONS[section].route}
          params={{ houseId }}
          current={section === currentSection}
          style={tab(section === currentSection)}>
          {SECTIONS[section].label}
        </HouseLink>
      ))}
    </nav>
  );
}
