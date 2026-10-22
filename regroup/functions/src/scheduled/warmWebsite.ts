import { logger } from 'firebase-functions';

/**
 * Keep-alive ping. Body of the `warmWebsite` scheduled function.
 */
export async function runWarmWebsite(): Promise<void> {
  logger.info('warmWebsite: keep-alive ping fired');
  // No outbound call is made. In functions v2 each function is its own Cloud
  // Run service, so this keeps only its own instance warm; to warm another
  // service, request its URL here.
}
