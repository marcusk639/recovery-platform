// Generates PDFs from the canonical markdown sources for paid products and
// free lead magnets. Output is written to build/pdfs/ (gitignored build dir).
// Run: npm run pdfs
import { mdToPdf } from "md-to-pdf";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT_DIR = "build/pdfs";

// [source markdown, output pdf filename]
const JOBS = [
  ["docs/product/products/01-family-survival-guide.md", "family-survival-guide.pdf"],
  ["docs/product/products/02-appointment-prep-worksheet.md", "appointment-prep-worksheet.pdf"],
  ["docs/product/products/03-withdrawal-safety-checklist.md", "withdrawal-safety-checklist.pdf"],
  ["docs/product/products/04-treatment-comparison-worksheet.md", "treatment-comparison-worksheet.pdf"],
  ["docs/product/products/05-relapse-prevention-plan.md", "relapse-prevention-plan.pdf"],
  ["docs/operations/lead-magnets/01-unsafe-withdrawal.md", "lead-magnet-unsafe-withdrawal.pdf"],
  ["docs/operations/lead-magnets/02-helping-someone-in-withdrawal.md", "lead-magnet-helping-someone.pdf"],
  ["docs/operations/lead-magnets/03-detox-programs-lose-trust.md", "lead-magnet-detox-programs.pdf"],
];

await mkdir(OUT_DIR, { recursive: true });

for (const [src, out] of JOBS) {
  const dest = join(OUT_DIR, out);
  await mkdir(dirname(dest), { recursive: true });
  const pdf = await mdToPdf({ path: src }, { dest });
  if (!pdf) throw new Error(`Failed to generate PDF for ${src}`);
  console.log(`✓ ${src} → ${dest}`);
}

console.log(`\nDone. ${JOBS.length} PDFs in ${OUT_DIR}/`);
