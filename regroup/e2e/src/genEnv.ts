import { writeFunctionsEnvFiles } from './launchConfig';
import { readStagingPrices } from './stagingPrices';

export type GenerateResult = {
  written: string[];
  /** Why .env.regroup-e2e was not written; absent when it was. */
  stagingError?: string;
};

/**
 * Writes both generated env files when the e2e sandbox prices load. When they
 * do not, writes only the emulator file (which needs no Stripe prices) and
 * leaves any existing staging file untouched, reporting why.
 */
export function generateEnvFiles(functionsDir: string, pricesFile: string): GenerateResult {
  let prices: Record<string, string>;
  try {
    prices = readStagingPrices(pricesFile);
  } catch (err) {
    return {
      written: writeFunctionsEnvFiles(functionsDir, {}, ['e2e-emulator']),
      stagingError: (err as Error).message,
    };
  }
  return { written: writeFunctionsEnvFiles(functionsDir, { 'e2e-staging': prices }) };
}
