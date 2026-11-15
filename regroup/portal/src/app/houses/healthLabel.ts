import { getHealthByPercentage, HEALTH_STATUS_MAP } from '@mobile/util/guest';

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

// The phone's word for a health percent ("NEEDS WORK"), in sentence case.
export const healthLabel = (percent: number): string =>
  titleCase((HEALTH_STATUS_MAP as Record<string, string>)[getHealthByPercentage(percent)] ?? '');
