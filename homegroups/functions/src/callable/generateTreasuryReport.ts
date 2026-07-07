import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";
import PDFDocument from "pdfkit";

interface GenerateTreasuryReportData {
  groupId: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
}

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  createdBy: string;
  authorName?: string;
  createdAt: admin.firestore.Timestamp;
}

interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

/**
 * Cloud function to generate a PDF treasury report for a group.
 * Returns a signed URL to download the generated PDF.
 */
export const generateTreasuryReport = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 120 },
  async (request: CallableRequest<GenerateTreasuryReportData>) => {
    const data = request.data;

    // Validate input
    if (!data || !data.groupId || !data.startDate || !data.endDate) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required data (groupId, startDate, endDate).",
      );
    }

    const { groupId, startDate, endDate } = data;

    // Validate user is authenticated
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    logger.info(
      `Generating treasury report for group ${groupId} from ${startDate} to ${endDate}`,
    );

    try {
      // Get the group information
      const groupSnap = await db.collection("groups").doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found");
      }
      const groupData = groupSnap.data();
      const groupName = groupData?.name || "Unknown Group";

      // Authorization: only admins or treasurers may generate the treasury
      // report. Plain members can read transactions for transparency but
      // should not be able to download the full financial-PII PDF.
      const isAdmin = groupData?.admins?.includes(auth.uid) === true;
      const isTreasurer = groupData?.treasurers?.includes(auth.uid) === true;

      // Fallback to members collection for the role flags (members docs are
      // the canonical store; group-doc arrays are denormalized/legacy).
      let memberIsAdmin = false;
      let memberIsTreasurer = false;
      if (!isAdmin && !isTreasurer) {
        const memberSnap = await db
          .collection("members")
          .doc(`${groupId}_${auth.uid}`)
          .get();
        if (memberSnap.exists) {
          const m = memberSnap.data();
          memberIsAdmin = m?.isAdmin === true;
          memberIsTreasurer = m?.isTreasurer === true;
        }
      }

      if (!(isAdmin || isTreasurer || memberIsAdmin || memberIsTreasurer)) {
        throw new HttpsError(
          "permission-denied",
          "Only group admins or treasurers can generate treasury reports.",
        );
      }

      // Get transactions within date range.
      // Transactions are stored at the TOP-LEVEL `transactions` collection
      // with a `groupId` field — not as a subcollection under each group.
      // (TreasuryModel.getTransactions and firestore.rules confirm this is
      // the canonical location.) The composite index on (groupId, date asc)
      // is in firestore.indexes.json.
      const transactionsSnap = await db
        .collection("transactions")
        .where("groupId", "==", groupId)
        .where("date", ">=", startDate)
        .where("date", "<=", endDate)
        .orderBy("date", "asc")
        .get();

      const transactions: Transaction[] = transactionsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Transaction[];

      // Calculate summaries
      let totalIncome = 0;
      let totalExpenses = 0;
      const incomeByCategory: Record<string, CategorySummary> = {};
      const expensesByCategory: Record<string, CategorySummary> = {};

      transactions.forEach((t) => {
        if (t.type === "income") {
          totalIncome += t.amount;
          if (!incomeByCategory[t.category]) {
            incomeByCategory[t.category] = {
              category: t.category,
              total: 0,
              count: 0,
            };
          }
          incomeByCategory[t.category].total += t.amount;
          incomeByCategory[t.category].count += 1;
        } else {
          totalExpenses += t.amount;
          if (!expensesByCategory[t.category]) {
            expensesByCategory[t.category] = {
              category: t.category,
              total: 0,
              count: 0,
            };
          }
          expensesByCategory[t.category].total += t.amount;
          expensesByCategory[t.category].count += 1;
        }
      });

      // Get starting balance (sum of all transactions before start date).
      // Same top-level `transactions` collection as above.
      const priorTransactionsSnap = await db
        .collection("transactions")
        .where("groupId", "==", groupId)
        .where("date", "<", startDate)
        .get();

      let startingBalance = 0;
      priorTransactionsSnap.docs.forEach((doc) => {
        const t = doc.data() as Transaction;
        if (t.type === "income") {
          startingBalance += t.amount;
        } else {
          startingBalance -= t.amount;
        }
      });

      const endingBalance = startingBalance + totalIncome - totalExpenses;
      const prudentReserve = groupData?.treasury?.prudentReserve || 0;

      // Generate PDF
      const pdfBuffer = await generatePDF({
        groupName,
        startDate,
        endDate,
        startingBalance,
        totalIncome,
        totalExpenses,
        endingBalance,
        prudentReserve,
        incomeByCategory: Object.values(incomeByCategory),
        expensesByCategory: Object.values(expensesByCategory),
        transactions,
      });

      // Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const fileName = `treasury-reports/${groupId}/${Date.now()}_treasury_report.pdf`;
      const file = bucket.file(fileName);

      await file.save(pdfBuffer, {
        metadata: {
          contentType: "application/pdf",
          metadata: {
            groupId,
            startDate,
            endDate,
            generatedBy: auth.uid,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      // Generate signed URL (valid for 1 hour)
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      logger.info(
        `Treasury report generated successfully for group ${groupId}`,
      );

      return {
        success: true,
        downloadUrl: signedUrl,
        summary: {
          startingBalance,
          totalIncome,
          totalExpenses,
          endingBalance,
          prudentReserve,
          transactionCount: transactions.length,
        },
      };
    } catch (error) {
      logger.error("Error generating treasury report:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to generate treasury report.");
    }
  },
);

interface PDFData {
  groupName: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  endingBalance: number;
  prudentReserve: number;
  incomeByCategory: CategorySummary[];
  expensesByCategory: CategorySummary[];
  transactions: Transaction[];
}

function generatePDF(data: PDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const formatCurrency = (amount: number) =>
        `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      };

      // Header
      doc.fontSize(24).font("Helvetica-Bold").text("Treasury Report", {
        align: "center",
      });

      doc.moveDown(0.5);
      doc.fontSize(16).font("Helvetica").text(data.groupName, {
        align: "center",
      });

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .fillColor("#666666")
        .text(`${formatDate(data.startDate)} - ${formatDate(data.endDate)}`, {
          align: "center",
        });

      doc.fillColor("#000000");
      doc.moveDown(1.5);

      // Summary Section
      doc.fontSize(14).font("Helvetica-Bold").text("Financial Summary");
      doc.moveDown(0.5);

      // Draw summary box
      const summaryStartY = doc.y;
      doc.rect(50, summaryStartY, 500, 100).stroke();

      doc.fontSize(11).font("Helvetica");

      // Left column
      doc.text("Starting Balance:", 70, summaryStartY + 15);
      doc.text("Total Income:", 70, summaryStartY + 35);
      doc.text("Total Expenses:", 70, summaryStartY + 55);
      doc.text("Ending Balance:", 70, summaryStartY + 75);

      // Values
      doc.font("Helvetica-Bold");
      doc.text(formatCurrency(data.startingBalance), 200, summaryStartY + 15, {
        width: 100,
        align: "right",
      });
      doc
        .fillColor("#2E7D32")
        .text(formatCurrency(data.totalIncome), 200, summaryStartY + 35, {
          width: 100,
          align: "right",
        });
      doc
        .fillColor("#C62828")
        .text(formatCurrency(data.totalExpenses), 200, summaryStartY + 55, {
          width: 100,
          align: "right",
        });
      doc
        .fillColor("#000000")
        .text(formatCurrency(data.endingBalance), 200, summaryStartY + 75, {
          width: 100,
          align: "right",
        });

      // Right column
      doc.font("Helvetica");
      doc.text("Prudent Reserve:", 350, summaryStartY + 15);
      doc.text("Available Funds:", 350, summaryStartY + 35);

      doc.font("Helvetica-Bold");
      doc.text(formatCurrency(data.prudentReserve), 450, summaryStartY + 15, {
        width: 80,
        align: "right",
      });
      doc.text(
        formatCurrency(data.endingBalance - data.prudentReserve),
        450,
        summaryStartY + 35,
        { width: 80, align: "right" },
      );

      doc.y = summaryStartY + 120;

      // Income Breakdown
      if (data.incomeByCategory.length > 0) {
        doc.moveDown(0.5);
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor("#2E7D32")
          .text("Income by Category");
        doc.fillColor("#000000");
        doc.moveDown(0.5);

        doc.fontSize(10).font("Helvetica");
        data.incomeByCategory
          .sort((a, b) => b.total - a.total)
          .forEach((cat) => {
            doc.text(
              `${cat.category}: ${formatCurrency(cat.total)} (${cat.count} transaction${cat.count > 1 ? "s" : ""})`,
            );
          });
      }

      // Expense Breakdown
      if (data.expensesByCategory.length > 0) {
        doc.moveDown(1);
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor("#C62828")
          .text("Expenses by Category");
        doc.fillColor("#000000");
        doc.moveDown(0.5);

        doc.fontSize(10).font("Helvetica");
        data.expensesByCategory
          .sort((a, b) => b.total - a.total)
          .forEach((cat) => {
            doc.text(
              `${cat.category}: ${formatCurrency(cat.total)} (${cat.count} transaction${cat.count > 1 ? "s" : ""})`,
            );
          });
      }

      // Transaction List
      if (data.transactions.length > 0) {
        doc.addPage();
        doc.fontSize(14).font("Helvetica-Bold").text("Transaction Details");
        doc.moveDown(0.5);

        // Table header
        const tableTop = doc.y;
        const colWidths = [80, 80, 200, 80];
        const colPositions = [50, 130, 210, 410];

        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor("#666666")
          .text("Date", colPositions[0], tableTop)
          .text("Type", colPositions[1], tableTop)
          .text("Description", colPositions[2], tableTop)
          .text("Amount", colPositions[3], tableTop);

        doc.fillColor("#000000");
        doc
          .moveTo(50, tableTop + 15)
          .lineTo(550, tableTop + 15)
          .stroke();

        let rowY = tableTop + 25;
        doc.font("Helvetica").fontSize(9);

        data.transactions.forEach((t, index) => {
          // Add page break if needed
          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
          }

          const dateStr = new Date(t.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const description = t.description || t.category;
          const truncatedDesc =
            description.length > 40
              ? description.substring(0, 37) + "..."
              : description;

          doc.text(dateStr, colPositions[0], rowY);
          doc.text(
            t.type === "income" ? "Income" : "Expense",
            colPositions[1],
            rowY,
          );
          doc.text(truncatedDesc, colPositions[2], rowY);

          const amountColor = t.type === "income" ? "#2E7D32" : "#C62828";
          const amountPrefix = t.type === "income" ? "+" : "-";
          doc
            .fillColor(amountColor)
            .text(
              `${amountPrefix}${formatCurrency(t.amount)}`,
              colPositions[3],
              rowY,
            );
          doc.fillColor("#000000");

          rowY += 18;
        });
      }

      // Footer
      doc.fontSize(8).fillColor("#999999");
      const generatedDate = new Date().toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
      });
      doc.text(`Generated on ${generatedDate}`, 50, 750, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
