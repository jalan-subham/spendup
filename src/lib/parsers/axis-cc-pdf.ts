import { createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AxisCcPdfTransaction {
  refNo: string;
  date: string; // DD-MM-YYYY
  narration: string;
  merchantCategory: string;
  amount: number;
  type: "WITHDRAWAL" | "DEPOSIT";
}

export interface AxisCcPdfParseSuccess {
  success: true;
  cardNo?: string;
  startDate?: string;
  endDate?: string;
  transactions: AxisCcPdfTransaction[];
}

export interface AxisCcPdfParseFailure {
  success: false;
  error: string;
  passwordRequired?: boolean;
}

export type AxisCcPdfParseResult = AxisCcPdfParseSuccess | AxisCcPdfParseFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_REASONABLE_CC_TXN = 1_000_000;

/**
 * Column x-ranges (from pdfjs coordinate extraction of Axis CC PDFs):
 *   DATE:                x  0  – 80
 *   TRANSACTION DETAILS: x 81  – 330
 *   MERCHANT CATEGORY:   x 331 – 450
 *   AMOUNT (Rs.):        x 451 – 545
 *   CASHBACK EARNED:     x > 545  (ignored)
 */
const COL_DATE_MAX = 80;
const COL_NARR_MIN = 81;
const COL_NARR_MAX = 330;
const COL_MCAT_MIN = 331;
const COL_MCAT_MAX = 450;
const COL_AMT_MIN = 451;

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw: string): string {
  const m = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/);
  if (!m) return raw;
  const [, dd, mm, yy] = m;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${dd}-${mm}-${yyyy}`;
}

function parseDateForSort(raw: string): number {
  const m = normalizeDate(raw).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
}

function buildRefNo(
  date: string,
  narration: string,
  amount: number,
  type: "WITHDRAWAL" | "DEPOSIT"
): string {
  const fingerprint = [
    "axis_cc_pdf",
    date,
    narration.toLowerCase().trim(),
    amount.toFixed(2),
    type,
  ].join("|");
  const hash = createHash("sha1").update(fingerprint).digest("hex");
  return `AXIS-CC-${hash.slice(0, 24)}`;
}

// ─── Text item type ───────────────────────────────────────────────────────────

interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

// ─── Core extraction ──────────────────────────────────────────────────────────

/**
 * Group text items by (page, y-bucket) key so items on the same visual line
 * are bucketed together. Using page-tagged keys prevents y-coordinate
 * collisions across pages — critical because page 2's schedule-of-charges
 * table shares y-values with page 1 transaction rows.
 */
function groupByPageRow(items: TextItem[]): Map<string, TextItem[]> {
  const rows = new Map<string, TextItem[]>();
  for (const item of items) {
    const key = `${item.page}:${Math.round(item.y / 2) * 2}`;
    const bucket = rows.get(key) ?? [];
    bucket.push(item);
    rows.set(key, bucket);
  }
  return rows;
}

function extractTransactions(allItems: TextItem[]): AxisCcPdfTransaction[] {
  const rows = groupByPageRow(allItems);

  // Sort: page ascending, then y descending within each page (top-to-bottom reading)
  const sortedKeys = [...rows.keys()].sort((a, b) => {
    const [ap, ay] = a.split(":").map(Number);
    const [bp, by] = b.split(":").map(Number);
    if (ap !== bp) return ap - bp;
    return by - ay;
  });

  const DATE_RE = /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/;

  let inTable = false;
  let tableHeaderY = 0;
  let tableHeaderPage = 0;
  const txns: AxisCcPdfTransaction[] = [];

  for (const key of sortedKeys) {
    const rowItems = rows.get(key)!.sort((a, b) => a.x - b.x);
    const rowText = rowItems.map((i) => i.str).join(" ");
    const pg = rowItems[0].page;
    const y = rowItems[0].y;

    // Detect "Account Summary" table header
    if (!inTable && rowText.includes("TRANSACTION DETAILS") && rowText.includes("DATE")) {
      inTable = true;
      tableHeaderY = y;
      tableHeaderPage = pg;
      continue;
    }

    // Stop at end-of-table marker
    if (inTable && rowText.includes("End of Statement")) break;

    if (!inTable) continue;

    // Only process rows on the same page as the table header and below it
    if (pg !== tableHeaderPage) continue;
    if (y >= tableHeaderY) continue;

    // Find a DATE token in the left column
    const dateItem = rowItems.find(
      (i) => i.x <= COL_DATE_MAX && DATE_RE.test(i.str)
    );
    if (!dateItem) continue;

    const date = normalizeDate(dateItem.str);

    // Narration
    const narrItems = rowItems.filter(
      (i) => i.x > COL_NARR_MIN && i.x <= COL_NARR_MAX
    );
    const narration = narrItems.map((i) => i.str).join(" ").trim();
    if (!narration) continue;

    // Merchant category (optional)
    const mcatItems = rowItems.filter(
      (i) => i.x > COL_MCAT_MIN && i.x <= COL_MCAT_MAX
    );
    const merchantCategory = mcatItems.map((i) => i.str).join(" ").trim();

    // Amount — "2,778.00 Dr" or "2,778.00" + "Dr"
    const amtText = rowItems
      .filter((i) => i.x > COL_AMT_MIN)
      .map((i) => i.str)
      .join(" ")
      .trim();
    const amtMatch = amtText.match(/([\d,]+(?:\.\d{2})?)\s*(Dr|Cr)/i);
    if (!amtMatch) continue;

    const amount = parseAmount(amtMatch[1]);
    if (amount <= 0 || amount > MAX_REASONABLE_CC_TXN) continue;

    const type: "WITHDRAWAL" | "DEPOSIT" =
      amtMatch[2].toUpperCase() === "CR" ? "DEPOSIT" : "WITHDRAWAL";

    txns.push({
      refNo: buildRefNo(date, narration, amount, type),
      date,
      narration,
      merchantCategory,
      amount,
      type,
    });
  }

  return txns;
}

function extractMeta(allItems: TextItem[]): {
  cardNo?: string;
  startDate?: string;
  endDate?: string;
} {
  const fullText = allItems.map((i) => i.str).join(" ");

  // Card number: e.g. "533467******1523"
  const cardMatch = fullText.match(/(\d{6}\*{4,6}\d{4})/);

  // Statement period: e.g. "15/08/2026 - 13/09/2026"
  const periodMatch = fullText.match(
    /(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/
  );

  return {
    cardNo: cardMatch?.[1],
    startDate: periodMatch ? normalizeDate(periodMatch[1]) : undefined,
    endDate: periodMatch ? normalizeDate(periodMatch[2]) : undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseAxisCreditCardPdf(
  buffer: Uint8Array,
  password?: string
): Promise<AxisCcPdfParseResult> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: password?.trim() || undefined,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const allItems: TextItem[] = [];

    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      for (const raw of content.items as Array<{
        str: string;
        transform?: number[];
      }>) {
        const str = (raw.str ?? "").trim();
        if (!str) continue;
        const x = raw.transform ? Math.round(raw.transform[4]) : 0;
        const y = raw.transform ? Math.round(raw.transform[5]) : 0;
        allItems.push({ str, x, y, page: pageNo });
      }
    }

    const meta = extractMeta(allItems);
    const transactions = extractTransactions(allItems);

    if (!transactions.length) {
      return {
        success: false,
        error:
          "No transactions were parsed from the Axis CC PDF. Ensure this is an Axis Bank credit card statement.",
      };
    }

    transactions.sort(
      (a, b) => parseDateForSort(a.date) - parseDateForSort(b.date)
    );

    return {
      success: true,
      cardNo: meta.cardNo,
      startDate: meta.startDate,
      endDate: meta.endDate,
      transactions,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse Axis CC PDF";
    const lowered = message.toLowerCase();
    const passwordRequired =
      lowered.includes("password") ||
      lowered.includes("incorrect password") ||
      lowered.includes("needs a password");

    return {
      success: false,
      error: passwordRequired
        ? "Password required or incorrect. Axis CC PDF password is typically: first 4 letters of your name (CAPS) + DDMM of birth date. Example: SUBH0710"
        : message,
      passwordRequired,
    };
  }
}
