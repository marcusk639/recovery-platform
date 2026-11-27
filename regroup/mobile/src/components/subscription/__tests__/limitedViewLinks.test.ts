/**
 * The limited view is the only way a resident of a blocked house reaches
 * Payment History or Documents (P5 Review Focus 2). Both are modal routes,
 * outside SubscriptionGate, so a deep link to either would skip the gate:
 * neither may appear anywhere in the linking config.
 */
import { linkingConfig } from '../../../navigation/linking';
import { Routes } from '../../../navigation/types';

function screenNames(screens: Record<string, unknown> | undefined): string[] {
  return Object.entries(screens ?? {}).flatMap(([name, value]) => [
    name,
    ...(value && typeof value === 'object'
      ? screenNames((value as { screens?: Record<string, unknown> }).screens)
      : []),
  ]);
}

describe('linking config and the limited view', () => {
  const names = screenNames(linkingConfig.config?.screens as Record<string, unknown>);

  it('reads a non-empty screens map', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each([Routes.PaymentHistory, Routes.Documents])('has no deep link to %s', (route) => {
    expect(names).not.toContain(route);
  });
});
