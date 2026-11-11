import * as fs from 'fs';
import * as path from 'path';
import { parseOperatorArgs, PLANS_FOR_SALE } from '../stagingOperator/plan';

describe('parseOperatorArgs', () => {
  it('parses --house-type traditional --tier professional --interval year', () => {
    expect(
      parseOperatorArgs([
        '--house-type',
        'traditional',
        '--tier',
        'professional',
        '--interval',
        'year',
      ]),
    ).toEqual({ houseType: 'traditional', tier: 'professional', interval: 'year' });
  });

  it('defaults the interval to month', () => {
    expect(parseOperatorArgs(['--house-type', 'oxford', '--tier', 'plus'])).toEqual({
      houseType: 'oxford',
      tier: 'plus',
      interval: 'month',
    });
  });

  it('refuses a tier that is not for sale', () => {
    expect(() => parseOperatorArgs(['--house-type', 'oxford', '--tier', 'network'])).toThrow(
      'standard, plus',
    );
  });

  it('refuses an unknown house type, tier or interval, or a missing flag', () => {
    expect(() =>
      parseOperatorArgs([
        '--house-type',
        'traditional',
        '--tier',
        'starter',
        '--interval',
        'annual',
      ]),
    ).toThrow('month, year');
    expect(() => parseOperatorArgs(['--house-type', 'castle', '--tier', 'starter'])).toThrow(
      'traditional, oxford',
    );
    expect(() => parseOperatorArgs(['--house-type', 'traditional', '--tier', 'gold'])).toThrow(
      'starter, professional, enterprise',
    );
    expect(() => parseOperatorArgs(['--house-type', 'traditional'])).toThrow('--tier');
    expect(() => parseOperatorArgs(['--tier', 'starter'])).toThrow('--house-type');
    expect(() =>
      parseOperatorArgs(['--house-type', 'traditional', '--tier', 'starter', '--colour', 'red']),
    ).toThrow('--colour');
    expect(() => parseOperatorArgs(['--house-type', 'traditional', '--tier'])).toThrow('--tier');
  });
});

describe('PLANS_FOR_SALE', () => {
  it('matches the tiers for sale in functions/src/config.ts', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'functions', 'src', 'config.ts'),
      'utf8',
    );
    const lines = source.split('\n');
    const start = lines.indexOf('export const SUBSCRIPTION_TIERS = {');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((line, i) => i > start && line.startsWith('}'));
    const block = lines.slice(start + 1, end);

    const forSale: Record<string, string[]> = {};
    let house = '';
    let tier = '';
    let tierLines: string[] = [];
    const closeTier = () => {
      if (tier && !tierLines.some((l) => l.includes('availableForSale: false'))) {
        forSale[house].push(tier);
      }
      tier = '';
      tierLines = [];
    };
    for (const line of block) {
      const houseMatch = /^ {2}(\w+): \{/.exec(line);
      const tierMatch = /^ {4}(\w+): \{/.exec(line);
      if (houseMatch) {
        closeTier();
        house = houseMatch[1];
        forSale[house] = [];
      } else if (tierMatch) {
        closeTier();
        tier = tierMatch[1];
      } else if (tier) {
        tierLines.push(line);
      }
    }
    closeTier();

    expect(forSale).toEqual({
      traditional: ['starter', 'professional', 'enterprise'],
      oxford: ['standard', 'plus'],
    });
    expect(PLANS_FOR_SALE).toEqual(forSale);
  });
});
