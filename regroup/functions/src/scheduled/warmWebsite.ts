import { logger } from 'firebase-functions';

/**
 * Keep-alive ping. Body of the `warmWebsite` scheduled function.
 */
export async function runWarmWebsite(): Promise<void> {
  logger.info('warmWebsite: keep-alive ping fired');
  // The primary purpose of this function is to keep the Cloud Run instance
  // warm.  No outbound HTTP call is made here — the mere invocation of a
  // scheduled function in the same project achieves the warm-up effect for
  // co-located services.  If a specific URL needs pinging, add it below.
}
