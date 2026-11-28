import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Can, { can } from '../can';

describe('Can', () => {
  const yesComponent = () => <Text>Allowed</Text>;
  const noComponent = () => <Text>Denied</Text>;

  it('renders yes() when guest has static permission for house:view', () => {
    const { getByText } = render(
      <Can
        role="guest"
        action="house:view"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('renders no() when role has no permissions at all (anonymous)', () => {
    const { getByText } = render(
      <Can
        role={'anonymous' as any}
        action="house:view"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Denied')).toBeTruthy();
  });

  it('renders yes() when admin has house:partial-edit permission', () => {
    const { getByText } = render(
      <Can
        role="admin"
        action="house:partial-edit"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('renders no() when admin tries house:full-edit (not in admin static list)', () => {
    const { getByText } = render(
      <Can
        role="admin"
        action="house:full-edit"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Denied')).toBeTruthy();
  });

  it('renders yes() when superAdmin has house:create permission', () => {
    const { getByText } = render(
      <Can
        role="superAdmin"
        action="house:create"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('renders yes() for guest dynamic guest:edit when guestUserId matches userId', () => {
    const { getByText } = render(
      <Can
        role="guest"
        action="guest:edit"
        data={{ guestUserId: 'user123', userId: 'user123' }}
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('renders no() for guest dynamic guest:edit when guestUserId does not match userId', () => {
    const { getByText } = render(
      <Can
        role="guest"
        action="guest:edit"
        data={{ guestUserId: 'user123', userId: 'user456' }}
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Denied')).toBeTruthy();
  });

  it('renders yes() for guest dynamic guest:delete when ids match', () => {
    const { getByText } = render(
      <Can
        role="guest"
        action="guest:delete"
        data={{ guestUserId: 'abc', userId: 'abc' }}
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('uses default no() returning null when no prop provided', () => {
    const { queryByText } = render(
      <Can
        role={'anonymous' as any}
        action="house:view"
        yes={yesComponent}
      />,
    );
    expect(queryByText('Denied')).toBeNull();
  });

  it('uses default yes() returning null when no prop provided', () => {
    const { queryByText } = render(
      <Can
        role="guest"
        action="house:view"
        no={noComponent}
      />,
    );
    // yes() defaults to returning null so nothing should render for the "yes" branch
    expect(queryByText('Allowed')).toBeNull();
  });

  it('renders no() for admin guest:delete (not in admin static list)', () => {
    const { getByText } = render(
      <Can
        role="admin"
        action="guest:delete"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Denied')).toBeTruthy();
  });

  it('renders yes() for superAdmin guest:delete static permission', () => {
    const { getByText } = render(
      <Can
        role="superAdmin"
        action="guest:delete"
        yes={yesComponent}
        no={noComponent}
      />,
    );
    expect(getByText('Allowed')).toBeTruthy();
  });
});

// Owner decision 2026-11-27 (#308): managers get the House Settings gear.
// Managers and peer leaders hold the same admin claim; the house tier
// (myHouseTiers) tells them apart, so the gear's action takes it as data.
describe('house:settings (the House Settings gear)', () => {
  const yes = () => <Text>Allowed</Text>;
  const no = () => <Text>Denied</Text>;
  const renderFor = (role: string, data?: object) =>
    render(<Can role={role as any} action="house:settings" data={data} yes={yes} no={no} />);

  it('is the owner\'s without asking for the tier', () => {
    expect(renderFor('superAdmin').getByText('Allowed')).toBeTruthy();
  });

  it('is a manager\'s', () => {
    expect(renderFor('admin', { houseTier: 'manager' }).getByText('Allowed')).toBeTruthy();
  });

  it('is not a peer leader\'s', () => {
    expect(renderFor('admin', { houseTier: 'peerLeader' }).getByText('Denied')).toBeTruthy();
  });

  it('is refused to staff while the tier is unknown', () => {
    expect(renderFor('admin').getByText('Denied')).toBeTruthy();
    expect(renderFor('admin', {}).getByText('Denied')).toBeTruthy();
  });

  it('is not a resident\'s, whatever the data says', () => {
    expect(renderFor('guest', { houseTier: 'manager' }).getByText('Denied')).toBeTruthy();
  });
});

describe('can (the check behind Can, for code that is not rendering)', () => {
  it('keeps house:full-edit for the owner', () => {
    expect(can('superAdmin' as any, 'house:full-edit')).toBe(true);
    expect(can('admin' as any, 'house:full-edit')).toBe(false);
    expect(can(undefined as any, 'house:full-edit')).toBe(false);
  });

  it('answers house:settings as Can does', () => {
    expect(can('admin' as any, 'house:settings', { houseTier: 'manager' })).toBe(true);
    expect(can('admin' as any, 'house:settings', { houseTier: 'peerLeader' })).toBe(false);
  });
});
