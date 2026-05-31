import { normalizeString } from "./shared-utils";

// Copy the functions from the main script for testing
function stripWeakTails(name: string): string {
  if (!name) return "";

  let stripped = name
    .replace(
      /\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
      ""
    )
    .replace(/\s+(am|pm|noon|morning|evening|night)\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2})\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2}\s*(am|pm))\s*$/i, "")
    .replace(/\s+-\s*.*$/, "")
    .replace(/\s+–\s*.*$/, "")
    .replace(/\s+—\s*.*$/, "")
    .replace(/\s+:\s*.*$/, "")
    .trim();

  return stripped;
}

function extractGroupName(meetingName: string | undefined): string | null {
  if (!meetingName) return null;

  const stripped = stripWeakTails(meetingName);
  if (!stripped) return null;

  const normalizedName = normalizeString(stripped);

  const quotedMatch = normalizedName.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];

  const groupMatch = normalizedName.match(
    /(.+?)\s+(group|grp|fellowship|meeting|mtg|grapevine)\b/i
  );
  if (groupMatch) return groupMatch[1];

  const dayMatch = normalizedName.match(
    /(.+?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|noon|morning|evening|night)\b/i
  );
  if (dayMatch) return dayMatch[1];

  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const stopWords = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "am",
      "pm",
      "noon",
      "morning",
      "evening",
      "night",
      "group",
      "grp",
      "fellowship",
      "meeting",
      "mtg",
    ];

    let endIndex = parts.length;
    for (let i = 0; i < parts.length; i++) {
      if (stopWords.includes(parts[i].toLowerCase())) {
        endIndex = i;
        break;
      }
    }

    const meaningfulParts = parts.slice(0, Math.min(endIndex, 6));
    if (meaningfulParts.length >= 2) {
      return meaningfulParts.join(" ");
    }
  }

  if (stripped.length >= 3 && stripped.length <= 50) {
    return stripped;
  }

  return null;
}

// Test cases
const testCases = [
  "Solutions in Sobriety - Monday 7:00 PM",
  "Solutions in Sobriety Group - Monday 7:00 PM",
  "Solutions in Sobriety Meeting - Monday 7:00 PM",
  "Solutions in Sobriety Fellowship - Monday 7:00 PM",
  "Solutions in Sobriety - Monday",
  "Solutions in Sobriety - 7:00 PM",
  "Solutions in Sobriety Group",
  "Solutions in Sobriety Meeting",
  "Solutions in Sobriety Fellowship",
  "Solutions in Sobriety",
  "Solutions in Sobriety - Morning Meeting",
  "Solutions in Sobriety – Evening Meeting",
  "Solutions in Sobriety — Night Meeting",
  "Solutions in Sobriety : Monday 7:00 PM",
  "Solutions in Sobriety Group - Monday 7:00 PM - Main Hall",
  "Solutions in Sobriety - Monday 7:00 PM - Main Hall",
  "Solutions in Sobriety - Monday 7:00 PM - Main Hall - Open Meeting",
  "Solutions in Sobriety - Monday 7:00 PM - Main Hall - Open Meeting - Speaker Meeting",
  "Solutions in Sobriety - Monday 7:00 PM - Main Hall - Open Meeting - Speaker Meeting - Literature Study",
];

console.log("Testing group name extraction:");
console.log("=============================");

testCases.forEach((testCase, index) => {
  const result = extractGroupName(testCase);
  console.log(`${index + 1}. "${testCase}"`);
  console.log(`   → "${result}"`);
  console.log();
});
