import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Can from '../can';

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
