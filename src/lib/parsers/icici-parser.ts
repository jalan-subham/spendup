import * as XLSX from "xlsx";

// Types
export interface Transaction {
  serialNo: string;
  sourceRowNo: number;
  date: string;
  description: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  balance: number;
}

export interface ParseResult {
  success: boolean;
  transactions?: Transaction[];
  error?: string;
}

/**
 * Helper to parse Indian currency strings to numbers
 * Example: "1,03,862.00" -> 103862.00
 */
function parseAmount(amtStr: string): number {
  if (!amtStr) return 0;
  const cleaned = String(amtStr).replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDate(dateStr: string): string {
  const raw = String(dateStr || "").trim();
  if (!raw) return "";

  // ICICI XLS often exports as DD,MM,YYYY.
  if (/^\d{2},\d{2},\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split(",");
    return `${d}-${m}-${y}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("/");
    return `${d}-${m}-${y}`;
  }

  return raw;
}

function isNonEmpty(value: unknown): boolean {
  return String(value ?? "").trim() !== "";
}

/**
 * Parses an ICICI Bank Statement XLS/XLSX
 */
export async function parseIciciStatement(
  buffer: Uint8Array,
  _password?: string
): Promise<ParseResult> {
  try {
    const workbook = XLSX.read(buffer, { type: "array", raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "No worksheet found in ICICI file" };
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    }) as string[][];

    if (!rows.length) {
      return { success: false, error: "No rows found in ICICI sheet" };
    }

    const headerRowIndex = rows.findIndex((row) => {
      const sNo = String(row[1] || "").trim().toLowerCase();
      const txDate = String(row[3] || "").trim().toLowerCase();
      const remarks = String(row[5] || "").trim().toLowerCase();
      return sNo === "s no." && txDate === "transaction date" && remarks === "transaction remarks";
    });

    if (headerRowIndex === -1) {
      return { success: false, error: "Could not locate ICICI transactions header row" };
    }

    const transactions: Transaction[] = [];
    let lastTx: Transaction | null = null;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const serial = String(row[1] || "").trim();
      const txDate = String(row[3] || "").trim();
      const remarks = String(row[5] || "").trim();
      const withdrawal = parseAmount(String(row[6] || ""));
      const deposit = parseAmount(String(row[7] || ""));
      const balance = parseAmount(String(row[8] || ""));

      const isDataRow = /^\d+$/.test(serial) && isNonEmpty(txDate) && isNonEmpty(remarks);
      const isContinuationRow = !serial && isNonEmpty(remarks) && !isNonEmpty(txDate);

      if (isDataRow) {
        const type: 'DEPOSIT' | 'WITHDRAWAL' = deposit > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
        const amount = deposit > 0 ? deposit : withdrawal;

        const tx: Transaction = {
          serialNo: serial,
          sourceRowNo: i + 1,
          date: normalizeDate(txDate),
          description: remarks,
          type,
          amount,
          balance,
        };

        transactions.push(tx);
        lastTx = tx;
        continue;
      }

      // ICICI often wraps long remarks into the next row with blank serial/date columns.
      if (isContinuationRow && lastTx) {
        lastTx.description = `${lastTx.description} ${remarks}`.replace(/\s+/g, " ").trim();
        continue;
      }

      // Once data rows have started, stop if we encounter a fully blank row block.
      if (transactions.length > 0 && row.every((cell) => !isNonEmpty(cell))) {
        break;
      }
    }

    if (!transactions.length) {
      return { success: false, error: "No transaction rows parsed from ICICI sheet" };
    }

    return {
      success: true,
      transactions,
    };
  } catch (error: unknown) {
    console.error("Error parsing ICICI XLS:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}
