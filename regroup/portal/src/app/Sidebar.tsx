import { HouseLink } from './HouseLink';
import { signOutAndReset } from './session';
import { font } from './ui';
import { HOME_ROUTE } from './urls';

// A house's sections are its tabs, so this holds only what is outside any house.
export function Sidebar() {
  const atHome = typeof location !== 'undefined' && location.pathname === '/';
  return (
    <nav
      aria-label="Main"
      style={{
        width: 160,
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
        background: '#1f3a4d',
        font: `14px/1.4 ${font}`,
      }}>
      <div style={{ padding: '0 16px 12px', color: '#fff', fontSize: 16, fontWeight: 700 }}>Regroup</div>
      <HouseLink
        id="nav-home"
        href="/"
        route={HOME_ROUTE}
        current={atHome}
        style={{ display: 'block', padding: '8px 16px', color: '#d7e3ea', textDecoration: 'none' }}>
        Houses
      </HouseLink>
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
