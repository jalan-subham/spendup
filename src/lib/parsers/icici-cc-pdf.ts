import { createHash } from "node:crypto";

export interface HdfcSwiggyCcPdfTransaction {
  refNo: string;
  date: string;
  narration: string;
  amount: number;
  type: "WITHDRAWAL" | "DEPOSIT";
}

export interface HdfcSwiggyCcPdfParseSuccess {
  success: true;
  accountNo?: string;
  startDate?: string;
  endDate?: string;
  transactions: HdfcSwiggyCcPdfTransaction[];
}

export interface HdfcSwiggyCcPdfParseFailure {
  success: false;
  error: string;
  passwordRequired?: boolean;
}

export type HdfcSwiggyCcPdfParseResult = HdfcSwiggyCcPdfParseSuccess | HdfcSwiggyCcPdfParseFailure;

const MAX_REASONABLE_CC_TXN = 500000;

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function isLikelyAmountToken(token: string): boolean {
  if (!/^\d[\d,]*(?:\.\d{2})?$/.test(token)) return false;
  // Prefer currency-shaped tokens over long identifiers.
  if (!(token.includes(",") || token.includes("."))) return false;
  const amount = parseAmount(token);
  return amount > 0 && amount <= MAX_REASONABLE_CC_TXN;
}

function normalizeDate(raw: string): string {
  const m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{2,4})$/);
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

function sanitizeNarration(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function buildRefNo(date: string, narration: string, amount: number, type: "WITHDRAWAL" | "DEPOSIT") {
  const fingerprint = ["hdfc_swiggy_cc_pdf", date, narration.toLowerCase(), amount.toFixed(2), type].join("|");
  const hash = createHash("sha1").update(fingerprint).digest("hex");
  return `HDFC-SWIGGY-CC-${hash.slice(0, 24)}`;
}

function parseLineToTransaction(line: string): Omit<HdfcSwiggyCcPdfTransaction, "refNo"> | null {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return null;

  const leadingDate = compact.match(/^(\d{2}[\/-]\d{2}[\/-]\d{2,4})\s+(.+)$/);
  if (!leadingDate) return null;

  const date = normalizeDate(leadingDate[1]);
  const rest = leadingDate[2];

  // Handles common statement shapes like:
  // DD-MM-YYYY MERCHANT NAME 1,234.56 DR
  // DD-MM-YYYY MERCHANT NAME 1,234.56 CR
  // DD-MM-YYYY MERCHANT NAME 1,234.56
  const withSuffix = rest.match(/^(.+?)\s+([\d,]+(?:\.\d{2})?)\s*(DR|CR)$/i);
  if (withSuffix) {
    const [, rawNarration, rawAmount, suffix] = withSuffix;
    const amount = parseAmount(rawAmount);
    const type = suffix.toUpperCase() === "CR" ? "DEPOSIT" : "WITHDRAWAL";
    return {
      date,
      narration: sanitizeNarration(rawNarration),
      amount,
      type,
    };
  }

  const amountTokens = [...rest.matchAll(/([\d,]+(?:\.\d{2})?)/g)];
  if (!amountTokens.length) return null;

  const amountToken = amountTokens[amountTokens.length - 1];
  const rawAmount = amountToken[1];
  const idx = amountToken.index ?? -1;
  if (idx < 0) return null;

  const rawNarration = rest.slice(0, idx).trim();
  if (!rawNarration) return null;

  const amount = parseAmount(rawAmount);
  if (amount <= 0 || amount > MAX_REASONABLE_CC_TXN) return null;
  return {
    date,
    narration: sanitizeNarration(rawNarration),
    amount,
    type: "WITHDRAWAL",
  };
}

function extractTransactionsFromText(fullText: string): HdfcSwiggyCcPdfTransaction[] {
  const normalized = fullText.replace(/\s+/g, " ").trim();
  const rowStartRe = /(\d{2}\/\d{2}\/\d{4})\s*\|\s*(\d{2}:\d{2})\s*\|/g;

  const rowStarts = [...normalized.matchAll(rowStartRe)]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === "number");

  const rows: HdfcSwiggyCcPdfTransaction[] = [];
  if (!rowStarts.length) return rows;

  for (let rowIndex = 0; rowIndex < rowStarts.length; rowIndex++) {
    const start = rowStarts[rowIndex];
    const end = rowStarts[rowIndex + 1] ?? normalized.length;
    const segment = normalized.slice(start, end).trim();
    const compact = segment.replace(/\s*\|\s*/g, "|");
    const parts = compact.split("|").map((part) => part.trim());

    const date = parts[0];
    const time = parts[1];
    if (!date || !time) continue;

    const amountIndex = parts.findIndex((part, index) => index > 1 && isLikelyAmountToken(part));
    if (amountIndex === -1) continue;

    const amountRaw = parts[amountIndex];
    const amount = parseAmount(amountRaw);
    if (!amount || amount > MAX_REASONABLE_CC_TXN) continue;

    const tokensBetween = parts.slice(2, amountIndex).filter((part) => part && part !== "C");
    const isDeposit = tokensBetween.includes("+");
    const description = sanitizeNarration(tokensBetween.filter((part) => part !== "+").join(" "));
    if (!description) continue;

    rows.push({
      refNo: buildRefNo(date, `${time} ${description}`, amount, isDeposit ? "DEPOSIT" : "WITHDRAWAL"),
      date,
      narration: sanitizeNarration(`${time} ${description}`),
      amount,
      type: isDeposit ? "DEPOSIT" : "WITHDRAWAL",
    });
  }

  return rows;
}

