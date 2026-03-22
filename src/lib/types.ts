// ─── Bank / Card data model ─────────────────────────────────────────────────

export type CardType = "debit" | "credit" | "upi";

export interface Card {
  id: string;
  type: CardType;
  nickname: string;
  last4?: string;
  bankId?: string;
}

export interface CreditCardBill {
  id: string;
  cardId: string;
  cycleName: string;
  billAmount: number;
  dueDate?: string;
  isPaid: boolean;
}

export interface Bank {
  id: string;
  name: string;
  color: string;
  openingBalance?: number;
  cards: Card[];
}

// ─── Statement / Import model ─────────────────────────────────────────────────

export type StatementType = "bank_account" | "credit_card";

export interface StatementSource {
  bankId: string;
  cardId: string;
  statementType: StatementType;
}

// ─── Transaction model ────────────────────────────────────────────────────────

export type TransactionType = "spend" | "income" | "income_debit" | "cc_settlement" | "investment" | "transfer_in" | "transfer_out" | "refund" | "refund_settlement";

export type SplitStatus = "none" | "to_split" | "settled";

export type PaymentMethod = "UPI" | "Debit" | "Credit Card" | "Net Banking" | "Cash" | "Other";

export interface Transaction {
  id: string;
  /** The bank's own reference number — used as deduplication key */
  refNo: string;
  date: string;            // DD/MM/YY or ISO
  narration: string;
  amount: number;          // negative = debit/spend, positive = credit/income
  category?: string;
  transactionType: TransactionType;
  paymentMethod?: PaymentMethod;
  /** AI confidence 0–1 for category classification */
  confidence?: number;
  /** true if user has reviewed/confirmed this */
  annotated: boolean;
  /** Splitwise status */
  splitStatus: SplitStatus;
  /** Amount received back via Splitwise settlement */
  splitSettledAmount?: number;
  /** Source metadata */
  bankId?: string;
  cardId?: string;
  statementType?: StatementType;
  closingBalance?: number;
  linkedBillId?: string;
}

// ─── Ingestion session ────────────────────────────────────────────────────────

/** A record of one import run, stored for audit trail */
export interface IngestionSession {
  id: string;
  importedAt: string;     // ISO
  fileName: string;
  bankId: string;
  cardId: string;
  statementType: StatementType;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  transactionCount: number;
  /** refNos that already existed at import time (duplicates detected) */
  duplicatesDetected: string[];
}

// ─── Common Indian banks preset ──────────────────────────────────────────────

export const COMMON_BANKS: Omit<Bank, "id" | "cards">[] = [
  { name: "HDFC Bank", color: "#004C8F" },
  { name: "ICICI Bank", color: "#B02C2C" },
  { name: "State Bank of India", color: "#2D6A4F" },
  { name: "Axis Bank", color: "#C2185B" },
  { name: "Kotak Mahindra Bank", color: "#EF6C00" },
  { name: "Yes Bank", color: "#1565C0" },
  { name: "IndusInd Bank", color: "#6A1B9A" },
  { name: "IDFC FIRST Bank", color: "#00796B" },
  { name: "Punjab National Bank", color: "#4E342E" },
  { name: "Bank of Baroda", color: "#F57C00" },
  { name: "Federal Bank", color: "#0D47A1" },
  { name: "RBL Bank", color: "#880E4F" },
];

// ─── Category list ────────────────────────────────────────────────────────────

export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Travel",
  "Health",
  "Fuel",
  "Rent",
  "Education",
  "Subscription",
  "Groceries",
  "Investment",
  "Income",
  "Transfer",
  "CC Settlement",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
