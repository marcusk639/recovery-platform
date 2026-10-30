import { Location } from "../entities/GeocodeResponse";
import { DirectoryMeeting } from "../entities/DirectoryMeeting";

/**
 * Client for recovery-api's shared meeting directory (`findMeetings` callable).
 *
 * recovery-api is the single owner of the cross-product meeting directory. Regroup
 * calls it SERVER-TO-SERVER with service-key auth — never a direct end-user call,
 * since a `phoenix-cleanhouse` Firebase ID token cannot be verified by the
 * `recovery-platform` project. Regroup authenticates the end user against its own
 * Firebase Auth first, then forwards the (uid, email) for recovery-api's
 * privacy-safe attribution audit.
 *
 * The endpoint is a Firebase v2 callable, so we POST the callable wire protocol
 * (`{ data }` request body, `{ result }` response body) with the service-auth
 * headers recovery-api's `requireServiceAuth` reads off the raw request.
 */

/** Canonical app-id for regroup in recovery-api's app registry. */
const REGROUP_APP_ID = "phoenix-cleanhouse";

export interface DirectorySearchInput {
  location: Location;
  /** Canonical day-of-week 0–6 (0 = Sunday). Omit to search all days. */
  day?: number;
  /** Free-form type filter applied by recovery-api. */
  type?: string;
  radiusMeters?: number;
}

export interface DirectoryCaller {
  uid: string;
  email?: string;
}

export interface DirectoryClientDeps {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Fetch directory meetings from recovery-api. Rejects on missing config, a
 * non-OK response or a network failure: an outage must not look like a search
 * with no results. The `findMeetings` callable logs it and returns `internal`.
 */
export async function fetchDirectoryMeetings(
  input: DirectorySearchInput,
  caller: DirectoryCaller,
  deps: DirectoryClientDeps = {},
): Promise<DirectoryMeeting[]> {
  const fetchFn = deps.fetchFn ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.RECOVERY_API_BASE_URL;
  const apiKey = deps.apiKey ?? process.env.RECOVERY_PLATFORM_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "recovery-api directory not configured (missing RECOVERY_API_BASE_URL or RECOVERY_PLATFORM_API_KEY)",
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/findMeetings`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": apiKey,
      "X-App-Id": REGROUP_APP_ID,
      "X-User-Uid": caller.uid,
      "X-User-Email": caller.email ?? "",
    },
    body: JSON.stringify({ data: input }),
  });

  if (!response.ok) {
    throw new Error(`recovery-api findMeetings returned ${response.status}`);
  }

  const json = (await response.json()) as {
    result?: { meetings?: DirectoryMeeting[] };
  };
  return json.result?.meetings ?? [];
}
