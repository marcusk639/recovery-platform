import * as fs from 'fs';
import { PRICE_ENV_VARS } from './stripeSandbox';

const PRICE_ID = /^price_[A-Za-z0-9]+$/;

/**
 * Reads the price ids that scripts/stripe-sandbox-setup.ts wrote for the e2e
 * sandbox. Strict, because a missing or wrong price only shows up when a
 * staging subscribe call fails. Values are never echoed in errors.
 */
export function readStagingPrices(file: string): Record<string, string> {
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} not found. Run scripts/stripe-sandbox-setup.ts first; it writes the e2e sandbox price ids there.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} must be a JSON object of env var name to price id`);
  }
  const prices = parsed as Record<string, unknown>;
  const missing = PRICE_ENV_VARS.filter((name) => !(name in prices));
  if (missing.length) throw new Error(`${file} is missing ${missing.join(', ')}`);
  const unexpected = Object.keys(prices).filter((name) => !PRICE_ENV_VARS.includes(name));
  if (unexpected.length) throw new Error(`${file} has unexpected ${unexpected.join(', ')}`);
  for (const name of PRICE_ENV_VARS) {
    const value = prices[name];
    if (typeof value !== 'string' || !PRICE_ID.test(value)) {
      throw new Error(`${file}: ${name} is not a Stripe price id`);
    }
  }
  return prices as Record<string, string>;
}
