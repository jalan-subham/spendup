"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAccounts } from "@/lib/store";
import { parseHdfcText } from "@/lib/parsers/hdfc-text";
import type { HdfcRawRow, HdfcStatementMeta } from "@/lib/parsers/hdfc-text";
import type { Transaction, StatementSource, StatementType, Category, PaymentMethod } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FileUp, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Scissors, Building2, ChevronRight, Search, RefreshCw,
  Info, AlertCircle,
} from "lucide-react";
import Link from "next/link";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(n));
}

function parseDateDDMMYY(s: string): string {
  // DD/MM/YY → YYYY-MM-DD
  const [d, m, y] = s.split("/");
  return `20${y}-${m}-${d}`;
}

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Validate" },
  { n: 3, label: "Classify" },
  { n: 4, label: "Review & Split" },
] as const;

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            s.n === current ? "bg-primary text-primary-foreground" :
            s.n < current ? "text-primary" : "text-muted-foreground"
          }`}>
            {s.n < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-4 w-4 flex items-center justify-center rounded-full border border-current text-[10px]">{s.n}</span>}
            {s.label}
          </div>
          {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1" />}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ──────────────────────────────────────────────────────────

function Step1Upload({
  banks, sources, setSources, onParsed,
}: {
  banks: ReturnType<typeof useAccounts>["banks"];
  sources: StatementSource[];
  setSources: (s: StatementSource[]) => void;
  onParsed: (meta: HdfcStatementMeta, rows: HdfcRawRow[], fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const text = await file.text();
      const { meta, rows } = parseHdfcText(text);
      if (!rows.length) throw new Error("No transactions found. Is this an HDFC text statement?");
      onParsed(meta, rows, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }, [onParsed]);

  const toggleCard = (bankId: string, cardId: string) => {
    const ex = sources.find(s => s.bankId === bankId && s.cardId === cardId);
    if (ex) setSources(sources.filter(s => !(s.bankId === bankId && s.cardId === cardId)));
    else setSources([...sources, { bankId, cardId, statementType: "bank_account" }]);
  };

  const setType = (bankId: string, cardId: string, t: StatementType) =>
    setSources(sources.map(s => s.bankId === bankId && s.cardId === cardId ? { ...s, statementType: t } : s));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Source selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">1a · Which accounts?</CardTitle>
          <CardDescription className="text-xs space-y-1">
            <p>Select which cards are covered by this file.</p>
            <p className="text-[10px] text-muted-foreground/80 bg-muted/40 p-1.5 rounded border border-border/50">
              <strong>Tip:</strong> Select <strong>CC Stmt</strong> if this is a credit card bill (contains actual CC spends). Select <strong>Bank Stmt</strong> for bank accounts (contains CC Settlements / bill payments).
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {banks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
              <Building2 className="h-6 w-6 opacity-30" />
              <p className="text-xs">No banks configured.</p>
              <Link href="/settings" className="inline-flex items-center rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors">Go to Settings →</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {banks.map(bank => (
                <div key={bank.id}>
                  <p className="text-xs font-semibold mb-1.5 flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full inline-flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: bank.color }}>{bank.name[0]}</span>
                    {bank.name}
                  </p>
                  <div className="space-y-1 ml-6">
                    {bank.cards.map(card => {
                      const sel = sources.find(s => s.bankId === bank.id && s.cardId === card.id);
                      return (
                        <div key={card.id}>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" checked={!!sel} onChange={() => toggleCard(bank.id, card.id)} className="rounded" />
                            <span className="font-medium">{card.nickname}</span>
                            {card.last4 && <span className="text-muted-foreground font-mono">•{card.last4}</span>}
                          </label>
                          {sel && (
                            <div className="ml-5 mt-1 flex gap-1.5">
                              {(["bank_account", "credit_card"] as StatementType[]).map(t => (
                                <button key={t} onClick={() => setType(bank.id, card.id, t)}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${sel.statementType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                                  {t === "bank_account" ? "Bank Stmt" : "CC Stmt"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File upload */}
      <Card className="lg:col-span-2 border-dashed border-2 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}>
        <CardContent className="flex flex-col items-center justify-center h-full min-h-[240px] text-center p-8">
          <input ref={inputRef} type="file" accept=".txt,.text" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {loading ? (
            <div className="space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm font-medium">Parsing statement…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mx-auto h-12 w-12 rounded-xl bg-primary/8 border border-primary/20 flex items-center justify-center">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Drop HDFC text statement here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse · .txt files only</p>
              </div>
              {sources.length > 0 && (
                <div className="mt-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-left inline-block">
                  <p className="text-[10px] font-semibold text-primary mb-1">Tagged as:</p>
                  {sources.map((s, i) => {
                    const b = banks.find(b => b.id === s.bankId);
                    const c = b?.cards.find(c => c.id === s.cardId);
                    return <p key={i} className="text-[10px] text-muted-foreground">{b?.name} · {c?.nickname} ({s.statementType === "bank_account" ? "Bank" : "CC"})</p>;
                  })}
                </div>
              )}
              {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
              <Button size="sm" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }} disabled={sources.length === 0}>
                {sources.length === 0 ? "Select sources first" : "Select File"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 2: Validate metadata ───────────────────────────────────────────────

function Step2Validate({ meta, rowCount, duplicates, onConfirm }: {
  meta: HdfcStatementMeta;
  rowCount: number;
  duplicates: string[];
  onConfirm: () => void;
}) {
  const expectedTotal = meta.drCount + meta.crCount;
  const countMatch = rowCount === expectedTotal;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Statement Preview</CardTitle>
          <CardDescription className="text-xs">Verify these details match your statement before classifying.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Period", value: `${meta.startDate} → ${meta.endDate}` },
              { label: "Opening Balance", value: formatINR(meta.openingBalance) },
              { label: "Closing Balance", value: formatINR(meta.closingBalance) },
              { label: "Account", value: `••••${meta.accountNo.slice(-4)}` },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-muted/40 p-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{item.label}</p>
                <p className="text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total Debits</p>
              <p className="text-sm font-semibold text-destructive">−{formatINR(meta.totalDebits)}</p>
              <p className="text-[10px] text-muted-foreground">{meta.drCount} transactions</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">Total Credits</p>
              <p className="text-sm font-semibold text-emerald-600">+{formatINR(meta.totalCredits)}</p>
              <p className="text-[10px] text-muted-foreground">{meta.crCount} transactions</p>
            </div>
            <div className={`rounded-lg border p-3 ${countMatch ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
              <p className="text-[10px] text-muted-foreground mb-0.5">Rows Parsed</p>
              <p className={`text-sm font-semibold ${countMatch ? "text-emerald-600" : "text-amber-600"}`}>{rowCount}</p>
              <p className="text-[10px] text-muted-foreground">Expected: {expectedTotal}</p>
            </div>
            <div className={`rounded-lg border p-3 ${duplicates.length === 0 ? "bg-muted/40" : "bg-amber-50 border-amber-100"}`}>
              <p className="text-[10px] text-muted-foreground mb-0.5">Duplicates</p>
              <p className={`text-sm font-semibold ${duplicates.length > 0 ? "text-amber-600" : ""}`}>{duplicates.length}</p>
              <p className="text-[10px] text-muted-foreground">{duplicates.length > 0 ? "Will be skipped" : "None found"}</p>
            </div>
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-700">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Duplicate transactions detected</p>
              <p className="mt-1">These ref numbers already exist and will be skipped: {duplicates.slice(0, 3).join(", ")}{duplicates.length > 3 ? ` +${duplicates.length - 3} more` : ""}</p>
            </div>
          )}

          {!countMatch && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
              Row count mismatch — some transactions may have wrapped oddly. You can still proceed; review them in step 4.
            </div>
          )}

          <Button onClick={onConfirm} className="gap-2">
            Looks good — Classify with AI <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 3: Classify (progress) ─────────────────────────────────────────────

