import { QueryClient } from '@tanstack/react-query';
import { refreshPlanState } from '../planState';

jest.mock('../../state/queries/houseKeys', () => ({
  houseKeys: { details: () => ['houses', 'detail'] },
}));

// The query keys SubscriptionGate reads its decision from; refreshing them
// makes the gate re-decide after billing on the web (launch P5 Task 10).
describe('refreshPlanState', () => {
  it('invalidates the user, every house detail and the paywall config, once each', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    refreshPlanState(client, { id: 'u1' });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['user', 'u1'],
      ['houses', 'detail'],
      ['paywall', 'config'],
    ]);
  });

  it('skips the user key when it has no id', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    refreshPlanState(client, null);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([['houses', 'detail'], ['paywall', 'config']]);
  });

  // The gate reads the selected house, which can differ from user.houseId.
  it('marks the selected house stale even when it is not user.houseId', async () => {
    const client = new QueryClient();
    client.setQueryData(['houses', 'detail', 'h-selected'], { id: 'h-selected' });
    client.setQueryData(['houses', 'detail', 'h-home'], { id: 'h-home' });
    refreshPlanState(client, { id: 'u1' });
    expect(client.getQueryState(['houses', 'detail', 'h-selected'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['houses', 'detail', 'h-home'])?.isInvalidated).toBe(true);
  });
});
