/**
 * Cross-app registry — the single source of truth for the three namespaces a
 * referral flows through:
 *
 *   display name (wire value)  →  Firebase project id (internal)  →  app-id (stored)
 *
 * Frontends speak DISPLAY NAMES. recovery-api resolves them to the canonical
 * APP-ID at the boundary and stores the app-id form everywhere
 * (`toApp` / `fromApp` / `referredByApp` / `{appId}:{uid}` doc keys).
 * Project ids are an internal detail of that translation — recovery-api runs
 * only in the `recovery-platform` project and never introspects the others.
 */

export interface AppRegistryEntry {
  /** Canonical app-id — the stored form. Never a display name or project id. */
  appId: string;
  /** Human-facing name frontends send as the wire value (`toApp`). */
  displayName: string;
  /** Firebase project id backing this app (internal; may be shared). */
  projectId: string;
  /** Legacy/alternate wire values that also resolve to this app-id. */
  aliases?: readonly string[];
  /** May this app authenticate to recovery-api and originate referrals (valid X-App-Id / fromApp)? */
  canOriginate: boolean;
  /** May this app be a referral target (valid toApp)? */
  canReceive: boolean;
}

export const APP_REGISTRY = [
  {
    appId: 'homegroups',
    displayName: 'Homegroups',
    projectId: 'recovery-connect-cad4b',
    canOriginate: true,
    canReceive: true,
  },
  {
    appId: 'phoenix-cleanhouse',
    displayName: 'Regroup',
    projectId: 'phoenix-cleanhouse',
    // 'sober-living' was an earlier identity for this product (regroup/RATS).
    aliases: ['sober-living'],
    canOriginate: true,
    canReceive: true,
  },
  {
    appId: 'nextstep-recovery',
    displayName: 'Next Step Recovery',
    // Bare 'nextstep-recovery' is taken; the live project id is suffixed.
    projectId: 'nextsteprecovery-1d5c2',
    canOriginate: true,
    canReceive: true,
  },
  {
    appId: 'treatment-center',
    displayName: 'treatment-center',
    // Target-only today: homegroups' intergroup treatment-center onboarding.
    // Provisionally backed by the homegroups project until a dedicated
    // treatment-center platform exists; it has no credentials of its own.
    projectId: 'recovery-connect-cad4b',
    canOriginate: false,
    canReceive: true,
  },
] as const satisfies readonly AppRegistryEntry[];

// Canonical app-id unions DERIVED from the registry — the registry is the SSOT,
// so adding/removing an app updates every consumer with no parallel hand-editing.
/** Canonical app-id of any registered app. */
export type AppId = (typeof APP_REGISTRY)[number]['appId'];
/** Canonical app-id of an app allowed to authenticate / originate referrals. */
export type OriginatorAppId = Extract<
  (typeof APP_REGISTRY)[number],
  { canOriginate: true }
>['appId'];
/** Canonical app-id of an app allowed to be a referral target. */
export type TargetAppId = Extract<(typeof APP_REGISTRY)[number], { canReceive: true }>['appId'];

// Lowercased lookup over app-ids, display names, and aliases — built once.
const byKey: ReadonlyMap<string, AppRegistryEntry> = (() => {
  const map = new Map<string, AppRegistryEntry>();
  for (const entry of APP_REGISTRY as readonly AppRegistryEntry[]) {
    map.set(entry.appId.toLowerCase(), entry);
    map.set(entry.displayName.toLowerCase(), entry);
    for (const alias of entry.aliases ?? []) {
      map.set(alias.toLowerCase(), entry);
    }
  }
  return map;
})();

/** Resolve a display name, alias, or app-id to its registry entry (case-insensitive). */
export function resolveApp(value: unknown): AppRegistryEntry | undefined {
  if (typeof value !== 'string') return undefined;
  return byKey.get(value.trim().toLowerCase());
}

/** Resolve any accepted wire value to the canonical app-id, or undefined if unknown. */
export function resolveAppId(value: string): string | undefined {
  return resolveApp(value)?.appId;
}

/** True if `appId` is a canonical app-id allowed to authenticate / originate referrals. */
export function isOriginatorAppId(appId: string): appId is OriginatorAppId {
  return APP_REGISTRY.some((e) => e.appId === appId && e.canOriginate);
}

/** True if `appId` is a canonical app-id allowed to be a referral target. */
export function isTargetAppId(appId: string): appId is TargetAppId {
  return APP_REGISTRY.some((e) => e.appId === appId && e.canReceive);
}

export const ORIGINATOR_APP_IDS: readonly string[] = APP_REGISTRY.filter((e) => e.canOriginate).map(
  (e) => e.appId,
);

export const TARGET_APP_IDS: readonly string[] = APP_REGISTRY.filter((e) => e.canReceive).map(
  (e) => e.appId,
);
