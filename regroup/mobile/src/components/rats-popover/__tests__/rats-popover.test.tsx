/**
 * Tests for RatsPopover component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

jest.mock('react-native-popover-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, isVisible, testID, ...rest }: any) => (
      <View testID={testID || 'popover'} {...rest}>
        {children}
      </View>
    ),
    PopoverMode: { RN_MODAL: 'RN_MODAL' },
    PopoverPlacement: {
      TOP: 'TOP',
      BOTTOM: 'BOTTOM',
      LEFT: 'LEFT',
      RIGHT: 'RIGHT',
      AUTO: 'AUTO',
    },
  };
});

// Mock the dist types module
jest.mock('react-native-popover-view/dist/Popover', () => ({}), {
  virtual: true,
});

import { RatsPopover } from '../index';

describe('RatsPopover', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsPopover isVisible={false}>
        <Text>Popover Content</Text>
      </RatsPopover>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders children inside the popover', () => {
    const { getByText } = render(
      <RatsPopover isVisible={true}>
        <Text>Child Text</Text>
      </RatsPopover>,
    );
    expect(getByText('Child Text')).toBeTruthy();
  });

  it('renders with isVisible=false without crashing', () => {
    const { toJSON } = render(
      <RatsPopover isVisible={false}>
        <Text>Hidden Content</Text>
      </RatsPopover>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with isVisible=true without crashing', () => {
    const { toJSON } = render(
      <RatsPopover isVisible={true}>
        <View testID="inner-view" />
      </RatsPopover>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('passes props through to the underlying Popover', () => {
    const onRequestClose = jest.fn();
    const { getByTestId } = render(
      <RatsPopover isVisible={true} testID="my-popover" onRequestClose={onRequestClose}>
        <Text>Content</Text>
      </RatsPopover>,
    );
    expect(getByTestId('my-popover')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <RatsPopover isVisible={true}>
        <Text>First</Text>
        <Text>Second</Text>
      </RatsPopover>,
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('renders with a View as child', () => {
    const { getByTestId } = render(
      <RatsPopover isVisible={true}>
        <View testID="view-child" />
      </RatsPopover>,
    );
    expect(getByTestId('view-child')).toBeTruthy();
  });

  it('accepts onCloseComplete callback prop', () => {
    const onCloseComplete = jest.fn();
    const { toJSON } = render(
      <RatsPopover isVisible={false} onCloseComplete={onCloseComplete}>
        <Text>Done</Text>
      </RatsPopover>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with placement prop without crashing', () => {
    const { toJSON } = render(
      <RatsPopover isVisible={true} placement="bottom" as any>
        <Text>Placed Content</Text>
      </RatsPopover>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
