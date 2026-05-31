/**
 * Seed Groups from Meetings (Resumable, Transactional, and Robust)
 *
 * Updated to match your Firestore models:
 * - GroupDocument (includes description, location, meetings[], admin fields, Stripe, etc.)
 * - MeetingDocument (uses isOnline, location, verified, etc.)
 *
 * Goals:
 *  - Iterate every meeting (~125k) and assign it to a Group.
 *  - Create Group documents deterministically and idempotently.
 *  - Update each Meeting with groupId without producing orphaned groups.
 *  - Populate Group.meetings with a compact, deterministic summary of each meeting (arrayUnion-safe).
 *  - Avoid over-aggressive name shortening (e.g., "Solutions in Sobriety" remains intact).
 *  - Strip terms like "online" and "in person" (incl. variations) from both display names and normalized keys.
 *  - Be resumable and repair orphaned references.
 *  - Robust logging.
 *
 * Usage:
 *  - Set GOOGLE_APPLICATION_CREDENTIALS or otherwise initialize admin SDK.
 *  - ts-node seedGroupsResumable.ts [--dry-run] [--repair] [--page-size=1000] [--concurrency=50] [--start-after=<docId>]
 */

import * as admin from "firebase-admin";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ------------------------- Config -------------------------
const DEFAULT_PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "1000", 10);
const DEFAULT_CONCURRENCY = parseInt(process.env.CONCURRENCY || "50", 10);
const ROUND_COORD_DIGITS = parseInt(process.env.ROUND_COORD_DIGITS || "3", 10); // ~100m

const DRY_RUN = process.argv.includes("--dry-run");
const REPAIR_MODE = process.argv.includes("--repair");

const pageSizeArg = process.argv.find((a) => a.startsWith("--page-size="));
const PAGE_SIZE = pageSizeArg
  ? parseInt(pageSizeArg.split("=")[1], 10)
  : DEFAULT_PAGE_SIZE;

const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg
  ? parseInt(concurrencyArg.split("=")[1], 10)
  : DEFAULT_CONCURRENCY;

const startAfterArg = process.argv.find((a) => a.startsWith("--start-after="));
const START_AFTER_ID = startAfterArg ? startAfterArg.split("=")[1] : undefined;

// Collections
const MEETINGS_COL = "meetings";
const GROUPS_COL = "groups";