function extractLinesByPageText(textItems: Array<{ str: string; transform?: number[] }>): string[] {
  const rawText = textItems
    .map((item) => String(item.str ?? "").trim())
    .filter(Boolean)
    .join(" | ");

  return rawText ? [rawText] : [];
}

function extractAccountAndPeriod(fullText: string): { accountNo?: string; startDate?: string; endDate?: string } {
  const accountMatch =
    fullText.match(/Card\s*(?:No|Number)\s*[:\-]?\s*([\dXx*\-\s]{8,})/) ||
    fullText.match(/Account\s*(?:No|Number)\s*[:\-]?\s*([\dXx*\-\s]{8,})/);
  const periodMatch = fullText.match(/(\d{2}[\/-]\d{2}[\/-]\d{4})\s*(?:to|\-|–)\s*(\d{2}[\/-]\d{2}[\/-]\d{4})/i);

  const digits = (accountMatch?.[1] ?? "").replace(/\D/g, "");
  return {
    accountNo: digits ? digits.slice(-4) : undefined,
    startDate: periodMatch ? normalizeDate(periodMatch[1]) : undefined,
    endDate: periodMatch ? normalizeDate(periodMatch[2]) : undefined,
  };
}

export async function parseHdfcSwiggyCreditCardPdf(
  buffer: Uint8Array,
  password?: string
): Promise<HdfcSwiggyCcPdfParseResult> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: password?.trim() || undefined,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const allLines: string[] = [];

    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      allLines.push(...extractLinesByPageText(content.items as Array<{ str: string; transform?: number[] }>));
    }

    const fullText = allLines.join("\n");
    const parsedRows = extractTransactionsFromText(fullText).length > 0
      ? extractTransactionsFromText(fullText)
      : allLines
          .map(parseLineToTransaction)
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => ({
            ...row,
            refNo: buildRefNo(row.date, row.narration, row.amount, row.type),
          }));

    if (!parsedRows.length) {
      return {
        success: false,
        error: "No credit-card transactions were parsed from the PDF.",
      };
    }

    parsedRows.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
    const meta = extractAccountAndPeriod(fullText);

    return {
      success: true,
      accountNo: meta.accountNo,
      startDate: meta.startDate,
      endDate: meta.endDate,
      transactions: parsedRows,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse credit-card PDF";
    const lowered = message.toLowerCase();
    const passwordRequired =
      lowered.includes("password") || lowered.includes("incorrect password") || lowered.includes("needs a password");

    return {
      success: false,
      error: passwordRequired
        ? "Password required or incorrect for this PDF statement"
        : message,
      passwordRequired,
    };
  }
}
