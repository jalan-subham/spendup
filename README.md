# 💸 SpendUp

> **A modern, privacy-focused, self-hosted personal finance & credit card reconciliation engine.**  
> Track bank accounts, parse credit card statements, categorize expenses with LLMs (via Groq), audit closing balances, and eliminate double-counting with bill settlement linking.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [What You Need to Bring (BYO Checklist)](#-what-you-need-to-bring-byo-checklist)
- [How to Host It for Yourself](#-how-to-host-it-for-yourself)
  - [Prerequisites](#prerequisites)
  - [Option 1: Vercel + Supabase (Recommended Cloud Setup)](#option-1-vercel--supabase-recommended-cloud-setup)
  - [Option 2: Docker / Docker Compose (Single-Server VPS)](#option-2-docker--docker-compose-single-server-vps)
  - [Option 3: Local Bare-Metal (Node.js)](#option-3-local-bare-metal-nodejs)
- [Environment Variables Reference](#-environment-variables-reference)
- [Understanding & Writing Parsers (Bring Your Own Bank)](#-understanding--writing-parsers-bring-your-own-bank)
  - [How Parsers Work Under the Hood](#how-parsers-work-under-the-hood)
  - [Currently Supported Parsers](#currently-supported-parsers)
  - [Step-by-Step Guide: Adding a New Bank Parser](#step-by-step-guide-adding-a-new-bank-parser)
- [First-Time App Setup & Workflow](#-first-time-app-setup--workflow)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Data Security & Privacy](#-data-security--privacy)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🌟 Overview

Managing personal finances across multiple Indian bank accounts and credit cards often leads to broken spreadsheets, duplicate transaction records (e.g., paying a credit card bill counts as an expense twice), and tedious manual categorization.

**SpendUp** solves this by offering:
1. **Direct Statement Parsing**: Upload your bank text exports, Excel transaction sheets, or password-protected credit card PDFs.
2. **Deterministic Deduplication**: Transactions are hashed based on date, type, amount, balance, and canonical narration—preventing duplicate imports even when re-uploading overlapping statements.
3. **AI-Powered Categorization**: Batch-classifies transactions in seconds using high-throughput LLMs via Groq (with sensible defaults for Indian merchants, UPI handles, and spending categories).
4. **Credit Card Bill Linking & Anti-Double-Counting**: Matches credit card debit payments from savings accounts with credit card billing cycles so your net spend is never duplicated.
5. **Sanity Verification Engine**: Automatically detects sign discrepancies (credits marked as spend, debits marked as income) and provides one-click batch repairs.
6. **Encrypted File Vault**: Stores the original uploaded statement files directly in your database so you can retrieve or download past statements anytime.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **Multi-Bank & Multi-Card** | Manage Savings accounts, Debit Cards, Credit Cards, and UPI handles under custom banks with color-coding. |
| **Statement Ingestion** | Support for fixed-width text statements (HDFC), Excel sheets (ICICI), and password-encrypted PDFs (Axis, HDFC Swiggy). |
| **Groq AI Categorizer** | High-speed LLM classification using models such as `openai/gpt-oss-120b` or `llama-3.3-70b-versatile` with customizable prompt heuristics. |
| **Split Tracker** | Track Splitwise-shared expenses directly against imported transactions (`to_split`, `splitwise_logged`, `settled`). |
| **Balance Snapshots** | Maintain closing balance checkpoints over time to ensure database transaction balances match actual bank balances. |
| **Sanity Engine** | Audits credit/debit sign rules, catching categorization errors with one-click resolution. |
| **Secure Auth** | Multi-user support with bcrypt password hashing and HTTP-only JWT session cookies. |

---

## 🎒 What You Need to Bring (BYO Checklist)

Before self-hosting SpendUp, here is what you need to prepare:

### 1. PostgreSQL Database
- **Provider**: [Supabase](https://supabase.com/) (recommended, free tier works great), [Neon](https://neon.tech/), [Railway](https://railway.app/), AWS RDS, or a self-hosted Docker PostgreSQL instance.
- **Connection Strings**:
  - `DATABASE_URL`: Connection string for runtime queries (if using Supabase, use the pooled connection on port `6543` with `?pgbouncer=true`).
  - `DIRECT_URL`: Direct unpooled connection string on port `5432` for running Prisma migrations. *(If hosting standard local Postgres, both URLs can be identical).*

### 2. Groq Cloud API Key
- **Sign Up**: Get a free API key at [console.groq.com](https://console.groq.com/).
- **Why Groq?**: Groq provides ultra-fast LLM inference (hundreds of tokens/sec), allowing SpendUp to categorize 50–100 transactions in under 2 seconds.
- **Model Choice**: By default, `openai/gpt-oss-120b` or `llama-3.3-70b-versatile` work out-of-the-box.

### 3. Application Secret (`JWT_SECRET`)
- A secure, random 32+ character string used to sign session cookies.
- Generate one via terminal:
  ```bash
  openssl rand -base64 32
  ```

### 4. Bank Statements & Statement Passwords
- Your downloaded bank account statements (`.txt`, `.xls`, `.xlsx`) or credit card statements (`.pdf`).
- If your bank encrypts PDF statements, you will need your statement password when uploading (common formats):
  - **Axis Bank**: First 4 letters of your name in CAPS + DDMM of birth date.
  - **HDFC Bank**: First 4 letters of your name in lowercase + DDMM of birth date (or PAN number in uppercase).
  - **ICICI Bank**: First 4 letters of name in lowercase + DDMM of birth date.

### 5. Custom Parsers (If Your Bank Is Not Yet Built-In)
- If you use banks or credit cards other than HDFC, ICICI, or Axis CC, you will need to bring/write a parser module. SpendUp has a modular parser architecture—see [Understanding & Writing Parsers](#-understanding--writing-parsers-bring-your-own-bank) below.

---

## 🛠️ How to Host It for Yourself

### Prerequisites

- **Node.js**: `v20.x` or later (Node 20+ required for native crypto and modern Web APIs).
- **npm** or **pnpm** installed.
- **Git** installed.

---

### Option 1: Vercel + Supabase (Recommended Cloud Setup)

This is the easiest, zero-maintenance setup for personal use.

#### Step 1: Clone Repository
```bash
git clone https://github.com/your-username/spendings.git
cd spendings
npm install
```

#### Step 2: Set Up Supabase Database
1. Create a project at [supabase.com](https://supabase.com/).
2. Navigate to **Project Settings** > **Database**.
3. Under **Connection String**:
   - Copy the **Transaction pooler** URI (port `6543`, mode `Transaction`) → this will be `DATABASE_URL`.
   - Copy the **Session pooler** or **Direct connection** URI (port `5432`) → this will be `DIRECT_URL`.

#### Step 3: Run Database Migrations Locally Once
Create `.env` locally:
```env
DATABASE_URL="postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres"
JWT_SECRET="generate-a-secure-random-32-char-string"
GROQ_API_KEY="gsk_..."
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_BATCH_SIZE="25"
```

Apply migrations to initialize the schema:
```bash
npx prisma generate
npx prisma migrate deploy
```

#### Step 4: Deploy to Vercel
1. Push your repository to GitHub or GitLab.
2. In the [Vercel Dashboard](https://vercel.com/), click **Add New Project** and import your repository.
3. In **Environment Variables**, add:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `GROQ_API_KEY`
   - `GROQ_MODEL` (optional, defaults to `openai/gpt-oss-120b`)
   - `GROQ_BATCH_SIZE` (optional, defaults to `25`)
4. Verify the **Build Command** is set to:
   ```bash
   prisma generate && prisma migrate deploy && next build
   ```
5. Click **Deploy**. Your instance of SpendUp is live!

---

### Option 2: Docker / Docker Compose (Single-Server VPS)

If you prefer self-hosting on a VPS (Hetzner, DigitalOcean, Linode, Coolify, or local homelab):

#### 1. Create `Dockerfile` in the project root:
```dockerfile
FROM node:20-alpine AS base

# Install OpenSSL for Prisma
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
```

#### 2. Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: spendup
      POSTGRES_PASSWORD: supersecretpassword
      POSTGRES_DB: spendup
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgresql://spendup:supersecretpassword@db:5432/spendup"
      DIRECT_URL: "postgresql://spendup:supersecretpassword@db:5432/spendup"
      JWT_SECRET: "replace-with-a-32-byte-hex-or-base64-random-secret"
      GROQ_API_KEY: "gsk_your_groq_api_key_here"
      GROQ_MODEL: "openai/gpt-oss-120b"
      GROQ_BATCH_SIZE: "25"
    depends_on:
      - db

volumes:
  postgres_data:
```

#### 3. Run:
```bash
docker compose up -d --build
```
Access the app at `http://localhost:3000`.

---

### Option 3: Local Bare-Metal (Node.js)

1. **Clone & Install**:
   ```bash
   git clone https://github.com/your-username/spendings.git
   cd spendings
   npm install
   ```

2. **Configure `.env`**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your PostgreSQL URLs and `GROQ_API_KEY`.

3. **Generate Prisma Client & Apply Migrations**:
   ```bash
   npm run build
   ```

4. **Start the Development or Production Server**:
   ```bash
   # Development server (with hot reload):
   npm run dev

   # Or Production server:
   npm run start
   ```
   Open `http://localhost:3000` in your browser.

---

## ⚙️ Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | — | Runtime PostgreSQL connection string. Supports connection poolers like Supavisor / PgBouncer. |
| `DIRECT_URL` | **Yes** | — | Direct unpooled PostgreSQL connection string on port `5432` for Prisma migration operations. |
| `JWT_SECRET` | **Yes** | — | Secret string used for signing authentication cookies (`spendUp_session`). Must be kept private. |
| `GROQ_API_KEY` | **Yes** | — | API key from Groq Console (`console.groq.com`) used for AI categorization. |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Groq model identifier (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`). |
| `GROQ_BATCH_SIZE` | No | `25` | Number of transactions sent per LLM inference batch. Helps stay within token rate limits. |

---

## 🧩 Understanding & Writing Parsers (Bring Your Own Bank)

One of SpendUp’s core architectural strengths is its **Modular Parser System**. Instead of tying the UI to a single bank's formatting, statements go through a standardized ingestion pipeline.

```
┌─────────────────────────────────┐
│ Uploaded File (.pdf, .xls, .txt)│
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Parser Registry Resolution    │  (Checks extension, MIME & parserId)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     Bank-Specific Parser        │  (Extracts text/cells, handles passwords)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Normalized Standard Payload   │  (Rows + Metadata + Deterministic refNo)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     Groq AI Classification      │  (Categorizes spends, detect UPI, etc.)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Database Upsert (Deduplicated) │
└─────────────────────────────────┘
```

---

### Currently Supported Parsers

| Parser ID | Bank / Card | Format | Password Protected? | Description |
| :--- | :--- | :--- | :---: | :--- |
| `hdfc_text` | HDFC Bank | `.txt`, `.text` | No | Parses fixed-width text statements downloaded from NetBanking. |
| `icici_xls` | ICICI Bank | `.xls`, `.xlsx` | No | Parses transaction histories exported in Excel format. |
| `hdfc_swiggy_cc_pdf`| HDFC Swiggy Card | `.pdf` | **Yes** | Extracts transactions from monthly HDFC Swiggy credit card PDF statements. |
| `axis_cc_pdf` | Axis Bank Cards | `.pdf` | **Yes** | Parses Axis Bank credit card PDF statements (Flipkart Axis, MY Zone, etc.) using positional text coordinates. |

---

### Step-by-Step Guide: Adding a New Bank Parser

If your bank is not yet supported, you can easily add a new parser in **3 steps**:

#### Step 1: Register Parser in `src/lib/parsers/catalog.ts`

Add your new parser to the `ParserId` union type and append an entry to `PARSER_CATALOG`:

```typescript
// 1. Update ParserId union
export type ParserId = 
  | "hdfc_text" 
  | "icici_xls" 
  | "hdfc_swiggy_cc_pdf" 
  | "axis_cc_pdf"
  | "sbi_savings_pdf"; // <-- Your new parser ID

// 2. Add catalog item
export const PARSER_CATALOG: ParserCatalogItem[] = [
  // ... existing parsers ...
  {
    id: "sbi_savings_pdf",
    label: "SBI Savings Account PDF Parser",
    description: "Parses State Bank of India savings account PDF statements.",
    supportedExtensions: [".pdf"],
    supportedMimeTypes: ["application/pdf"],
    acceptsPassword: true,
    bankKeyword: "sbi",
    statementType: "bank_account",
  },
];
```

#### Step 2: Implement the Parser Module in `src/lib/parsers/`

Create a new file, e.g., `src/lib/parsers/sbi-savings-pdf.ts`.

A parser takes a `Uint8Array` buffer (and optional password) and returns:
- `meta`: Statement metadata (`accountNo`, `startDate`, `endDate`, `openingBalance`, `closingBalance`, etc.)
- `rows`: Array of normalized transaction rows adhering to `HdfcRawRow`.

```typescript
import { createHash } from "node:crypto";
import type { HdfcRawRow, HdfcStatementMeta } from "@/lib/parsers/hdfc-text";

export interface SbiParseResult {
  success: boolean;
  meta?: HdfcStatementMeta;
  rows?: HdfcRawRow[];
  error?: string;
  passwordRequired?: boolean;
}

/**
 * Deterministic transaction hash to avoid duplicate imports
 */
function buildDeterministicRefNo(date: string, narration: string, amount: number, type: string): string {
  const cleanNarration = narration.toLowerCase().replace(/\s+/g, " ").trim();
  const fingerprint = ["sbi", date, cleanNarration, amount.toFixed(2), type].join("|");
  return `SBI-${createHash("sha1").update(fingerprint).digest("hex").slice(0, 20)}`;
}

export async function parseSbiPdf(
  buffer: Uint8Array,
  password?: string
): Promise<SbiParseResult> {
  try {
    // For PDFs: use pdfjs-dist
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: password?.trim() || undefined,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const rows: HdfcRawRow[] = [];

    // Loop through doc.numPages, parse page.getTextContent()
    // Extract: date, narration, withdrawal, deposit, closingBalance

    // Return normalized payload
    return {
      success: true,
      rows,
      meta: {
        accountNo: "SBI-XXXX",
        customerName: "Account Holder",
        startDate: "01/01/2026",
        endDate: "31/01/2026",
        openingBalance: 0,
        closingBalance: 0,
        drCount: rows.filter(r => r.withdrawal != null).length,
        crCount: rows.filter(r => r.deposit != null).length,
        totalDebits: 0,
        totalCredits: 0,
      }
    };
  } catch (error: any) {
    if (error?.name === "PasswordException") {
      return { success: false, error: "Password required or incorrect", passwordRequired: true };
    }
    return { success: false, error: error?.message || "Failed to parse SBI PDF statement" };
  }
}
```

> [!TIP]
> **For Excel files (`.xls`, `.xlsx`)**: Use the bundled `xlsx` package (see `src/lib/parsers/icici-parser.ts` for a reference implementation).  
> **For PDF coordinate extraction**: When table text is scattered, inspect `transform[4]` (x-coordinate) and `transform[5]` (y-coordinate) from `pdfjs-dist` (see `src/lib/parsers/axis-cc-pdf.ts` for an exact column-bounding example).

#### Step 3: Wire Parser into `src/lib/parsers/registry.ts`

Import your new parsing function and add a dispatch condition in `executeParserById`:

```typescript
import { parseSbiPdf } from "@/lib/parsers/sbi-savings-pdf";

export async function executeParserById(
  parserId: ParserId,
  buffer: Uint8Array,
  password?: string
): Promise<ExecuteParserResult> {
  // ... existing dispatchers ...
  if (parserId === "sbi_savings_pdf") {
    const result = await parseSbiPdf(buffer, password);
    if (!result.success || !result.rows || !result.meta) {
      return { success: false, error: result.error || "Parsing failed", passwordRequired: result.passwordRequired };
    }
    return { success: true, payload: { meta: result.meta, rows: result.rows } };
  }

  return { success: false, error: "Parser not implemented" };
}
```

That’s it! Your new parser will automatically appear in the parser selection dropdown on the **Import** page.

---

## 🚦 First-Time App Setup & Workflow

Once SpendUp is hosted and running:

1. **Register User Account**:
   - Navigate to `/register` and create your local username and password.
   - Authentication is isolated per user; each user sees only their own accounts, files, and transactions.

2. **Configure Banks & Cards**:
   - Go to **Settings** (`/settings`).
   - Click **Add Bank** to create your bank accounts (e.g. "HDFC Bank", "ICICI Bank", "Axis Bank").
   - Set the initial **Opening Balance** for each bank.
   - Add your respective cards (Debit, Credit, UPI) under each bank.

3. **Import Statements**:
   - Go to **Import** (`/transactions`).
   - Select statement type:
     - **Non-CC Bank Statement**: Imports transactions into the selected bank account and updates running balances.
     - **CC Statement**: Select your credit card and the target billing cycle.
   - Choose the matching parser and upload your statement file.
   - If the statement is password-protected, enter the password in the prompt.
   - Review the extracted transactions, run AI classification, and click **Confirm & Save Transactions**.

4. **Audit via the Sanity Engine**:
   - Open **Sanity** (`/sanity`).
   - The engine checks for direction mismatches (e.g., if an incoming credit was accidentally categorized as an expense). Use the one-click repair tool to align any flagged transactions.

5. **Track Credit Card Payments**:
   - Open **Bills & CC** (`/bills`).
   - When you pay a credit card bill from your savings account, link the payment debit transaction to the credit card bill cycle.
   - This ensures the CC bill payment is marked as `cc_settlement`, preventing duplicate expense calculation in your monthly summary!

---

## 🏛️ Architecture & Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Server Actions & Route Handlers)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) components + [Lucide Icons](https://lucide.dev/)
- **Database & ORM**: PostgreSQL + [Prisma v6](https://www.prisma.io/)
- **Document & PDF Processing**: `pdfjs-dist` (pure JavaScript PDF parsing without native binary dependencies) and `xlsx` (Excel parsing)
- **AI Classification**: [Groq SDK](https://github.com/groq/groq-typescript)
- **Authentication**: JWT session tokens signed with `jose`, stored in secure HTTP-only cookies; passwords hashed with `bcryptjs`.
- **Charts & Visualization**: [Recharts](https://recharts.org/)

---

## 🔒 Data Security & Privacy

- **Your Data Remains Yours**: When you self-host SpendUp, your financial data, account numbers, and transaction logs never touch third-party servers except for Groq inference calls.
- **Minimal AI Exposure**: During categorization, SpendUp transmits **only** transaction narration text, amounts, and dates to Groq. Account numbers, customer names, passwords, and PDF files are **never** transmitted to the LLM.
- **Zero Document Leakage**: Uploaded statement files are stored directly in your PostgreSQL database (`UserFile` table as binary data) protected by your user ID—no cloud object storage (S3) buckets required.

---

## ❓ Troubleshooting & FAQs

### Q: Why does Prisma fail with "Can't reach database server at..." on Vercel?
**A:** Ensure your `DATABASE_URL` uses the **Supavisor Transaction Pooler** (port `6543` with `?pgbouncer=true`). Serverless platforms like Vercel open hundreds of ephemeral connections, which will exhaust direct PostgreSQL connection limits unless pooled.

### Q: Why is my PDF parser failing on encrypted statements?
**A:** If your statement has a password, ensure you enter it in the password field when prompted. Common combinations in India are `FIRST4NAME_CAPS + DDMM_OF_BIRTH` or `PAN_IN_CAPS`. If your PDF has unstandardized encryption or bitmap scans, check the server console logs for `pdfjs-dist` messages.

### Q: Can I run SpendUp completely offline without Groq?
**A:** Yes! While automatic AI categorization uses Groq, you can import statements without classifying them, or adapt `src/lib/groq.ts` to connect to a local OpenAI-compatible endpoint such as [Ollama](https://ollama.ai/) or [vLLM](https://github.com/vllm-project/vllm).

---

## 📄 License

Private & Personal Use. Feel free to fork, customize, and adapt for your own self-hosted financial tracking.
