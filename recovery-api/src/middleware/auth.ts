import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

export interface ServiceAuthContext {
  appId: 'homegroups' | 'sober-living' | 'phoenix-cleanhouse';
  uid: string;
  email: string;
}

// 'sober-living' is a legacy alias for the regroup/RATS product.
// 'phoenix-cleanhouse' is the canonical Firebase project ID for regroup/RATS
// and the toApp value used in cross-product referrals (see CLAUDE.md).
const VALID_APP_IDS: ReadonlySet<string> = new Set([
  'homegroups',
  'sober-living',
  'phoenix-cleanhouse',
]);

/**
 * Phase 1: Verify X-Service-Key + extract X-App-Id / X-User-Uid / X-User-Email.
 * Phase 2 fallback: use request.auth token claims (appId, email).
 */
export function requireServiceAuth(request: CallableRequest): ServiceAuthContext {
  const headers = request.rawRequest.headers;
  const serviceKey = headers['x-service-key'] as string | undefined;
  const apiKey = process.env.RECOVERY_PLATFORM_API_KEY;

  if (apiKey && serviceKey === apiKey) {
    const appId = headers['x-app-id'] as string | undefined;
    const uid = headers['x-user-uid'] as string | undefined;
    const email = (headers['x-user-email'] as string | undefined) ?? '';

    if (!appId || !VALID_APP_IDS.has(appId)) {
      throw new HttpsError(
        'unauthenticated',
        'X-App-Id must be homegroups, sober-living, or phoenix-cleanhouse',
      );
    }
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Missing X-User-Uid header');
    }
    return { appId: appId as ServiceAuthContext['appId'], uid, email };
  }

  // Phase 2: Firebase custom token flow
  if (request.auth) {
    const appId = request.auth.token['appId'] as string | undefined;
    if (!appId || !VALID_APP_IDS.has(appId)) {
      throw new HttpsError('unauthenticated', 'Missing or invalid appId claim');
    }
    return {
      appId: appId as ServiceAuthContext['appId'],
      uid: request.auth.uid,
      email: (request.auth.token.email as string | undefined) ?? '',
    };
  }

  throw new HttpsError('unauthenticated', 'Unauthorized');
}
