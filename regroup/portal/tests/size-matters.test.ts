import { moderateScale, moderateVerticalScale, ms, mvs, s, scale, verticalScale, vs } from '../src/adapter/size-matters';

test('sizes scale against a 390 by 844 phone', () => {
  expect(scale(10)).toBeCloseTo((10 * 390) / 350);
  expect(verticalScale(10)).toBeCloseTo((10 * 844) / 680);
  expect(moderateScale(14)).toBeCloseTo(14 + ((14 * 390) / 350 - 14) * 0.5);
  expect(moderateVerticalScale(14)).toBeCloseTo(14 + ((14 * 844) / 680 - 14) * 0.5);
});

test('a factor of zero keeps the designed size', () => {
  expect(moderateScale(14, 0)).toBe(14);
});

test('the short aliases match the long names', () => {
  expect(s(10)).toBe(scale(10));
  expect(vs(10)).toBe(verticalScale(10));
  expect(ms(14)).toBe(moderateScale(14));
  expect(mvs(14)).toBe(moderateVerticalScale(14));
});

test('a wide window at load changes nothing', async () => {
  vi.resetModules();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2560 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1440 });
  const fresh = await import('../src/adapter/size-matters');
  expect(fresh.moderateScale(14)).toBeCloseTo(14 + ((14 * 390) / 350 - 14) * 0.5);
});
