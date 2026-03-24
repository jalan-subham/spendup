import "server-only";
import { createHash } from "node:crypto";

import { parseHdfcText } from "@/lib/parsers/hdfc-text";
import type { HdfcRawRow, HdfcStatementMeta } from "@/lib/parsers/hdfc-text";
import { parseIciciStatement } from "@/lib/parsers/icici-parser";
import type { Transaction as IciciTransaction } from "@/lib/parsers/icici-parser";
import { getParserCatalogItem, type ParserId } from "@/lib/parsers/catalog";

export interface ParsedStatementPayload {
  meta: HdfcStatementMeta;
  rows: HdfcRawRow[];
  legacyData?: IciciTransaction[];
}

export interface ExecuteParserSuccess {
  success: true;
  payload: ParsedStatementPayload;
}

export interface ExecuteParserFailure {
  success: false;
  error: string;
  passwordRequired?: boolean;
}

export type ExecuteParserResult = ExecuteParserSuccess | ExecuteParserFailure;

function buildIciciMeta(rows: HdfcRawRow[]): HdfcStatementMeta {
  const startDate = rows[0]?.date ?? "";
  const endDate = rows[rows.length - 1]?.date ?? "";
  const drRows = rows.filter((row) => row.withdrawal != null);
  const crRows = rows.filter((row) => row.deposit != null);

  return {
    accountNo: "ICICI XLS",
    customerName: "Imported User",
    startDate,
    endDate,
    openingBalance:
      rows.length > 0
        ? (rows[0].closingBalance || 0) - (rows[0].deposit || 0) + (rows[0].withdrawal || 0)
        : 0,
    closingBalance: rows[rows.length - 1]?.closingBalance ?? 0,
    drCount: drRows.length,
    crCount: crRows.length,
    totalDebits: drRows.reduce((sum, row) => sum + (row.withdrawal || 0), 0),
    totalCredits: crRows.reduce((sum, row) => sum + (row.deposit || 0), 0),
  };
}

async function executeHdfcTextParser(buffer: Uint8Array): Promise<ExecuteParserResult> {
  try {
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = parseHdfcText(text);
    return { success: true, payload: { meta: parsed.meta, rows: parsed.rows } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse text statement",
    };
  }
}

async function executeIciciXlsParser(buffer: Uint8Array, password?: string): Promise<ExecuteParserResult> {
  const result = await parseIciciStatement(buffer, password);
  if (!result.success) {
    return {
      success: false,
      error: result.error || "Failed to parse ICICI XLS statement",
    };
  }

  const buildIciciTransactionRef = (tx: IciciTransaction): string => {
    const canonicalNarration = tx.description.toLowerCase().replace(/\s+/g, " ").trim();
    const fingerprint = [
      "icici",
      tx.date,
      tx.type,
      tx.amount.toFixed(2),
      tx.balance.toFixed(2),
      canonicalNarration,
    ].join("|");

    const hash = createHash("sha1").update(fingerprint).digest("hex");
    return `ICICI-TX-${hash.slice(0, 24)}`;
  };

  const txs = result.transactions ?? [];
  const rows: HdfcRawRow[] = txs.map((tx) => ({
    refNo: buildIciciTransactionRef(tx),
    date: tx.date,
    narration: tx.description,
    valueDate: tx.date,
    withdrawal: tx.type === "WITHDRAWAL" ? tx.amount : null,
    deposit: tx.type === "DEPOSIT" ? tx.amount : null,
    closingBalance: tx.balance,
  }));

  return {
    success: true,
    payload: {
      meta: buildIciciMeta(rows),
      rows,
      legacyData: txs,
    },
  };
}

export async function executeParserById(
  parserId: ParserId,
  buffer: Uint8Array,
  password?: string
): Promise<ExecuteParserResult> {
  const parser = getParserCatalogItem(parserId);
  if (!parser) return { success: false, error: "Unknown parser" };

  if (parserId === "hdfc_text") return executeHdfcTextParser(buffer);
  if (parserId === "icici_xls") return executeIciciXlsParser(buffer, password);

  return { success: false, error: "Parser not implemented" };
}
