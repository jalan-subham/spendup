import Groq from "groq-sdk";
import type { HdfcRawRow } from "./parsers/hdfc-text";
import type { TransactionType, Category } from "./types";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface ClassifiedRow {
  refNo: string;
  transactionType: TransactionType;
  category: Category;
  paymentMethod: "UPI" | "Debit" | "Credit Card" | "Net Banking" | "Other";
  confidence: number;
  notes?: string;
}

const BASE_SYSTEM_PROMPT = `You are classifying Indian bank transactions. 
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

export async function classifyTransactions(rows: HdfcRawRow[], metaHints: string[] = []): Promise<ClassifiedRow[]> {
  const BATCH_SIZE = 12;
  const results: ClassifiedRow[] = [];

  const metaSection = metaHints.length
    ? `\n\nAdditional user-selected classification metas (treat as strong guidance and apply unless clearly contradicted):\n- ${metaHints.join("\n- ")}`
    : "";

  const systemPrompt = `${BASE_SYSTEM_PROMPT}${metaSection}`;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const payload = batch.map((r) => ({
      refNo: r.refNo,
      narration: r.narration,
      amount: r.withdrawal != null ? -r.withdrawal : r.deposit ?? 0,
      direction: r.withdrawal != null ? "debit" : "credit",
    }));

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    try {
      // Strip any markdown code fences if the model wrapped them
      const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const parsed: ClassifiedRow[] = JSON.parse(jsonStr);
      results.push(...parsed);
    } catch {
      // If JSON parse fails, push unknown classification for each row in batch
      batch.forEach((r) =>
        results.push({
          refNo: r.refNo,
          transactionType: "spend",
          category: "Other",
          paymentMethod: "Other",
          confidence: 0,
          notes: "Classification failed — needs manual review",
        })
      );
    }
  }

  return results;
}
