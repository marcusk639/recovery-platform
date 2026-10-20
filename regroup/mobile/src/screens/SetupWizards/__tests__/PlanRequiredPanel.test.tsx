// PlanRequiredPanel replaces the wizard when the operator has no active plan:
// it links to the existing plan screen and can re-check.
jest.mock('../../../state/store', () => ({ useAppDispatch: () => jest.fn() }));
jest.mock('../../../state/slices/userSlice', () => ({ logout: jest.fn() }));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Routes } from '../../../navigation/types';
import PlanRequiredPanel from '../PlanRequiredPanel';

describe('PlanRequiredPanel', () => {
  it('opens the subscription screen and re-checks on request', () => {
    const navigation = { navigate: jest.fn() } as any;
    const onCheckAgain = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <PlanRequiredPanel navigation={navigation} onCheckAgain={onCheckAgain} />,
    );
    expect(getByText('You need an active plan')).toBeTruthy();
    expect(queryByTestId('complete-setup-button')).toBeNull();

    fireEvent.press(getByTestId('plan-required-view-plans'));
    expect(navigation.navigate).toHaveBeenCalledWith(Routes.SubscriptionHandler);

    fireEvent.press(getByTestId('plan-required-check-again'));
    expect(onCheckAgain).toHaveBeenCalled();
  });
});