function Step3Classify({ progress, total, current }: { progress: number; total: number; current: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-5">
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Classifying transactions with AI…</p>
          <p className="text-xs text-muted-foreground mt-1">{current}</p>
        </div>
        <div className="w-64 space-y-1.5">
          <Progress value={(progress / total) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{progress} / {total} rows</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Review & Annotate ───────────────────────────────────────────────

const TX_TYPE_COLORS: Record<string, string> = {
  spend: "text-foreground",
  income: "text-emerald-600",
  cc_settlement: "text-amber-600",
  investment: "text-violet-600",
  transfer: "text-blue-600",
  refund: "text-emerald-500",
};

const TX_TYPE_LABELS: Record<string, string> = {
  spend: "Spend",
  income: "Income",
  income_debit: "Income Debit",
  cc_settlement: "CC Settle",
  investment: "Invest",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  refund: "Refund",
  refund_settlement: "Refund Settle",
};

function Step4Review({ transactions, bills, banks, onUpdate, onNext }: {
  transactions: Transaction[];
  bills: any[];
  banks: ReturnType<typeof useAccounts>["banks"];
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onNext: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAnnotated, setFilterAnnotated] = useState<string>("all");

  const unannotated = transactions.filter(t => !t.annotated).length;
  const lowConf = transactions.filter(t => (t.confidence ?? 1) < 0.75 && !t.annotated).length;

  const filtered = transactions.filter(t => {
    if (search && !t.narration.toLowerCase().includes(search.toLowerCase()) && !(t.category ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== "all" && t.transactionType !== filterType) return false;
    if (filterAnnotated === "unannotated" && t.annotated) return false;
    if (filterAnnotated === "low_conf" && ((t.confidence ?? 1) >= 0.75 || t.annotated)) return false;
    return true;
  });

  // Totals (Neutral labeling during import before confirm)
  const totalOutgoing = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncoming = transactions.filter(t => t.amount >= 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalCC = transactions.filter(t => t.transactionType === "cc_settlement").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalInvest = transactions.filter(t => t.transactionType === "investment").reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-4">
      <Card className="border-dashed border-primary/30 bg-primary/3">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Mark expenses you plan to split on Splitwise. When you receive the settlement payment,
            SpendUp will match it and reduce your net spend for that transaction automatically.
          </p>
        </CardContent>
      </Card>

      {/* Summary totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Outgoing", value: totalOutgoing, color: "text-foreground", icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
          { label: "Incoming", value: totalIncoming, color: "text-emerald-600", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
          { label: "CC Payments", value: totalCC, color: "text-amber-600", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
          { label: "Investments", value: totalInvest, color: "text-violet-600", icon: <RefreshCw className="h-3.5 w-3.5" /> },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className={item.color}>{item.icon}</span>
              </div>
              <p className={`text-lg font-semibold ${item.color}`}>{formatINR(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Review Transactions</CardTitle>
              <CardDescription className="text-xs">
                {unannotated > 0 ? <span className="text-amber-600 font-medium">{unannotated} unannotated</span> : <span className="text-emerald-600 font-medium">All annotated ✓</span>}
                {lowConf > 0 && <span className="ml-2 text-amber-500">· {lowConf} need review</span>}
              </CardDescription>
            </div>
            <Button onClick={onNext} disabled={unannotated > 0} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> Save to Ledger
            </Button>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-8 w-48 text-xs" />
            </div>
            <Select value={filterType} onValueChange={(v) => v && setFilterType(v)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAnnotated} onValueChange={(v) => v && setFilterAnnotated(v)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unannotated">Unannotated</SelectItem>
                <SelectItem value="low_conf">Low confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-y">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Narration</TableHead>
                <TableHead className="text-xs">Source Card</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Conf.</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-center pr-5">Split?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(tx => {
                const needsReview = (tx.confidence ?? 1) < 0.75 && !tx.annotated;
                return (
                  <TableRow key={tx.id} className={needsReview ? "bg-amber-50/40" : ""}>
                    <TableCell className="pl-5 text-xs font-mono text-muted-foreground whitespace-nowrap">{tx.date}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <p className="text-xs font-medium truncate">{tx.narration}</p>
                      {tx.refNo && <p className="text-[10px] text-muted-foreground font-mono">{tx.refNo}</p>}
                    </TableCell>
                    <TableCell>
                      <Select value={tx.cardId ?? "none"} onValueChange={v => v && onUpdate(tx.id, { cardId: v === "none" ? undefined : v, annotated: true })}>
                        <SelectTrigger className="h-7 w-24 text-[10px] border-none shadow-none bg-muted/40 hover:bg-muted">
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[10px]">Unknown Source</SelectItem>
                          {banks.find(b => b.id === tx.bankId)?.cards.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-[10px]">{c.nickname}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Select value={tx.transactionType} onValueChange={v => v && onUpdate(tx.id, { transactionType: v as Transaction["transactionType"], annotated: true })}>
                          <SelectTrigger className="h-7 w-28 text-[10px] border-none shadow-none bg-muted/40 hover:bg-muted flex-shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-[10px]">{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {tx.transactionType === "cc_settlement" && (
                          <Select value={(tx.linkedBillId || "none") as string} onValueChange={v => onUpdate(tx.id, { linkedBillId: v === "none" ? undefined : v, annotated: true })}>
                            <SelectTrigger className="h-6 w-28 text-[9px] bg-amber-50 text-amber-900 border-amber-200">
                              <SelectValue placeholder="Link Bill..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-[9px]">Not linked</SelectItem>
                              {bills.map(b => (
                                <SelectItem key={b.id} value={b.id} className="text-[9px]">{b.cycleName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={tx.category ?? "Other"} onValueChange={v => v && onUpdate(tx.id, { category: v as Category, annotated: true })}>
                        <SelectTrigger className="h-7 w-28 text-[10px] border-none shadow-none bg-muted/40 hover:bg-muted">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {tx.confidence != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${tx.confidence * 100}%`, backgroundColor: tx.confidence >= 0.75 ? "hsl(var(--primary))" : "#f59e0b" }} />
                          </div>
                          <span className={`text-[10px] ${tx.confidence < 0.75 ? "text-amber-500" : "text-muted-foreground"}`}>{Math.round(tx.confidence * 100)}%</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-xs text-right tabular-nums ${tx.amount >= 0 ? "text-emerald-600 p-0" : "text-foreground"} ${tx.splitStatus === "to_split" ? "font-bold text-violet-700 font-mono" : "font-medium"}`}>
                      {tx.amount >= 0 ? "+" : "−"}{formatINR(tx.amount)}
                    </TableCell>
                    <TableCell className="text-center pr-5">
                      {tx.transactionType === "spend" ? (
                        <button
                          onClick={() => onUpdate(tx.id, { splitStatus: tx.splitStatus === "to_split" ? "none" : "to_split" })}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            tx.splitStatus === "to_split"
                              ? "bg-violet-600 text-white border-violet-600"
                              : "border-border text-muted-foreground hover:border-violet-400 hover:text-violet-600"
                          }`}
                        >
                          <Scissors className="h-3 w-3" />
                          {tx.splitStatus === "to_split" ? "To Split" : "Split"}
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-16 text-center text-xs text-muted-foreground">No matching transactions</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { banks, loaded } = useAccounts();
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<StatementSource[]>([]);

  // Parse results
  const [meta, setMeta] = useState<HdfcStatementMeta | null>(null);
  const [rawRows, setRawRows] = useState<HdfcRawRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);

  // Classified transactions
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [classifyTotal, setClassifyTotal] = useState(0);
  const [classifyLabel, setClassifyLabel] = useState("");

  const [saved, setSaved] = useState(false);

  // Load existing refNos for dedup check (from DB)
  const getExistingRefNos = async (): Promise<Set<string>> => {
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) return new Set();
      const txs: Transaction[] = await res.json();
      return new Set(txs.map((t: Transaction) => t.refNo).filter(Boolean));
    } catch { return new Set(); }
  };

  async function saveTransactions(txs: Transaction[]) {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: txs }),
    });
    if (!res.ok) throw new Error("Failed to persist transactions");
    return res.json();
  }

  const handleParsed = async (m: HdfcStatementMeta, rows: HdfcRawRow[], name: string) => {
    setMeta(m);
    setRawRows(rows);
    setFileName(name);

    // Dedup check against DB
    const existing = await getExistingRefNos();
    const dups = rows.filter(r => r.refNo && existing.has(r.refNo)).map(r => r.refNo);
    setDuplicates(dups);

    setStep(2);
  };

  const handleValidated = async () => {
    setStep(3);
    const deduped = rawRows.filter(r => !duplicates.includes(r.refNo));
    setClassifyTotal(deduped.length);
    setClassifyProgress(0);
    setClassifyLabel("Starting classification…");

    try {
      // Call API in a single request (batching is handled server-side)
      setClassifyLabel(`Sending ${deduped.length} rows to AI…`);
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: deduped }),
      });
      const data = await res.json();
      setClassifyProgress(deduped.length);

      if (!res.ok) throw new Error(data.error ?? "Classification failed");

      const classified: { refNo: string; transactionType: string; category: string; paymentMethod?: string; confidence: number; notes?: string }[] = data.classified;

      // Merge parsed rows with classification
      const classMap = new Map(classified.map(c => [c.refNo, c]));

      const source = sources[0];
      const txs: Transaction[] = deduped.map((row, idx) => {
        const cls = classMap.get(row.refNo);
        const inferredPayment = (cls?.paymentMethod ?? "").toLowerCase();
        const validCards = banks.find(b => b.id === source?.bankId)?.cards || [];
        
        let aiCardId = source?.cardId;
        if (source?.statementType === "bank_account" && inferredPayment) {
          // Attempt to find a card matching "upi" or "debit"
          const match = validCards.find(c => c.type === inferredPayment.split(" ")[0] || c.nickname.toLowerCase().includes(inferredPayment));
          if (match) aiCardId = match.id;
        }

        const isDebit = row.withdrawal != null;
        const amt = isDebit ? -(row.withdrawal ?? 0) : (row.deposit ?? 0);
        return {
          id: `${row.refNo || idx}-${Date.now()}`,
          refNo: row.refNo,
          date: row.date,
          narration: row.narration,
          amount: amt,
          category: cls?.category as Category ?? "Other",
          paymentMethod: (cls?.paymentMethod ?? "Other") as PaymentMethod,
          transactionType: (cls?.transactionType ?? (isDebit ? "spend" : "income")) as Transaction["transactionType"],
          confidence: cls?.confidence,
          annotated: (cls?.confidence ?? 0) >= 0.75,
          splitStatus: "none",
          bankId: source?.bankId,
          cardId: source?.cardId,
          statementType: source?.statementType,
          closingBalance: row.closingBalance,
        };
      });

      setTransactions(txs);
      setStep(4);
    } catch (e) {
      alert("Classification error: " + (e instanceof Error ? e.message : String(e)));
      setStep(2);
    }
  };

  const updateTx = (id: string, patch: Partial<Transaction>) =>
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));

  const handleConfirm = async () => {
    try {
      await saveTransactions(transactions);
      setSaved(true);
    } catch (e) {
      alert("Save failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setStep(1);
    setMeta(null);
    setRawRows([]);
    setTransactions([]);
    setSources([]);
    setClassifyProgress(0);
    setDuplicates([]);
  };

  const [bills, setBills] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/bills").then(r => r.json()).then(setBills).catch(() => {});
  }, []);

  if (!loaded) return null;

  return (
    <div className="p-8 space-y-6 max-w-[1300px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">ETL Pipeline</p>
        <h1 className="text-2xl font-semibold tracking-tight">Import Statement</h1>
      </div>

      {saved && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <div>
            <p className="text-sm font-semibold">Transactions saved!</p>
            <p className="text-xs">They are now available in your <Link href="/" className="underline">dashboard</Link>.</p>
          </div>
        </div>
      )}

      <StepBar current={step} />

      {step === 1 && <Step1Upload banks={banks} sources={sources} setSources={setSources} onParsed={handleParsed} />}
      {step === 2 && meta && (
        <Step2Validate
          meta={meta}
          rowCount={rawRows.filter(r => !duplicates.includes(r.refNo)).length}
          duplicates={duplicates}
          onConfirm={handleValidated}
        />
      )}
      {step === 3 && <Step3Classify progress={classifyProgress} total={classifyTotal} current={classifyLabel} />}
      {step === 4 && <Step4Review bills={bills} banks={banks} transactions={transactions} onUpdate={updateTx} onNext={handleConfirm} />}
    </div>
  );
}
