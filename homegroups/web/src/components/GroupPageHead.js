import React from "react";
import { Helmet } from "react-helmet-async";

// Note: update to the custom domain (homegroups-app.com) once DNS is configured.
const SITE_ORIGIN = "https://recovery-connect-cad4b.web.app";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Accepts either a numeric string ("0"-"6") or a day name ("sunday", "Monday", etc)
// and returns the canonical title-cased day name, or "" if unrecognized.
function dayLabel(raw) {
  if (!raw) return "";
  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 6)
    return DAY_NAMES[asNum];
  const lower = String(raw).toLowerCase();
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === lower);
  return idx >= 0 ? DAY_NAMES[idx] : "";
}

function buildTitle(group) {
  const locale = [group.city, group.state].filter(Boolean).join(", ");
  const suffix = locale ? ` in ${locale}` : "";
  return `${group.name} — ${group.type} Group${suffix} | Homegroups`;
}

function buildDescription(group) {
  const locale = [group.city, group.state].filter(Boolean).join(", ");
  const firstMeeting = group.meetings && group.meetings[0];
  const meetingStr = firstMeeting
    ? `${dayLabel(firstMeeting.day)} ${firstMeeting.time ?? ""}`.trim()
    : "";
  const parts = [
    `${group.type} ${firstMeeting?.format ?? "recovery"} meeting`,
    meetingStr ? `${meetingStr}` : null,
    locale ? `in ${locale}` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. View the schedule and connect via the Homegroups app.`;
}

function buildEventLdJson(group) {
  if (!group.meetings || group.meetings.length === 0) return null;
  return group.meetings.map((m, i) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${group.name} — ${dayLabel(m.day)}`,
    // startDate omitted — this is a recurring meeting, not a one-time event
    eventAttendanceMode: m.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: m.isOnline
      ? { "@type": "VirtualLocation", url: `${SITE_ORIGIN}/groups/${group.id}` }
      : {
          "@type": "Place",
          name: m.locationName || group.placeName || "In-person meeting",
          address: [group.city, group.state].filter(Boolean).join(", "),
        },
    organizer: {
      "@type": "Organization",
      name: group.name,
      url: `${SITE_ORIGIN}/groups/${group.id}`,
    },
    description: `${group.type} meeting, ${m.format || ""}`.trim(),
  }));
}

export default function GroupPageHead({ group }) {
  if (!group) return null;
  const url = `${SITE_ORIGIN}/groups/${group.id}`;
  const title = buildTitle(group);
  const description = buildDescription(group);
  const isClaimed = group.isClaimed === true;
  const events = buildEventLdJson(group);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={group.name} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={DEFAULT_OG_IMAGE} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={group.name} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />

      {/* Robots: noindex unclaimed groups during launch phase */}
      {!isClaimed && <meta name="robots" content="noindex, follow" />}

      {/* Schema.org structured data */}
      {events &&
        events.map((evt, i) => (
          <script key={i} type="application/ld+json">
            {JSON.stringify(evt)}
          </script>
        ))}
    </Helmet>
  );
}
