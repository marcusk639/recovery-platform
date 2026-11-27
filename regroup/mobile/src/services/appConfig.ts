import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../firebase-setup';
import { logException } from '../util/logging';

/** How long the version gate waits for getAppConfig before letting the user in. */
export const APP_CONFIG_TIMEOUT_MS = 3000;

type Platform = 'ios' | 'android';

/**
 * The minimum app version for this platform, from the public getAppConfig
 * callable (server-only config/app). Never throws: a failure, a timeout or a
 * response without a value for this platform is null, which lets the user in.
 */
export async function getMinimumVersion(platform: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), APP_CONFIG_TIMEOUT_MS);
  });
  const call = httpsCallable(
    functions,
    'getAppConfig',
  )({}).then((result) => {
    const min = (result?.data as { minVersion?: unknown } | null)?.minVersion;
    if (!min || typeof min !== 'object') return null;
    const value = (min as Partial<Record<Platform, unknown>>)[platform as Platform];
    return typeof value === 'string' ? value : null;
  });
  try {
    return await Promise.race([call, timeout]);
  } catch (error) {
    logException(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
