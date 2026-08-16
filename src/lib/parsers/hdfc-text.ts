/**
 * HDFC Bank text statement parser.
 *
 * Format (fixed-width text, multi-page):
 *   Header block repeated per page → strip
 *   Transaction rows:
 *     DD/MM/YY  NARRATION(multi-line)  REF_NO  VALUE_DT  WITHDRAWAL  DEPOSIT  CLOSING_BAL
 *   Summary block at end:
 *     Opening Balance   Debits   Credits   Closing Bal
 *     Dr Count   Cr Count
 */

export interface HdfcRawRow {
  date: string;        // DD/MM/YY
  narration: string;   // full merged multi-line narration
  refNo: string;
  valueDate: string;
  withdrawal: number | null;  // debit, null if credit
  deposit: number | null;     // credit, null if debit
  closingBalance: number;
}

export interface HdfcStatementMeta {
  accountNo: string;
  customerName: string;
  startDate: string;   // DD/MM/YYYY
  endDate: string;     // DD/MM/YYYY
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  drCount: number;
  crCount: number;
}

export interface HdfcParsedStatement {
  meta: HdfcStatementMeta;
  rows: HdfcRawRow[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

function parseAmount(s: string): number | null {
  if (!s || !s.trim()) return null;
  const cleaned = s.replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Remove page-break header blocks that HDFC repeats every ~50 lines */
function stripPageHeaders(text: string): string {
  // Each page starts with "HDFC BANK Ltd." and ends before the first transaction line
  // We detect the dashed separator line that appears just before transactions on each page
  // and remove everything from "HDFC BANK Ltd." up to and including that separator.
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let skip = false;

  for (const line of lines) {
    // Detect start of a page header
    if (/^HDFC BANK Ltd\./.test(line)) {
      skip = true;
      continue;
    }
    // Detect end of page header: the "---" dashed separator line after column headers
    // It could be on its own line or attached to "Closing Balance"
    if (skip && (line.includes('Closing Balance--------') || /^-{8}/.test(line.trim()))) {
      skip = false;
      continue;
    }
    // Also skip the column-header lines
    if (skip && /Date\s+Narration/.test(line)) continue;
    if (skip) continue;
    // Skip **Continue** lines
    if (/^\*+Continue\*+/.test(line.trim())) continue;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * A transaction line starts with a date pattern DD/MM/YY at position 0.
 * Continuation lines start with spaces.
 */
const DATE_RE = /^(\d{2}\/\d{2}\/\d{2})\s{2}/;

/**
 * Extract the fixed-width columns from the first line of a transaction:
 *
 * The HDFC text format uses fixed widths (approximate):
 *  col 0-9:    date (DD/MM/YY)
 *  col 10-51:  narration part 1 (40 chars)
 *  col 52-67:  ref no (16 chars)
 *  col 68-75:  value date (8 chars)
 *  col 76-93:  withdrawal amount (right-aligned 18 chars)
 *  col 94-111: deposit amount (right-aligned 18 chars)
 *  col 112+:   closing balance
 */
function extractFirstLine(line: string): Omit<HdfcRawRow, "narration"> & { narrationPart: string } {
  // A transaction line starts with Date, Narration, RefNo, Value Date, Withdrawal, Deposit, Closing Balance.
  // Withdrawal and Deposit may be empty. Spaces separate them.
  const match = line.match(/^(\d{2}\/\d{2}\/\d{2})\s+(.*?)\s{2,}([A-Za-z0-9]{8,20})\s+(\d{2}\/\d{2}\/\d{2})(.*)/);

  if (!match) {
    // Fallback: try to pull at least date + narration from beginning
    const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{2})\s+(.*)/);
    return {
      date: dateMatch ? dateMatch[1] : "",
      narrationPart: dateMatch ? dateMatch[2].trim() : line.trim(),
      refNo: "",
      valueDate: "",
      withdrawal: null,
      deposit: null,
      closingBalance: 0,
    };
  }

  const [, date, narr, refNo, valueDate, amountsStr] = match;

  // amountsStr has the format: "[spaces] WithdrawalAmt [spaces] DepositAmt [spaces] ClosingBal"
  // Either Withdrawal or Deposit is usually missing.
  // ClosingBal is always the last token.
  const nums = amountsStr.trim().split(/\s+/);
  const closingBalance = parseAmount(nums[nums.length - 1]) ?? 0;
  
  let withdrawal: number | null = null;
  let deposit: number | null = null;

  if (nums.length > 1) {
    // There is an amount before closing balance
    const amtStr = nums[0];
    const index = amountsStr.indexOf(amtStr);
    
    // In HDFC format, withdrawal is right-aligned to ~18 chars after Value Date.
    // Deposit is right-aligned to ~36 chars after Value Date.
    // So if the index < 25, it's a withdrawal. If it's >= 25, it's a deposit.
    if (index < 25) {
      withdrawal = parseAmount(amtStr);
      if (nums.length > 2) deposit = parseAmount(nums[1]); // Just in case a line has both
    } else {
      deposit = parseAmount(amtStr);
    }
  }

  return {
    date,
    narrationPart: narr.trim(),
    refNo: refNo.trim(),
    valueDate: valueDate.trim(),
    withdrawal,
    deposit,
    closingBalance,
  };
}

// ─── main parser ─────────────────────────────────────────────────────────────

export function parseHdfcText(raw: string): HdfcParsedStatement {
  // 1. Extract metadata from raw text before stripping
  const meta = extractMeta(raw);

  // 2. Strip repeated page headers
  const cleaned = stripPageHeaders(raw);

  // 3. Split into lines
  const lines = cleaned.split(/\r?\n/);

  // 4. Group into transaction blocks (first line has date, continuation lines have leading spaces)
  const txGroups: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    if (DATE_RE.test(trimmed)) {
      // New transaction
      if (current) txGroups.push(current);
      current = [trimmed];
    } else if (current && /^\s{10}/.test(line)) {
      // Continuation line (has leading spaces, part of previous narration)
      current.push(trimmed);
    } else if (current) {
      // Could be a continuation with less indentation
      if (/^\s{2,}/.test(line) && !/^\*+/.test(trimmed)) {
        current.push(trimmed);
      }
    }
  }
  if (current) txGroups.push(current);

  // 5. Parse each transaction group
  const rows: HdfcRawRow[] = [];
  for (const group of txGroups) {
    if (!group.length) continue;
    const firstLine = group[0];
    if (!DATE_RE.test(firstLine)) continue;

    const parsed = extractFirstLine(firstLine);

    // Merge narration continuation lines
    const continuationParts = group.slice(1).map((l) => l.trim()).filter(Boolean);
    const narration = [parsed.narrationPart, ...continuationParts]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    rows.push({
      date: parsed.date,
      narration,
      refNo: parsed.refNo,
      valueDate: parsed.valueDate,
      withdrawal: parsed.withdrawal,
      deposit: parsed.deposit,
      closingBalance: parsed.closingBalance,
    });
  }

  // 6. Deduplicate refNos — some special transactions (POS reversals,
  //    interest entries, etc.) share a generic refNo like "000000000000000".
  //    Append "-2", "-3", … to subsequent duplicates so the DB unique
  //    constraint on (userId, refNo) won't reject them.
  const refCount = new Map<string, number>();
  for (const row of rows) {
    const count = (refCount.get(row.refNo) ?? 0) + 1;
    refCount.set(row.refNo, count);
    if (count > 1) {
      row.refNo = `${row.refNo}-${count}`;
    }
  }

  return { meta, rows };
}

function extractMeta(text: string): HdfcStatementMeta {
  const acctMatch = text.match(/Account No\s*:\s*(\d+)/);
  const nameMatch = text.match(/MR\s+(\S+(?:\s+\S+)?)/);
  const stmtMatch = text.match(/Statement From\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+To:\s*(\d{2}\/\d{2}\/\d{4})/);

  // Summary block: "Opening Balance ... Debits ... Credits ... Closing Bal"
  const summaryMatch = text.match(
    /Opening Balance\s+Debits\s+Credits\s+Closing Bal\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/
  );
  const countMatch = text.match(/Dr Count\s+Cr Count\s+(\d+)\s+(\d+)/);

  return {
    accountNo: acctMatch?.[1] ?? "",
    customerName: nameMatch?.[1] ?? "Account Holder",
    startDate: stmtMatch?.[1] ?? "",
    endDate: stmtMatch?.[2] ?? "",
    openingBalance: parseAmount(summaryMatch?.[1] ?? "") ?? 0,
    totalDebits: parseAmount(summaryMatch?.[2] ?? "") ?? 0,
    totalCredits: parseAmount(summaryMatch?.[3] ?? "") ?? 0,
    closingBalance: parseAmount(summaryMatch?.[4] ?? "") ?? 0,
    drCount: parseInt(countMatch?.[1] ?? "0", 10),
    crCount: parseInt(countMatch?.[2] ?? "0", 10),
  };
}
