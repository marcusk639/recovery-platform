import { sweepMeetingGuide, type SweepCell } from './meetingSweep';

const CELL: SweepCell = { s: 40, n: 40.25, w: -74.25, e: -74 };
const noSleep = async () => undefined;

function recordingApi() {
  const searches: URLSearchParams[] = [];
  const fetchFn = (async (url: string) => {
    searches.push(new URL(url).searchParams);
    return { ok: true, status: 200, json: async () => ({ meetings: [] }) };
  }) as unknown as typeof fetch;
  return { fetchFn, searches };
}

describe('sweepMeetingGuide search point', () => {
  it('searches from the center of a cell by default', async () => {
    const { fetchFn, searches } = recordingApi();
    await sweepMeetingGuide({ key: 'k', baseCells: [CELL], fetchFn, sleep: noSleep });
    expect(Number(searches[0].get('latitude'))).toBeCloseTo(40.125);
    expect(Number(searches[0].get('longitude'))).toBeCloseTo(-74.125);
  });

  it('searches from the point a cell names, as for a cell centered on water', async () => {
    const { fetchFn, searches } = recordingApi();
    const point = { lat: 40.01, lng: -74.24 };
    await sweepMeetingGuide({ key: 'k', baseCells: [{ ...CELL, point }], fetchFn, sleep: noSleep });
    expect(Number(searches[0].get('latitude'))).toBe(40.01);
    expect(Number(searches[0].get('longitude'))).toBe(-74.24);
  });

  it('widens the radius to reach the far corner from an off-center point', async () => {
    const { fetchFn, searches } = recordingApi();
    const point = { lat: 40.01, lng: -74.24 };
    await sweepMeetingGuide({ key: 'k', baseCells: [{ ...CELL, point }], fetchFn, sleep: noSleep });
    // About 33 km to the far corner, against about 17 km from the center.
    expect(Number(searches[0].get('radius'))).toBeGreaterThanOrEqual(33);
  });

  it('finds a meeting only the land point can see, as the API gates on service area', async () => {
    const point = { lat: 40.01, lng: -74.24 };
    const fetchFn = (async (url: string) => {
      const isLandPoint = new URL(url).searchParams.get('latitude') === '40.01';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          meetings: isLandPoint ? [{ id: 7, country: 'US', distance: 1 }] : [],
        }),
      };
    }) as unknown as typeof fetch;
    const result = await sweepMeetingGuide({
      key: 'k',
      baseCells: [CELL, { ...CELL, point }],
      fetchFn,
      sleep: noSleep,
    });
    expect(result.meetings.map((m) => m.id)).toEqual([7]);
  });
});
