import { fetchCelebrateRecoveryMeetings } from './celebrateRecovery';
import { fetchAAMeetings } from './meetingGuide';

/**
 * A source that answers 200 with the wrong body must count as a failed fetch.
 * Reading it as "no meetings here" would let the prune guard treat an outage as
 * a healthy sweep and delete good rows.
 */

function jsonFetch(body: unknown) {
  return jest.fn(async () => ({ ok: true, json: async () => body })) as unknown as jest.Mock &
    typeof fetch;
}

function textFetch(body: string) {
  return jest.fn(async () => ({ ok: true, text: async () => body })) as unknown as jest.Mock &
    typeof fetch;
}

describe('fetchAAMeetings responses', () => {
  it.each([[{}], [null], [{ meetings: 'nope' }], [{ error: 'Unauthorized' }]])(
    'treats the unexpected body %j as a failure',
    async (body) => {
      await expect(fetchAAMeetings(40, -100, { fetchFn: jsonFetch(body) })).rejects.toThrow(
        /Meeting Guide/,
      );
    },
  );

  it('still accepts an empty list, which is a real answer for an empty cell', async () => {
    await expect(
      fetchAAMeetings(40, -100, { fetchFn: jsonFetch({ meetings: [] }) }),
    ).resolves.toEqual([]);
  });

  it('gives the request a timeout so a hung cell cannot stall the sweep', async () => {
    const fetchFn = jsonFetch({ meetings: [] });

    await fetchAAMeetings(40, -100, { fetchFn });

    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchCelebrateRecoveryMeetings responses', () => {
  it.each([['<html><body>Maintenance</body></html>'], ['<other></other>']])(
    'treats the unexpected body %s as a failure',
    async (xml) => {
      await expect(
        fetchCelebrateRecoveryMeetings(40, -100, { fetchFn: textFetch(xml) }),
      ).rejects.toThrow(/Celebrate Recovery/);
    },
  );

  it('still accepts empty markers, which is a real answer for an empty cell', async () => {
    await expect(
      fetchCelebrateRecoveryMeetings(40, -100, { fetchFn: textFetch('<markers></markers>') }),
    ).resolves.toEqual([]);
  });

  it('gives the request a timeout so a hung cell cannot stall the sweep', async () => {
    const fetchFn = textFetch('<markers></markers>');

    await fetchCelebrateRecoveryMeetings(40, -100, { fetchFn });

    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
