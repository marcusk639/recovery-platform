import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

/**
 * The oldest app version allowed in, per platform (launch spec §4.2, the
 * minimum-version gate). Read from the server-only `config/app` document and
 * set with `npm run switch:set -- --switch=minVersion ...`, so it changes
 * without a deploy. `null` means no minimum.
 */
export interface AppConfigResponse {
  minVersion: { ios: string | null; android: string | null };
}

const CACHE_TTL_MS = 60 * 1000;
// x.y or x.y.z, the shape of CFBundleShortVersionString / versionName here.
const VERSION = /^\d+\.\d+(\.\d+)?$/;
const NO_MINIMUM: AppConfigResponse = { minVersion: { ios: null, android: null } };

let cache: { data: AppConfigResponse; expiresAt: number } | undefined;

const asVersion = (value: unknown): string | null =>
  typeof value === 'string' && VERSION.test(value) ? value : null;

/**
 * Never throws. A missing doc, a malformed value or a failed read all report
 * no minimum: the app fails open, and a wrong value here must not lock
 * everyone out (Review Focus 4). A failed read is not cached.
 */
async function readAppConfig(): Promise<{ data: AppConfigResponse; cacheable: boolean }> {
  try {
    const snap = await admin.firestore().collection('config').doc('app').get();
    const raw = snap.exists ? snap.get('minVersion') : undefined;
    const min = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      data: { minVersion: { ios: asVersion(min.ios), android: asVersion(min.android) } },
      cacheable: true,
    };
  } catch (err) {
    logger.error('getAppConfig.read_failed', { error: (err as Error)?.message });
    return { data: NO_MINIMUM, cacheable: false };
  }
}

/**
 * Public app configuration for the minimum-version gate.
 *
 * Deliberately does NOT check `request.auth`, like getTierCatalog: the gate
 * runs before sign-in, and the value is public by design (it's the version
 * number in the store). It returns no user data.
 *
 * Cached 60 s per instance, except in the Functions emulator, where a Maestro
 * flow flips the value between launches.
 */
export const getAppConfig = onCall(async (): Promise<AppConfigResponse> => {
  const now = Date.now();
  const useCache = process.env.FUNCTIONS_EMULATOR !== 'true';
  if (useCache && cache && cache.expiresAt > now) return cache.data;
  const { data, cacheable } = await readAppConfig();
  if (useCache && cacheable) cache = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
});