// Logging
const LOG_DIR = path.join(process.cwd(), "logs");
const ERR_LOG = path.join(LOG_DIR, "errors.log");
const MEETING_LOG = path.join(LOG_DIR, "meetings_updated.log");
const GROUPS_CREATED_LOG = path.join(LOG_DIR, "groups_created.log");
const GROUPS_UPDATED_LOG = path.join(LOG_DIR, "groups_updated.log");
const CHECKPOINT_FILE = path.join(LOG_DIR, "resume_checkpoint.json");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logLine(file: string, msg: string) {
  fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`);
}

function logError(context: string, e: any, extra?: Record<string, any>) {
  const payload = { context, error: e?.stack || String(e), ...(extra || {}) };
  logLine(ERR_LOG, JSON.stringify(payload));
}

function logMeeting(msg: string, data: any) {
  logLine(MEETING_LOG, `${msg} :: ${JSON.stringify(data)}`);
}

function logGroupCreate(data: any) {
  logLine(GROUPS_CREATED_LOG, JSON.stringify(data));
}

function logGroupUpdate(data: any) {
  logLine(GROUPS_UPDATED_LOG, JSON.stringify(data));
}

// ------------------------- Firestore Init -------------------------
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./recovery-connect.json")),
  });
}
const db: Firestore = admin.firestore();

// ------------------------- Types -------------------------
export interface GroupDocument {
  id?: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  meetings: any[]; // storing compact meeting summaries to keep doc size in check
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  createdAt: FirebaseFirestore.FieldValue; // serverTimestamp at write
  updatedAt: FirebaseFirestore.FieldValue; // serverTimestamp at write
  foundedDate?: FirebaseFirestore.Timestamp;
  memberCount: number;
  admins: string[];
  adminUids: string[];
  isClaimed: boolean;
  pendingAdminRequests: {
    uid: string;
    requestedAt: FirebaseFirestore.Timestamp;
    message?: string;
  }[];
  treasurers: string[];
  placeName?: string;
  type: string; // e.g., 'AA'
  treasury?: any;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?:
    | "active"
    | "trialing"
    | "past_due"
    | "cancelled"
    | "unpaid"
    | "incomplete"
    | null;
  subscriptionExpiresAt?: FirebaseFirestore.Timestamp | null;
  stripeConnectAccountId?: string | null;
  distanceInKm?: number;
  normalizedName?: string; // internal helper
  geohash?: string;
  country?: string;
  timezone?: string;
  source?: string;
}

export interface MeetingDocument {
  meetingId?: string; // using doc id as meetingId
  name: string;
  type: string; // 'AA', 'NA', etc.
  day: string;
  country?: string;
  time: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  location?: string;
  isOnline: boolean;
  onlineLink?: string;
  onlineNotes?: string;
  verified: boolean;
  addedBy?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  groupId: string;
  format?: string;
  locationName?: string;
  geohash?: string;
  temporaryNotice?: string | null;
  isCancelledTemporarily?: boolean;
}

// ------------------------- Utilities -------------------------
const AA_QUALIFIER_TOKENS = new Set([
  "open",
  "closed",
  "discussion",
  "big book",
  "big-book",
  "book study",
  "book-study",
  "speaker",
  "step",
  "12&12",
  "12 & 12",
  "as bill sees it",
  "beginner",
  "newcomer",
  "women",
  "men",
  "lgbtq",
  "young people",
  "candlelight",
  "hybrid",
  "zoom",
  "online",
  "in-person",
  "in person",
  "meeting",
  "mtg",
  "mtg.",
  "aa",
  "alcoholics anonymous",
  "spanish",
  "bilingual",
]);

// Explicit removal list for terms like "online", "in person", etc when forming group name or keys.
const REMOVE_TERMS: RegExp[] = [/\b(in[- ]?person)\b/gi, /\bonline\b/gi];

function toAscii(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function collapseWhitespace(s: string): string {
  return s.replace(/[\s\u00A0]+/g, " ").trim();
}

function stripKnownParentheticals(name: string): string {
  // Remove parenthetical segments ONLY if they look like type descriptors.
  // e.g., "Solutions in Sobriety (Open, Discussion)" => "Solutions in Sobriety"
  return name
    .replace(/\([^)]*\)/g, (segment) => {
      const inner = segment.slice(1, -1).toLowerCase();
      const tokens = inner
        .split(/[\s,/|]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const allAreQualifiers =
        tokens.length > 0 && tokens.every((t) => AA_QUALIFIER_TOKENS.has(t));
      return allAreQualifiers ? "" : segment; // only strip if all tokens are qualifiers
    })
    .replace(/[\s]+/g, " ")
    .trim();
}

function removeTrailingDelimiterWithQualifiers(name: string): string {
  // Remove trailing segments after a delimiter if they look like pure qualifiers/time
  const parts = name.split(/[\-|–|—|:|•|\|]+/);
  if (parts.length <= 1) return name;

  const [first, ...rest] = parts.map((p) => p.trim()).filter(Boolean);
  const joinBack = (arr: string[]) => arr.join(" - ");
  const looksLikeTime = (s: string) =>
    /\b(\d{1,2}:?\d{0,2}\s?(am|pm))\b/i.test(s);
  const qualifierRatio = (s: string) => {
    const tokens = s
      .toLowerCase()
      .split(/[\s,/|]+/)
      .filter(Boolean);
    if (tokens.length === 0) return 0;
    const qual = tokens.filter((t) => AA_QUALIFIER_TOKENS.has(t)).length;
    return qual / tokens.length;
  };

  const keep: string[] = [first];
  for (const seg of rest) {
    if (looksLikeTime(seg) || qualifierRatio(seg) >= 0.66) {
      // stop at first obviously non-name segment
      break;
    }
    keep.push(seg);
  }
  return joinBack(keep);
}

function extractCandidateGroupName(meeting: any): string {
  // Priority 1: explicit groupName if not a generic placeholder
  const explicit = meeting.groupName && collapseWhitespace(meeting.groupName);
  if (explicit && !/^aa\s*meeting$/i.test(explicit) && explicit.length >= 3) {
    return explicit;
  }

  let base = meeting.name || "";
  base = base.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'); // normalize quotes
  base = collapseWhitespace(base);

  // 1) Strip parentheticals if they are pure qualifiers
  base = stripKnownParentheticals(base);

  // 2) Remove trailing qualifier/time segments after delimiters
  base = removeTrailingDelimiterWithQualifiers(base);

  // 3) If name contains '@' or ' at ' followed by a known locationName, strip the location part
  if (meeting.locationName) {
    const locName = collapseWhitespace(meeting.locationName);
    const patterns = [
      new RegExp(`\\s@\\s${escapeRegex(locName)}$`, "i"),
      new RegExp(`\\sat\\s${escapeRegex(locName)}$`, "i"),
    ];
    for (const rx of patterns) base = base.replace(rx, "").trim();
  }

  // 4) Remove unwanted terms like "online", "in person"
  for (const rx of REMOVE_TERMS) {
    base = base.replace(rx, " ").trim();
  }

  return collapseWhitespace(base);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGroupNameForKey(name: string): string {
  // Lowercase, remove punctuation, collapse spaces, and drop trailing 'group' if present
  let s = toAscii(name).toLowerCase();
  // Remove unwanted terms at normalization stage too
  for (const rx of REMOVE_TERMS) {
    s = s.replace(rx, " ");
  }
  s = s.replace(/\bgroup\b/g, " ").replace(/[^a-z0-9\s]/g, " ");
  s = collapseWhitespace(s);
  return s;
}

function roundCoord(n?: number): number | undefined {
  if (typeof n !== "number") return undefined;
  const f = Math.pow(10, ROUND_COORD_DIGITS);
  return Math.round(n * f) / f;
}

function buildLocationString(m: any): string {
  return (
    m.locationName ||
    m.location ||
    m.formattedAddress ||
    [m.street, m.city, m.state, m.zip].filter(Boolean).join(", ") ||
    ""
  );
}

function locationKey(meeting: any): string {
  // Priority: formattedAddress -> street/city/state/zip -> lat/lng -> city/state -> online/timezone -> 'unknown'
  const addr =
    meeting.formattedAddress ||
    [meeting.street, meeting.city, meeting.state, meeting.zip]
      .filter(Boolean)
      .join(", ");
  if (addr) return normalizeGroupNameForKey(addr);

  if (typeof meeting.lat === "number" && typeof meeting.lng === "number") {
    const lat = roundCoord(meeting.lat);
    const lng = roundCoord(meeting.lng);
    return `geo:${lat},${lng}`;
  }

  if (meeting.city || meeting.state) {
    return normalizeGroupNameForKey(
      [meeting.city, meeting.state].filter(Boolean).join(", ")
    );
  }

  if (meeting.online || meeting.isOnline) {
    return `online:${(meeting.timezone || "").toLowerCase()}`;
  }

  return "unknown";
}

function computeGroupKey(nameForKey: string, locKey: string): string {
  const raw = `${nameForKey}||${locKey}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function chooseDisplayName(
  existing: string | undefined,
  incoming: string
): { name: string; changed: boolean } {
  // Prefer the longer, more descriptive variant if they're similar enough.
  if (!existing) return { name: incoming, changed: true };
  const e = collapseWhitespace(existing);
  const i = collapseWhitespace(incoming);
  if (e.toLowerCase() === i.toLowerCase())
    return { name: existing, changed: false };
  // If one contains the other (case-insensitive), choose the longer.
  if (
    e.toLowerCase().includes(i.toLowerCase()) ||
    i.toLowerCase().includes(e.toLowerCase())
  ) {
    const preferred = e.length >= i.length ? existing : incoming;
    return { name: preferred, changed: preferred !== existing };
  }
  // Otherwise keep existing to avoid flip-flopping.
  return { name: existing, changed: false };
}

function compactMeetingSummary(meeting: any, groupId: string) {
  // Keep this compact to avoid hitting the 1MB document limit on large groups
  return {
    meetingId: meeting.id,
    name: meeting.name,
    day: meeting.day || "",
    time: meeting.time,
    isOnline: Boolean(meeting.isOnline ?? meeting.online),
    locationName: meeting.locationName || meeting.location || null,
    city: meeting.city || null,
    state: meeting.state || null,
    zip: meeting.zip || null,
    lat: typeof meeting.lat === "number" ? meeting.lat : null,
    lng: typeof meeting.lng === "number" ? meeting.lng : null,
    type: meeting.type || meeting.format || "AA",
    groupId,
  };
}

// ------------------------- Processing Core -------------------------
async function processMeeting(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): Promise<void> {
  const meeting = { id: docSnap.id, ...docSnap.data() } as any;

  try {
    const candidateName = extractCandidateGroupName(meeting);
    const normName = normalizeGroupNameForKey(candidateName);
    const locKey = locationKey(meeting);

    // If we fail to get a reasonable norm name, fallback to meeting id to avoid cross-pollution.
    const safeNormName = normName || `unknown-${meeting.id}`;
    const groupKey = computeGroupKey(safeNormName, locKey);

    const groupRef = db.collection(GROUPS_COL).doc(groupKey);
    const meetingRef = docSnap.ref;

    if (DRY_RUN) {
      logMeeting("DRY_RUN assigned", {
        meetingId: meeting.id,
        name: meeting.name,
        candidateName,
        normName: safeNormName,
        locKey,
        groupKey,
      });
      return;
    }

    await db.runTransaction(async (tx) => {
      const groupDoc = await tx.get(groupRef);
      const now = FieldValue.serverTimestamp();

      const incomingName =
        candidateName || meeting.groupName || meeting.name || "Unnamed Group";
      // Build GroupDocument base
      const baseGroup: Partial<GroupDocument> = {
        name: incomingName,
        description: "",
        location: buildLocationString(meeting),
        address: meeting.formattedAddress || meeting.address || undefined,
        city: meeting.city,
        state: meeting.state,
        zip: meeting.zip,
        lat: typeof meeting.lat === "number" ? meeting.lat : undefined,
        lng: typeof meeting.lng === "number" ? meeting.lng : undefined,
        geohash: meeting.geohash,
        country: meeting.country,
        timezone: meeting.timezone,
        meetings: [], // we will arrayUnion a compact summary below
        memberCount: 0,
        admins: [],
        adminUids: [],
        isClaimed: false,
        pendingAdminRequests: [],
        treasurers: [],
        placeName: meeting.locationName || undefined,
        type: meeting.type || meeting.format || "AA",
        treasury: undefined,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        subscriptionExpiresAt: null,
        stripeConnectAccountId: null,
        distanceInKm: undefined,
        normalizedName: safeNormName,
        source: "seedGroupsResumable",
        createdAt: now,
        updatedAt: now,
      } as unknown as GroupDocument;

      const meetingSummary = compactMeetingSummary(meeting, groupKey);

      if (!groupDoc.exists) {
        // Create group
        tx.set(groupRef, baseGroup);
        // Add first meeting summary
        tx.update(groupRef, {
          meetings: admin.firestore.FieldValue.arrayUnion(meetingSummary),
        });
        logGroupCreate({
          groupId: groupKey,
          name: baseGroup.name,
          locKey,
          meetingId: meeting.id,
        });
      } else {
        // Update group updatedAt and optionally better name
        const existing = groupDoc.data() as GroupDocument;
        const decision = chooseDisplayName(existing.name, incomingName);
        const updates: any = { updatedAt: now };
        if (decision.changed) {
          updates.name = decision.name;
        }
        // Ensure place/location fields are not lost if we get better data later (optional conservative merge)
        if (!existing.address && baseGroup.address)
          updates.address = baseGroup.address;
        if (!existing.city && baseGroup.city) updates.city = baseGroup.city;
        if (!existing.state && baseGroup.state) updates.state = baseGroup.state;
        if (!existing.zip && baseGroup.zip) updates.zip = baseGroup.zip;
        if (!existing.location && baseGroup.location)
          updates.location = baseGroup.location;
        if (!existing.placeName && baseGroup.placeName)
          updates.placeName = baseGroup.placeName;

        tx.update(groupRef, updates);
        // Add meeting summary (arrayUnion prevents duplicates if exactly equal)
        tx.update(groupRef, {
          meetings: admin.firestore.FieldValue.arrayUnion(meetingSummary),
        });
        logGroupUpdate({
          groupId: groupKey,
          updated: Object.keys(updates),
          meetingAdded: meeting.id,
        });
      }

      // Update meeting with groupId if missing or different, or in REPAIR_MODE
      const needsUpdate = REPAIR_MODE || meeting.groupId !== groupKey;
      if (needsUpdate) {
        tx.update(meetingRef, { groupId: groupKey });
        logMeeting("meeting->group linked", {
          meetingId: meeting.id,
          groupId: groupKey,
          candidateName,
          locKey,
        });
      }
    });
  } catch (e) {
    logError("processMeeting", e, {
      meetingId: docSnap.id,
      name: (docSnap.data() as any)?.name,
    });
  }
}

async function fixOrphanIfAny(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): Promise<void> {
  // If meeting has a groupId but the group doc is missing, recompute and relink via transaction.
  const meeting = { id: docSnap.id, ...docSnap.data() } as any;
  if (!meeting.groupId) return; // nothing to fix

  const groupRef = db.collection(GROUPS_COL).doc(meeting.groupId);
  const groupDoc = await groupRef.get();
  if (groupDoc.exists) return; // all good

  // Recompute using current logic
  await processMeeting(docSnap);
}

async function* paginateMeetings(): AsyncGenerator<
  FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
> {
  let query = db
    .collection(MEETINGS_COL)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(PAGE_SIZE);

  // Resume strategy: if --start-after provided, or if checkpoint exists.
  const resumeFrom = START_AFTER_ID || loadCheckpoint();
  if (resumeFrom) {
    const resumeSnap = await db.collection(MEETINGS_COL).doc(resumeFrom).get();
    if (resumeSnap.exists) {
      query = query.startAfter(resumeSnap.id);
      console.log(`[Resume] Starting after ${resumeSnap.id}`);
    } else {
      console.warn(
        `[Resume] start-after id not found: ${resumeFrom}; starting from beginning.`
      );
    }
  }

  // Paginate
  while (true) {
    const snap = await query.get();
    if (snap.empty) break;
    const docs = snap.docs;
    yield docs;
    const last = docs[docs.length - 1];
    saveCheckpoint(last.id);
    query = db
      .collection(MEETINGS_COL)
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAfter(last.id)
      .limit(PAGE_SIZE);
  }
}

function saveCheckpoint(docId: string) {
  const payload = { lastId: docId, ts: new Date().toISOString() };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(payload, null, 2));
}

