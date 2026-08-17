import type { TransactionType, Category } from "./types";

export interface ClassifiedRow {
  refNo: string;
  transactionType: TransactionType;
  category: Category;
  paymentMethod: "UPI" | "Debit" | "Credit Card" | "Net Banking" | "Other";
  confidence: number;
  notes?: string;
}

export const BASE_SYSTEM_PROMPT = `You are classifying Indian bank transactions. 
Given a list of transactions (narration + debit/credit amount in INR), classify each one.

Decision priority (highest first):
1) Explicit hard rules in this prompt
2) Additional user-selected classification metas
3) General narration heuristics

Transaction types:
- spend        → actual purchase or expense
- income       → salary, freelance pay, grants, receiving money from others
- cc_settlement → credit card bill payment (keywords: CRED CLUB, PAYMENT ON CRED, CC PAYMENT, HDFC CC, ICICI CC)
- investment   → mutual funds, SIP, stocks (keywords: MUTUAL FUNDS, GROWW, ZERODHA, ICCL, SIP)
- transfer     → moving money between own accounts (same name in UPI handle, IMPS/NEFT to self, round large amounts to own accounts)
- refund       → refund, reversal, cashback

Categories (only for spend):
Food, Transport, Shopping, Utilities, Entertainment, Travel, Health, Fuel, Rent, Education, Subscription, Groceries, Other

Transport hard rule:
- For debit/outgoing transactions with UPI payment pattern and amount between INR 150 and INR 250 (inclusive), if narration/purpose is unclear or generic, prefer transactionType="spend" and category="Transport".
- Do not default these cases to "Other" unless there is clear conflicting evidence.

For income/investment/transfer/cc_settlement, return category as the type name with title case (e.g. "Income", "Investment", "Transfer", "CC Settlement").
For refund: use category="Cashback" when narration clearly indicates cashback/reward points credit, otherwise category="Refund".
Extract the payment method from the narration if possible (e.g. "UPI-...", "POS...", "NEFT", "IMPS"). Default to "Other" if unclear.

Return a JSON array only. No markdown, no explanation. Each element:
{ "refNo": string, "transactionType": string, "category": string, "paymentMethod": "UPI" | "Debit" | "Credit Card" | "Net Banking" | "Other", "confidence": number (0-1), "notes": string (brief reason if confidence < 0.8) }`;

export function buildTransactionPayload(
  rows: { refNo: string; narration: string; withdrawal?: number | null; deposit?: number | null }[]
) {
  return rows.map((r) => ({
    refNo: r.refNo,
    narration: r.narration,
    amount: r.withdrawal != null ? -r.withdrawal : r.deposit ?? 0,
    direction: r.withdrawal != null ? "debit" : "credit",
  }));
}

export function buildFullClassificationPrompt(
  rows: { refNo: string; narration: string; withdrawal?: number | null; deposit?: number | null }[],
  metaHints: string[] = []
): string {
  const metaSection = metaHints.length
    ? `\n\nAdditional user-selected classification metas (treat as strong guidance and apply unless clearly contradicted):\n- ${metaHints.join("\n- ")}`
    : "";

  const systemPrompt = `${BASE_SYSTEM_PROMPT}${metaSection}`;
  const payload = buildTransactionPayload(rows);

  return `${systemPrompt}\n\nTransactions to Classify (JSON Input):\n${JSON.stringify(payload, null, 2)}`;
}

export function parseClassifiedJson(raw: string): { success: boolean; data: ClassifiedRow[]; error?: string } {
  if (!raw || !raw.trim()) {
    return { success: false, data: [], error: "Pasted text is empty." };
  }

  try {
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
    cleaned = cleaned.trim();

    // Sometimes LLM includes text before/after JSON array. Extract first [ ... ]
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.slice(firstBracket, lastBracket + 1);
    }

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return { success: false, data: [], error: "Expected a JSON array of classified transactions." };
    }

    const validRows: ClassifiedRow[] = parsed.map((item: any) => ({
      refNo: String(item.refNo ?? ""),
      transactionType: (item.transactionType ?? "spend") as TransactionType,
      category: (item.category ?? "Other") as Category,
      paymentMethod: (item.paymentMethod ?? "Other") as "UPI" | "Debit" | "Credit Card" | "Net Banking" | "Other",
      confidence: typeof item.confidence === "number" ? item.confidence : 0.9,
      notes: item.notes ? String(item.notes) : undefined,
    }));

    return { success: true, data: validRows };
  } catch (err: unknown) {
    return {
      success: false,
      data: [],
      error: err instanceof Error ? err.message : "Invalid JSON format. Please check for syntax errors.",
    };
  }
}
