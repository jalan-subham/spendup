/**
 * Universal date parser and sorting utilities for transactions across all statement formats.
 * Supports:
 * - DD/MM/YY, DD/MM/YYYY (e.g. "24/01/25", "24/01/2025")
 * - DD-MM-YY, DD-MM-YYYY (e.g. "24-01-25", "24-01-2025")
 * - YYYY-MM-DD, YYYY/MM/DD (e.g. "2025-01-24")
 * - ISO string timestamps (e.g. "2025-01-24T18:30:00.000Z")
 * - DD Mon YYYY / DD-Mon-YYYY (e.g. "24-Jan-2025", "24 Jan 2025")
 */

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export function parseTxnDate(raw: string | undefined | null): number {
  if (!raw || typeof raw !== "string") return 0;
  const s = raw.trim();
  if (!s) return 0;

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD (starts with 4 digits)
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  // 2. Day-MonthName-Year (e.g. 15-Aug-2024, 15 Aug 24)
  const monNameMatch = s.match(/^(\d{1,2})[-/\s]([a-zA-Z]+)[-/\s](\d{2,4})$/);
  if (monNameMatch) {
    const [, d, monStr, yRaw] = monNameMatch;
    const monIdx = MONTH_NAME_MAP[monStr.toLowerCase()];
    if (monIdx !== undefined) {
      const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
      return new Date(year, monIdx, parseInt(d, 10)).getTime();
    }
  }

  // 3. Day-first numeric: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch;
    const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  // 4. Fallback to standard JS Date.parse
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Sorts transactions by date in DESCENDING order (newest first).
 */
export function compareTxnDateDesc(a: string | undefined | null, b: string | undefined | null): number {
  return parseTxnDate(b) - parseTxnDate(a);
}

/**
 * Sorts transactions by date in ASCENDING order (oldest first).
 */
export function compareTxnDateAsc(a: string | undefined | null, b: string | undefined | null): number {
  return parseTxnDate(a) - parseTxnDate(b);
}
