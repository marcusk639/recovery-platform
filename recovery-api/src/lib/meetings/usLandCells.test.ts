import { usBaseCells } from './usLandCells';

const cells = usBaseCells();
const covered = (lat: number, lng: number) =>
  cells.some((c) => lat >= c.s && lat <= c.n && lng >= c.w && lng <= c.e);

describe('usBaseCells', () => {
  it.each([
    ['Miami', 25.77, -80.19],
    ['Key West', 24.56, -81.78],
    ['San Francisco', 37.77, -122.42],
    ['Chicago lakefront', 41.88, -87.62],
    ['Tampa', 27.95, -82.46],
    ['New York', 40.71, -74.0],
    ['Rural Wyoming', 43.0, -108.0],
    ['Anchorage', 61.22, -149.9],
    ['Utqiagvik, Alaska', 71.29, -156.79],
    ['Honolulu', 21.31, -157.86],
    ['San Juan', 18.47, -66.11],
    ['St. Thomas', 18.34, -64.93],
    ['Guam', 13.47, 144.78],
    ['Pago Pago', -14.28, -170.7],
    ['Washington DC', 38.9, -77.04],
  ])('covers %s', (_name, lat, lng) => {
    expect(covered(lat, lng)).toBe(true);
  });

  it.each([
    ['mid Atlantic', 35, -60],
    ['mid Pacific', 35, -140],
    ['Gulf of Mexico', 25, -90],
    ['central Canada', 55, -100],
    ['central Mexico', 22, -102],
  ])('skips %s', (_name, lat, lng) => {
    expect(covered(lat, lng)).toBe(false);
  });

  it('stays small enough to sweep in one sitting', () => {
    expect(cells.length).toBeLessThan(25_000);
  });

  it('keeps lower-48 cells small enough for a search point to land in each service area', () => {
    const lower48 = cells.filter((c) => c.n <= 50 && c.w >= -125 && c.e <= -66);
    expect(Math.max(...lower48.map((c) => c.n - c.s))).toBeLessThanOrEqual(0.25);
    expect(Math.max(...lower48.map((c) => c.e - c.w))).toBeLessThanOrEqual(0.25);
  });
});
