// PlanRequiredPanel replaces the wizard when the operator has no active plan:
// it opens the web pricing page in the browser and can re-check.
jest.mock('../../../state/store', () => ({ useAppDispatch: () => jest.fn() }));
jest.mock('../../../state/slices/userSlice', () => ({ logout: jest.fn() }));
const mockOpenWebBilling = jest.fn((_page: string) => Promise.resolve(true));
jest.mock('../../../services/webBilling', () => ({
  openWebBilling: (page: string) => mockOpenWebBilling(page),
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PlanRequiredPanel from '../PlanRequiredPanel';

describe('PlanRequiredPanel', () => {
  it('opens web pricing in the browser and re-checks on request', () => {
    const navigation = { navigate: jest.fn() } as any;
    const onCheckAgain = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <PlanRequiredPanel navigation={navigation} onCheckAgain={onCheckAgain} />,
    );
    expect(getByText('You need an active plan')).toBeTruthy();
    expect(queryByTestId('complete-setup-button')).toBeNull();

    fireEvent.press(getByTestId('plan-required-view-plans'));
    expect(mockOpenWebBilling).toHaveBeenCalledWith('pricing');
    expect(navigation.navigate).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('plan-required-check-again'));
    expect(onCheckAgain).toHaveBeenCalled();
  });
});
