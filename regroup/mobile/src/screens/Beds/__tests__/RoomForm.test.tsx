// A room add or edit that fails must tell the operator, not close quietly.
import React from 'react';
import { act, render } from '@testing-library/react-native';

const mockMutateAsync = jest.fn();
const mockNotify = jest.fn();
let mockConfirm: () => unknown = () => undefined;

jest.mock('formik', () => ({
  Formik: ({ children, onSubmit, initialValues }: any) =>
    children({
      handleSubmit: () => onSubmit(initialValues),
      values: initialValues,
      setFieldValue: jest.fn(),
    }),
  Field: () => null,
  FieldArray: () => null,
}));
jest.mock('../../../components/confirmation-buttons', () => (props: any) => {
  mockConfirm = props.confirm;
  return null;
});
jest.mock('../../../state/store', () => ({
  useAppSelector: () => null,
  useAppDispatch: () => jest.fn(),
}));
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: { id: 'house-1', rooms: {} } }),
}));
jest.mock('../../../state/queries/guestQueries', () => ({ useGuests: () => ({ data: {} }) }));
jest.mock('../../../state/queries/houseQueries', () => ({
  useUpdateHouse: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock('../../../util/form', () => ({ renderField: () => null }));
jest.mock('../../../util/display', () => ({ getPickerItems: () => [] }));
jest.mock('../../../components/rats-text-input/rats-text-input', () => 'RatsTextInput');
jest.mock('../../../components/rats-button/rats-button', () => 'RatsButton');
jest.mock('../../../components/rats-picker/rats-picker', () => 'RatsPicker');
jest.mock(
  '../../../components/rats-scroll-view',
  () =>
    ({ children }: any) =>
      children,
);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

import RoomForm from '../RoomForm';

beforeEach(() => jest.clearAllMocks());

it('tells the operator when a new room is not saved', async () => {
  mockMutateAsync.mockRejectedValue(new Error('permission-denied'));
  render(
    <RoomForm
      action="add"
      dismissFormModal={jest.fn()}
      renderBedItem={() => <></>}
      notify={mockNotify}
    />,
  );
  await act(async () => {
    await mockConfirm();
  });
  expect(mockNotify).toHaveBeenCalledWith('Room Update Failed', expect.any(String), [], 'fail');
  expect(mockNotify).not.toHaveBeenCalledWith('Room Added', expect.anything(), [], 'succeed');
});

it('reports a saved room as added', async () => {
  mockMutateAsync.mockResolvedValue(undefined);
  render(
    <RoomForm
      action="add"
      dismissFormModal={jest.fn()}
      renderBedItem={() => <></>}
      notify={mockNotify}
    />,
  );
  await act(async () => {
    await mockConfirm();
  });
  expect(mockNotify).toHaveBeenCalledWith('Room Added', expect.any(String), [], 'succeed');
});
