import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import { requireAuth } from "../utils/callableWrapper";

interface ExportFacilityComplianceReportData {
  intergroupId: string;
  reportPeriod: {
    startDate: string; // ISO date YYYY-MM-DD
    endDate: string;
  };
  format: "csv";
  includeAttendance: boolean;
  includeMilestones: boolean;
  includeMeetingSchedule: boolean;
}

interface ExportFacilityComplianceReportResult {
  downloadUrl: string;
  expiresAt: string;
  reportId: string;
}

export const exportFacilityComplianceReport = onCall(
  { region: "us-central1" },
  async (
    request: CallableRequest<ExportFacilityComplianceReportData>,
  ): Promise<ExportFacilityComplianceReportResult> => {
    const uid = requireAuth(request);

    const {
      intergroupId,
      reportPeriod,
      format,
      includeAttendance,
      includeMilestones,
      includeMeetingSchedule,
    } = request.data;
    if (!intergroupId || !reportPeriod?.startDate || !reportPeriod?.endDate) {
      throw new HttpsError(
        "invalid-argument",
        "intergroupId and reportPeriod are required",
      );
    }

    if ((format as string) === "pdf") {
      throw new HttpsError(
        "invalid-argument",
        "PDF format is not supported. Use 'txt' or 'csv'.",
      );
    }

    // Load intergroup
    const intergroupSnap = await db
      .collection("intergroups")
      .doc(intergroupId)
      .get();
    if (!intergroupSnap.exists)
      throw new HttpsError("not-found", "Intergroup not found");
    const intergroupData = intergroupSnap.data()!;

    // Must be admin of treatment center
    if (!intergroupData.adminUids?.includes(uid)) {
      throw new HttpsError("permission-denied", "Must be an intergroup admin");
    }
    if (intergroupData.type !== "treatment_center") {
      throw new HttpsError(
        "failed-precondition",
        "Compliance reports only available for treatment centers",
      );
    }

    if (intergroupData.subscriptionStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Active subscription required to export compliance reports.",
      );
    }

    // Load facility stats
    const statsSnap = await db
      .collection("intergroups")
      .doc(intergroupId)
      .collection("facilityStats")
      .doc("current")
      .get();
    const stats = statsSnap.data() ?? {};

    // Generate report content
    const reportId = db.collection("_").doc().id; // Generate ID
    const affiliatedGroupIds: string[] =
      intergroupData.affiliatedGroupIds || [];

    // Build a simple CSV or text report (PDF would require a PDF library)
    const reportContent = generateReportContent({
      intergroupName: intergroupData.name,
      reportPeriod,
      stats,
      affiliatedGroupIds,
      includeAttendance,
      includeMilestones,
      includeMeetingSchedule,
      format,
      reportId,
    });

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `compliance-reports/${intergroupId}/${reportId}.csv`;
    const file = bucket.file(fileName);

    await file.save(reportContent, {
      contentType: "text/csv",
      metadata: {
        metadata: {
          intergroupId,
          reportId,
          generatedBy: uid,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Generate signed URL valid for 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: expiresAt,
    });

    // Write audit log
    const reportRef = db
      .collection("intergroups")
      .doc(intergroupId)
      .collection("complianceReports")
      .doc(reportId);

    await reportRef.set({
      reportId,
      intergroupId,
      reportPeriod,
      format,
      filePath: fileName,
      generatedBy: uid,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });

    return {
      downloadUrl: signedUrl,
      expiresAt: expiresAt.toISOString(),
      reportId,
    };
  },
);

function generateReportContent(params: {
  intergroupName: string;
  reportPeriod: { startDate: string; endDate: string };
  stats: any;
  affiliatedGroupIds: string[];
  includeAttendance: boolean;
  includeMilestones: boolean;
  includeMeetingSchedule: boolean;
  format: string;
  reportId: string;
}): string {
  const { intergroupName, reportPeriod, stats, reportId } = params;
  const generatedAt = new Date().toISOString();

  if (params.format === "csv") {
    const lines = [
      `Facility Name,${intergroupName}`,
      `Report Period,${reportPeriod.startDate} to ${reportPeriod.endDate}`,
      `Generated,${generatedAt}`,
      `Report ID,${reportId}`,
      ``,
      `CONFIDENTIALITY NOTICE: This report contains anonymized aggregate statistics only.`,
      ``,
      `SECTION 1 - Active Members`,
      `Total Active Members,${stats.totalActiveMemberCount ?? 0}`,
      ``,
      `SECTION 2 - Recovery Milestones`,
      `Total Milestones Awarded,${stats.totalMilestonesAwarded ?? 0}`,
      `Milestones This Month,${stats.milestonesThisMonth ?? 0}`,
      `Milestones This Year,${stats.milestonesThisYear ?? 0}`,
      ``,
      `SECTION 3 - Sobriety Distribution`,
      `Under 30 Days,${stats.sobrietyBuckets?.under30Days ?? 0}`,
      `30-90 Days,${stats.sobrietyBuckets?.thirtyToNinetyDays ?? 0}`,
      `90 Days to 1 Year,${stats.sobrietyBuckets?.ninetyDaysToOneYear ?? 0}`,
      `1 to 2 Years,${stats.sobrietyBuckets?.oneToTwoYears ?? 0}`,
      `2 to 5 Years,${stats.sobrietyBuckets?.twoToFiveYears ?? 0}`,
      `5+ Years,${stats.sobrietyBuckets?.fiveYearsPlus ?? 0}`,
      ``,
      `SECTION 4 - Meeting Attendance`,
      `Total Meetings This Month,${stats.totalMeetingsThisMonth ?? 0}`,
      `Total Attendance This Month,${stats.totalAttendanceThisMonth ?? 0}`,
      `Average Attendance Per Meeting,${stats.averageAttendancePerMeeting ?? 0}`,
      ``,
      `Footer: Report ID ${reportId} | Generated by Homegroups | Not a clinical assessment`,
    ];
    return lines.join("\n");
  }

  // Text-based "PDF" content
  return `
${intergroupName}  |  ${reportPeriod.startDate} to ${reportPeriod.endDate}  |  Generated: ${generatedAt}

CONFIDENTIALITY NOTICE: This report contains anonymized aggregate statistics only.
No individual identifying information is included.

SECTION 1 — Active Members
  Total active members: ${stats.totalActiveMemberCount ?? 0}
  Affiliated groups: ${params.affiliatedGroupIds.length}

SECTION 2 — Recovery Milestones
  Total milestones awarded in period: ${stats.totalMilestonesAwarded ?? 0}
  Milestones this month: ${stats.milestonesThisMonth ?? 0}
  Milestones this year: ${stats.milestonesThisYear ?? 0}

SECTION 3 — Sobriety Distribution (as of report date)
  Under 30 days: ${stats.sobrietyBuckets?.under30Days ?? 0}
  30-90 days: ${stats.sobrietyBuckets?.thirtyToNinetyDays ?? 0}
  90 days to 1 year: ${stats.sobrietyBuckets?.ninetyDaysToOneYear ?? 0}
  1 to 2 years: ${stats.sobrietyBuckets?.oneToTwoYears ?? 0}
  2 to 5 years: ${stats.sobrietyBuckets?.twoToFiveYears ?? 0}
  5+ years: ${stats.sobrietyBuckets?.fiveYearsPlus ?? 0}

SECTION 4 — Meeting Attendance
  Total meetings held: ${stats.totalMeetingsThisMonth ?? 0}
  Total attendance events: ${stats.totalAttendanceThisMonth ?? 0}
  Average attendance per meeting: ${stats.averageAttendancePerMeeting ?? 0}

Report ID: ${reportId} | Generated by Homegroups | Not a clinical assessment
  `.trim();
}
