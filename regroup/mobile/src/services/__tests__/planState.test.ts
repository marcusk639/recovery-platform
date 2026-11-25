import { QueryClient } from '@tanstack/react-query';
import { refreshPlanState } from '../planState';

jest.mock('../../state/queries/houseKeys', () => ({
  houseKeys: { detail: (id: string) => ['houses', 'detail', id] },
}));

// The query keys SubscriptionGate reads its decision from; refreshing them
// makes the gate re-decide after billing on the web (launch P5 Task 10).
describe('refreshPlanState', () => {
  it('invalidates the user, the house detail and the paywall config, once each', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    refreshPlanState(client, { id: 'u1', houseId: 'h1' });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['user', 'u1'],
      ['houses', 'detail', 'h1'],
      ['paywall', 'config'],
    ]);
  });

  it('skips the user and house keys it has no id for', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    refreshPlanState(client, null);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([['paywall', 'config']]);
  });
});
