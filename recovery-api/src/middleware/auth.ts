import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { resolveApp, isOriginatorAppId, ORIGINATOR_APP_IDS } from '../config/apps';

export interface ServiceAuthContext {
  /** Canonical app-id of the originating service (see config/apps.ts). */
  appId: 'homegroups' | 'phoenix-cleanhouse' | 'nextstep-recovery';
  uid: string;
  email: string;
}

// Incoming X-App-Id / appId claims are resolved through the registry, so
// display names and legacy aliases (e.g. 'sober-living' → 'phoenix-cleanhouse')
// are accepted and normalized to the canonical app-id before validation.
const ORIGINATOR_LIST = ORIGINATOR_APP_IDS.join(', ');

/** Resolve a raw X-App-Id / appId claim to a canonical originator app-id, or undefined. */
function resolveOriginator(raw: string): ServiceAuthContext['appId'] | undefined {
  const appId = resolveApp(raw)?.appId;
  if (appId && isOriginatorAppId(appId)) {
    return appId as ServiceAuthContext['appId'];
  }
  return undefined;
}

/**
 * Phase 1: Verify X-Service-Key + extract X-App-Id / X-User-Uid / X-User-Email.
 * Phase 2 fallback: use request.auth token claims (appId, email).
 */
export function requireServiceAuth(request: CallableRequest): ServiceAuthContext {
  const headers = request.rawRequest.headers;
  const serviceKey = headers['x-service-key'] as string | undefined;
  const apiKey = process.env.RECOVERY_PLATFORM_API_KEY;

  if (apiKey && serviceKey === apiKey) {
    const rawAppId = headers['x-app-id'] as string | undefined;
    const uid = headers['x-user-uid'] as string | undefined;
    const email = (headers['x-user-email'] as string | undefined) ?? '';

    const appId = rawAppId ? resolveOriginator(rawAppId) : undefined;
    if (!appId) {
      throw new HttpsError('unauthenticated', `X-App-Id must be one of: ${ORIGINATOR_LIST}`);
    }
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Missing X-User-Uid header');
    }
    return { appId, uid, email };
  }

  // Phase 2: Firebase custom token flow
  if (request.auth) {
    const rawAppId = request.auth.token['appId'] as string | undefined;
    const appId = rawAppId ? resolveOriginator(rawAppId) : undefined;
    if (!appId) {
      throw new HttpsError('unauthenticated', 'Missing or invalid appId claim');
    }
    return {
      appId,
      uid: request.auth.uid,
      email: (request.auth.token.email as string | undefined) ?? '',
    };
  }

  throw new HttpsError('unauthenticated', 'Unauthorized');
}