function loadCheckpoint(): string | undefined {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return undefined;
    const txt = fs.readFileSync(CHECKPOINT_FILE, "utf8");
    const json = JSON.parse(txt);
    return json.lastId as string | undefined;
  } catch {
    return undefined;
  }
}

async function processWithPool(
  docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
) {
  const pool: Promise<void>[] = [];
  let inFlight = 0;

  async function enqueue(p: Promise<void>) {
    inFlight++;
    pool.push(
      p.finally(() => {
        inFlight--;
      })
    );
    if (inFlight >= CONCURRENCY) {
      await Promise.race(pool);
    }
  }

  for (const d of docs) {
    const task = (async () => {
      // In REPAIR_MODE, always ensure group exists even if meeting already has a groupId
      if (REPAIR_MODE && (d.data() as any)?.groupId) {
        await fixOrphanIfAny(d);
      } else {
        await processMeeting(d);
      }
    })();
    await enqueue(task);
  }

  // Wait for all to settle
  await Promise.allSettled(pool);
}

// ------------------------- Main -------------------------
async function main() {
  console.log("--- seedGroupsResumable starting ---");
  console.log(
    JSON.stringify(
      {
        PAGE_SIZE,
        CONCURRENCY,
        DRY_RUN,
        REPAIR_MODE,
        ROUND_COORD_DIGITS,
        START_AFTER_ID,
      },
      null,
      2
    )
  );

  let processed = 0;
  const startedAt = Date.now();

  // Graceful shutdown: save checkpoint on SIGINT/SIGTERM
  const onExit = () => {
    console.log(
      "\n[Exit] Received signal, checkpoint saved if a page completed."
    );
    process.exit(0);
  };
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);

  for await (const page of paginateMeetings()) {
    await processWithPool(page);
    processed += page.length;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[Progress] processed=${processed} elapsed=${elapsed}s lastId=${
        page[page.length - 1].id
      }`
    );
  }

  console.log("--- seedGroupsResumable complete ---");
}

main().catch((e) => {
  logError("main", e);
  console.error(e);
  process.exit(1);
});
