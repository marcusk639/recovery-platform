/**
 * iOS can't present a modal from a view controller that is already presenting
 * one. The app root presents every modal-group screen as a sheet, so a form
 * modal hosted at the root never appears over a sheet: UIKit logs "Attempt to
 * present ... on RCTRootViewController" and nothing happens. The sheet on top
 * has to host it. Android has no such limit and keeps the root host.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ModalProvider, ScreenModalHost, useModal } from '../ModalContext';

let mockIOS = true;
jest.mock('../../util/platform', () => ({
  ...jest.requireActual('../../util/platform'),
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));

jest.mock('react-native-modal', () => {
  const { View: RNView } = require('react-native');
  return ({ children, isVisible }: any) => (isVisible ? <RNView>{children}</RNView> : null);
});
jest.mock('../../components/rats-loading-modal', () => {
  const { Text: RNText } = require('react-native');
  return ({ isVisible }: any) => (isVisible ? <RNText>loading-modal</RNText> : null);
});
jest.mock('../../components/screen-header', () => () => null);
jest.mock('../../components/ios-status-bar', () => () => null);
jest.mock('../index', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const Buttons = () => {
  const { showFormModal, showLoadingModal, dismissFormModal } = useModal();
  return (
    <>
      <Pressable onPress={() => showFormModal(<Text>the-form</Text>)}>
        <Text>open</Text>
      </Pressable>
      <Pressable onPress={dismissFormModal}>
        <Text>close</Text>
      </Pressable>
      <Pressable onPress={() => showLoadingModal()}>
        <Text>load</Text>
      </Pressable>
    </>
  );
};

const Sheet = ({ id }: { id: string }) => (
  <View testID={id}>
    <ScreenModalHost />
  </View>
);

const App = ({ sheets = [] as string[] }) => (
  <ModalProvider>
    <Buttons />
    {sheets.map(id => (
      <Sheet key={id} id={id} />
    ))}
  </ModalProvider>
);

describe('where the form modal is hosted', () => {
  beforeEach(() => {
    mockIOS = true;
  });

  it('with no sheet up, shows once, from the root', () => {
    const view = render(<App />);
    fireEvent.press(view.getByText('open'));
    expect(view.getAllByText('the-form')).toHaveLength(1);
  });

  it('with a sheet up on iOS, shows once, inside that sheet', () => {
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('open'));
    expect(view.getAllByText('the-form')).toHaveLength(1);
    expect(within(view.getByTestId('sheet-a')).getByText('the-form')).toBeTruthy();
  });

  it('with sheets stacked, the top one hosts it', () => {
    const view = render(<App sheets={['sheet-a', 'sheet-b']} />);
    fireEvent.press(view.getByText('open'));
    expect(view.getAllByText('the-form')).toHaveLength(1);
    expect(within(view.getByTestId('sheet-b')).getByText('the-form')).toBeTruthy();
  });

  it('hosts the loading modal in the sheet too', () => {
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('load'));
    expect(view.getAllByText('loading-modal')).toHaveLength(1);
    expect(within(view.getByTestId('sheet-a')).getByText('loading-modal')).toBeTruthy();
  });

  it('goes back to the root when the sheet closes', () => {
    const view = render(<App sheets={['sheet-a']} />);
    view.rerender(<App />);
    fireEvent.press(view.getByText('open'));
    expect(view.getAllByText('the-form')).toHaveLength(1);
    expect(view.queryByTestId('sheet-a')).toBeNull();
  });

  it('a lower sheet takes over when the top one closes', () => {
    const view = render(<App sheets={['sheet-a', 'sheet-b']} />);
    view.rerender(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('open'));
    expect(within(view.getByTestId('sheet-a')).getByText('the-form')).toBeTruthy();
  });

  it('closes when dismissed', () => {
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('open'));
    fireEvent.press(view.getByText('close'));
    expect(view.queryByText('the-form')).toBeNull();
  });

  it('on Android, stays at the root with a sheet up', () => {
    mockIOS = false;
    const view = render(<App sheets={['sheet-a']} />);
    fireEvent.press(view.getByText('open'));
    expect(view.getAllByText('the-form')).toHaveLength(1);
    expect(within(view.getByTestId('sheet-a')).queryByText('the-form')).toBeNull();
  });
});
