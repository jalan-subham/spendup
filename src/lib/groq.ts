import Groq from "groq-sdk";
import type { HdfcRawRow } from "./parsers/hdfc-text";
import {
  BASE_SYSTEM_PROMPT,
  buildTransactionPayload,
  parseClassifiedJson,
  type ClassifiedRow,
} from "./classification-prompt";

export type { ClassifiedRow };

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  maxRetries: 3,
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function classifyTransactions(rows: HdfcRawRow[], metaHints: string[] = []): Promise<ClassifiedRow[]> {
  // Batch size 25 yields ~2.7k total tokens per batch, amortizing prompt overhead and fitting comfortably within rate limits
  const BATCH_SIZE = Math.max(1, parseInt(process.env.GROQ_BATCH_SIZE || "25", 10));
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

    // Inter-batch pacing to avoid bursting the TPM bucket on large statements
    if (i > 0) {
      await delay(500);
    }

    let batchSuccess = false;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
        const parseRes = parseClassifiedJson(raw);

        if (parseRes.success && parseRes.data.length > 0) {
          results.push(...parseRes.data);
          batchSuccess = true;
          break;
        } else {
          throw new Error(parseRes.error || "Empty or invalid classification array returned");
        }
      } catch (err: unknown) {
        const isRateLimit =
          err instanceof Error && (err.message.includes("429") || err.message.toLowerCase().includes("rate limit"));

        if (attempt < maxAttempts) {
          const waitMs = isRateLimit ? 3000 * attempt : 1500 * attempt;
          console.warn(`[classify] Batch ${Math.floor(i / BATCH_SIZE) + 1} attempt ${attempt} failed (${err instanceof Error ? err.message : "error"}). Retrying in ${waitMs}ms...`);
          await delay(waitMs);
        } else {
          console.error(`[classify] Batch ${Math.floor(i / BATCH_SIZE) + 1} permanently failed after ${maxAttempts} attempts:`, err);
        }
      }
    }

    if (!batchSuccess) {
      // If all retries failed, push fallback unclassified entries for this batch
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

