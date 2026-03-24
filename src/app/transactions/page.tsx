"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAccounts } from "@/lib/store";
import type { HdfcRawRow, HdfcStatementMeta } from "@/lib/parsers/hdfc-text";
import type { Transaction, StatementSource, StatementType, Category, PaymentMethod } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { PARSER_CATALOG, type ParserId } from "@/lib/parsers/catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileUp, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Scissors, Building2, ChevronRight, Search, RefreshCw,
  Info, AlertCircle, Lock, CreditCard, Landmark
} from "lucide-react";
import Link from "next/link";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(n));
}

function isNarrationUnclearForPurpose(narration: string) {
  const text = narration.toLowerCase().trim();
  if (!text) return true;

  const merchantSignals = [
    "uber", "ola", "rapido", "metro", "bus", "cab", "auto", "taxi", "irctc",
    "swiggy", "zomato", "blinkit", "zepto", "amazon", "flipkart", "myntra",
  ];

  if (merchantSignals.some((token) => text.includes(token))) return false;

  // Treat narration as unclear if it mostly contains rails/ID tokens and lacks merchant meaning.
  const genericRailPattern = /\b(upi|trf|transfer|txn|ref|utr|vpa|pay|payment|collect|dr|debit|imps|neft|rtgs)\b/g;
  const genericMatches = text.match(genericRailPattern) ?? [];
  const alphaTokens = text.split(/[^a-z]+/).filter(Boolean);

  if (alphaTokens.length <= 2) return true;
  return genericMatches.length >= Math.ceil(alphaTokens.length / 2);
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

type BillLite = {
  id: string;
  cardId: string;
  cycleName: string;
  transactions?: Array<{ statementType?: string | null }>;
};

function Step1Upload({
  banks,
  bills,
  sources,
  setSources,
  parserId,
  setParserId,
  uploadKind,
  setUploadKind,
  selectedCcBillId,
  setSelectedCcBillId,
  onParsed,
}: {
  banks: ReturnType<typeof useAccounts>["banks"];
  bills: BillLite[];
  sources: StatementSource[];
  setSources: (s: StatementSource[]) => void;
  parserId: ParserId | "";
  setParserId: (id: ParserId) => void;
  uploadKind: "" | "cc" | "non_cc";
  setUploadKind: (k: "" | "cc" | "non_cc") => void;
  selectedCcBillId: string;
  setSelectedCcBillId: (id: string) => void;
  onParsed: (meta: HdfcStatementMeta, rows: HdfcRawRow[], fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [ccBankId, setCcBankId] = useState("");
  const [ccCardId, setCcCardId] = useState("");
  const [nonCcBankId, setNonCcBankId] = useState("");

  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const selectedNonCcBank = banks.find((bank) => bank.id === nonCcBankId);
  const selectedCcBank = banks.find((bank) => bank.id === ccBankId);
  const ccCards = (selectedCcBank?.cards ?? []).filter((card) => card.type === "credit");
  const nonCcCards = (selectedNonCcBank?.cards ?? []).filter((card) => card.type !== "credit");

  const billsForCard = bills.filter((bill) => bill.cardId === ccCardId);
  const availableCycles = billsForCard.filter(
    (bill) => !(bill.transactions ?? []).some((tx) => tx.statementType === "credit_card")
  );

  useEffect(() => {
    setSources([]);
    setSelectedCcBillId("");
    setError("");
  }, [uploadKind, setSelectedCcBillId, setSources]);

  useEffect(() => {
    if (uploadKind !== "cc") return;
    if (!ccBankId || !ccCardId) {
      setSources([]);
      return;
    }
    setSources([{ bankId: ccBankId, cardId: ccCardId, statementType: "credit_card" }]);
  }, [uploadKind, ccBankId, ccCardId, setSources]);

  useEffect(() => {
    if (uploadKind !== "non_cc") return;
    if (!nonCcBankId) {
      setSources([]);
      return;
    }
    const bank = banks.find((b) => b.id === nonCcBankId);
    if (!bank) {
      setSources([]);
      return;
    }
    const mapped = bank.cards
      .filter((card) => card.type !== "credit")
      .map((card) => ({ bankId: bank.id, cardId: card.id, statementType: "bank_account" as StatementType }));
    setSources(mapped);
  }, [uploadKind, nonCcBankId, banks, setSources]);

  // Clear stale validation/parsing errors when parser changes.
  useEffect(() => {
    setError("");
    setRequiresPassword(false);
    setCurrentFile(null);
    setPassword("");
  }, [parserId]);

  const handleFile = useCallback(async (file: File, pass?: string) => {
    if (!parserId) {
      setError("Select a parser before uploading a statement.");
      return;
    }

    if (!uploadKind) {
      setError("Select what you want to upload first: CC statement or non-CC bank statement.");
      return;
    }

    if (uploadKind === "cc" && !selectedCcBillId) {
      setError("Select a billing cycle before uploading a CC statement.");
      return;
    }

    if (uploadKind === "non_cc" && sources.length === 0) {
      setError("Select a bank with at least one non-CC source before uploading.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("parserId", parserId);
      if (pass) formData.append("password", pass);

      const res = await fetch("/api/upload-statement", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 401 && result.passwordRequired) {
          setRequiresPassword(true);
          setCurrentFile(file);
          throw new Error("This statement is password protected. Enter password to continue.");
        }
        throw new Error(result.error || "Failed to parse statement");
      }

      const rows = (result.rows || []) as HdfcRawRow[];
      const meta = result.meta as HdfcStatementMeta | undefined;
      if (!rows.length) throw new Error("No transactions found for selected parser.");
      if (!meta) throw new Error("Parser did not return statement metadata.");

      onParsed(meta, rows, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }, [onParsed, parserId, selectedCcBillId, sources.length, uploadKind]);

  const canSelectFile =
    !!parserId &&
    !!uploadKind &&
    sources.length > 0 &&
    (uploadKind !== "cc" || !!selectedCcBillId);

  const activeParser = PARSER_CATALOG.find((parser) => parser.id === parserId);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Source selection */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">1 · Import Type & Source</CardTitle>
          <CardDescription className="text-xs space-y-1">
            <p>Start by selecting what you are uploading, then map it correctly.</p>
            <p className="text-[10px] text-muted-foreground/90 bg-muted/50 p-1.5 rounded border border-border/50">
              <strong>Rule:</strong> One billing cycle maps to one CC statement import.
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
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={uploadKind === "cc" ? "default" : "outline"}
                  className="h-10 text-xs gap-1.5"
                  onClick={() => {
                    setUploadKind("cc");
                    setNonCcBankId("");
                  }}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  CC Statement
                </Button>
                <Button
                  type="button"
                  variant={uploadKind === "non_cc" ? "default" : "outline"}
                  className="h-10 text-xs gap-1.5"
                  onClick={() => {
                    setUploadKind("non_cc");
                    setCcBankId("");
                    setCcCardId("");
                  }}
                >
                  <Landmark className="h-3.5 w-3.5" />
                  Non-CC Bank Statement
                </Button>
              </div>

              {uploadKind === "cc" && (
                <div className="space-y-3 rounded-lg border bg-gradient-to-b from-background to-muted/20 p-3">
                  <p className="text-[11px] font-semibold text-foreground">CC Flow</p>
                  <p className="text-[10px] text-muted-foreground -mt-2">Select bank, credit card, then billing cycle.</p>
                  <Select value={ccBankId} onValueChange={(value) => { setCcBankId(value ?? ""); setCcCardId(""); setSelectedCcBillId(""); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select bank">
                        {selectedCcBank?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {banks.filter((bank) => bank.cards.some((card) => card.type === "credit")).map((bank) => (
                        <SelectItem key={bank.id} value={bank.id} className="text-xs">{bank.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={ccCardId} onValueChange={(value) => { setCcCardId(value ?? ""); setSelectedCcBillId(""); }}>
                    <SelectTrigger className="h-8 text-xs" disabled={!ccBankId}>
                      <SelectValue placeholder="Select credit card">
                        {ccCards.find((card) => card.id === ccCardId)?.nickname}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ccCards.map((card) => (
                        <SelectItem key={card.id} value={card.id} className="text-xs">
                          {card.nickname} {card.last4 ? `(•${card.last4})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedCcBillId} onValueChange={(value) => setSelectedCcBillId(value ?? "")}>
                    <SelectTrigger className="h-8 text-xs" disabled={!ccCardId}>
                      <SelectValue placeholder="Link billing cycle">
                        {availableCycles.find((bill) => bill.id === selectedCcBillId)?.cycleName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableCycles.map((bill) => (
                        <SelectItem key={bill.id} value={bill.id} className="text-xs">
                          {bill.cycleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {ccCardId && availableCycles.length === 0 && (
                    <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      No free billing cycle found for this card. Create a new cycle in Bills and retry.
                    </p>
                  )}
                </div>
              )}

              {uploadKind === "non_cc" && (
                <div className="space-y-3 rounded-lg border bg-gradient-to-b from-background to-muted/20 p-3">
                  <p className="text-[11px] font-semibold text-foreground">Non-CC Flow</p>
                  <p className="text-[10px] text-muted-foreground -mt-2">Choose one bank. All debit/UPI sources for it are included.</p>
                  <Select value={nonCcBankId} onValueChange={(value) => setNonCcBankId(value ?? "")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select bank">
                        {selectedNonCcBank?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {banks.filter((bank) => bank.cards.some((card) => card.type !== "credit")).map((bank) => (
                        <SelectItem key={bank.id} value={bank.id} className="text-xs">{bank.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {nonCcBankId && (
                    <div className="rounded-lg bg-muted/40 p-2.5 border">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">Included sources</p>
                      {nonCcCards.length === 0 ? (
                        <p className="text-[10px] text-amber-600">No non-CC sources configured for this bank.</p>
                      ) : (
                        nonCcCards.map((card) => (
                          <p key={card.id} className="text-[10px] text-muted-foreground leading-5">
                            {card.nickname} {card.last4 ? `•${card.last4}` : ""}
                          </p>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File upload */}
      <Card className="lg:col-span-3 border-dashed border-2 hover:bg-muted/20 transition-colors"
        onClick={() => !requiresPassword && canSelectFile && inputRef.current?.click()}>
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] items-start">
            <div className="space-y-4">
              <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <p className="text-left text-xs font-semibold text-muted-foreground mb-1">Parser</p>
                <Select value={parserId} onValueChange={(v) => v && setParserId(v as ParserId)}>
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue placeholder="Choose parser">
                      {activeParser?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PARSER_CATALOG.map((parser) => (
                      <SelectItem key={parser.id} value={parser.id} className="text-xs">
                        {parser.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeParser && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 text-left">
                    Selected: <span className="font-medium text-foreground">{activeParser.label}</span> · Supports {activeParser.supportedExtensions.join(", ")}
                  </p>
                )}
              </div>

              {requiresPassword ? (
                <div className="space-y-4 w-full max-w-sm animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="bg-amber-50 dark:bg-amber-950/40 p-5 rounded-xl border border-amber-200 text-left">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2 mb-3">
                      <Lock className="w-4 h-4" /> Password Required
                    </p>
                    <Input type="password" placeholder="e.g. SUBH0710" value={password} onChange={e => setPassword(e.target.value)} className="bg-white dark:bg-black" />
                    <Button className="w-full mt-4" onClick={() => handleFile(currentFile!, password)}>Unlock & Parse PDF</Button>
                    <Button variant="ghost" className="w-full mt-1 text-xs" onClick={() => { setRequiresPassword(false); setCurrentFile(null); }}>Cancel</Button>
                  </div>
                  {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
                </div>
              ) : (
                <div className="rounded-xl border bg-background p-5 text-left">
                  <p className="text-xs font-semibold text-foreground mb-2">Ready-To-Import Summary</p>
                  <p className="text-[11px] text-muted-foreground">Flow: <span className="text-foreground font-medium">{uploadKind === "cc" ? "CC Statement" : uploadKind === "non_cc" ? "Non-CC Bank Statement" : "Not selected"}</span></p>
                  <p className="text-[11px] text-muted-foreground mt-1">Sources: <span className="text-foreground font-medium">{sources.length}</span></p>
                  {uploadKind === "cc" && (
                    <p className="text-[11px] text-muted-foreground mt-1">Billing cycle: <span className="text-foreground font-medium">{selectedCcBillId ? (availableCycles.find((bill) => bill.id === selectedCcBillId)?.cycleName || "Linked") : "Not selected"}</span></p>
                  )}
                  {sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1">
                      {sources.map((s, i) => {
                        const b = banks.find((bank) => bank.id === s.bankId);
                        const c = b?.cards.find((card) => card.id === s.cardId);
                        return (
                          <p key={i} className="text-[10px] text-muted-foreground leading-5">
                            {b?.name} · {c?.nickname} ({s.statementType === "bank_account" ? "Bank" : "CC"})
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-dashed bg-muted/20 p-6 md:p-8 text-center flex flex-col items-center justify-center min-h-[300px] cursor-pointer"
              onClick={() => !requiresPassword && canSelectFile && inputRef.current?.click()}>
              <input ref={inputRef} type="file" accept=".txt,.text,.xls,.xlsx" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {loading ? (
                <div className="space-y-3">
                  <Loader2 className="h-9 w-9 animate-spin mx-auto text-primary" />
                  <p className="text-sm font-medium">Parsing statement…</p>
                </div>
              ) : (
                <>
                  <div className="mx-auto h-12 w-12 rounded-xl bg-primary/8 border border-primary/20 flex items-center justify-center">
                    <FileUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="mt-3">
                    <p className="text-base font-semibold">Drop statement file here</p>
                    <p className="text-xs text-muted-foreground mt-1">Parser and source mapping are now selected on the left.</p>
                  </div>
                  <Button size="sm" className="mt-4" onClick={e => {
                    e.stopPropagation();
                    if (inputRef.current) {
                      // Allow selecting the same file again after a failed attempt.
                      inputRef.current.value = "";
                      inputRef.current.click();
                    }
                  }} disabled={!canSelectFile}>
                    {!uploadKind ? "Select upload type first" : sources.length === 0 ? "Select sources first" : !parserId ? "Select parser first" : uploadKind === "cc" && !selectedCcBillId ? "Select billing cycle" : "Select File"}
                  </Button>
                  {error && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 2: Validate metadata ───────────────────────────────────────────────

const CLASSIFICATION_METAS = [
  {
    id: "transport_upi_150_250",
    label: "Transport Meta",
    hint: "UPI transactions in the INR 150-250 range with unclear narration/purpose are likely Transport.",
  },
] as const;

function Step2Validate({ meta, rowCount, duplicates, selectedMetaIds, onToggleMeta, onConfirm }: {
  meta: HdfcStatementMeta;
  rowCount: number;
  duplicates: string[];
  selectedMetaIds: string[];
  onToggleMeta: (metaId: string) => void;
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

          <div className="rounded-lg border bg-muted/25 p-3 mb-4">
            <p className="text-xs font-semibold mb-2">Classification Metas (optional)</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Selected metas are injected into the AI classifier prompt for this import.
            </p>
            <div className="space-y-2">
              {CLASSIFICATION_METAS.map((metaItem) => {
                const selected = selectedMetaIds.includes(metaItem.id);
                return (
                  <button
                    key={metaItem.id}
                    type="button"
                    onClick={() => onToggleMeta(metaItem.id)}
                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/40"}`}
                  >
                    <p className="text-xs font-medium">{metaItem.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{metaItem.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

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

const SPLIT_STATUS_LABELS: Record<NonNullable<Transaction["splitStatus"]>, string> = {
  none: "Not Split",
  to_split: "To Split",
  splitwise_logged: "On Splitwise",
  settled: "Cleared",
};

function Step4Review({ transactions, bills, banks, onUpdate, onBillCreated, onNext }: {
  transactions: Transaction[];
  bills: any[];
  banks: ReturnType<typeof useAccounts>["banks"];
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onBillCreated: (bill: any) => void;
  onNext: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAnnotated, setFilterAnnotated] = useState<string>("all");

  const [isCreateBillDialogOpen, setIsCreateBillDialogOpen] = useState(false);
  const [targetTxId, setTargetTxId] = useState<string>("");
  const [newBillCardId, setNewBillCardId] = useState("");
  const [newBillCycleName, setNewBillCycleName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillError, setNewBillError] = useState("");
  const [isCreatingBill, setIsCreatingBill] = useState(false);

  const creditCards = banks
    .flatMap((b) => b.cards.filter((c) => c.type === "credit").map((c) => ({ ...c, bankName: b.name })))
    .sort((a, b) => `${a.bankName}-${a.nickname}`.localeCompare(`${b.bankName}-${b.nickname}`));

  const openCreateBillDialog = (tx: Transaction) => {
    setTargetTxId(tx.id);
    setNewBillCardId(tx.cardId ?? "");
    setNewBillCycleName("");
    setNewBillAmount(Math.abs(tx.amount).toString());
    setNewBillError("");
    setIsCreateBillDialogOpen(true);
  };

  const createBillFromClassification = async () => {
    if (!newBillCardId || !newBillCycleName || !newBillAmount) {
      setNewBillError("Credit card, cycle name, and bill amount are required.");
      return;
    }

    setNewBillError("");
    setIsCreatingBill(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: newBillCardId,
          cycleName: newBillCycleName,
          billAmount: parseFloat(newBillAmount) || 0,
        }),
      });

      const bill = await res.json();
      if (!res.ok) {
        setNewBillError(bill.error || "Failed to create billing cycle.");
        return;
      }

      onBillCreated(bill);
      if (targetTxId) {
        onUpdate(targetTxId, { linkedBillId: bill.id, annotated: true });
      }
      setIsCreateBillDialogOpen(false);
    } catch {
      setNewBillError("An unexpected error occurred while creating the billing cycle.");
    } finally {
      setIsCreatingBill(false);
    }
  };

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
                      {tx.statementType === "credit_card" ? (
                        <div className="h-7 px-2 py-1 flex items-center text-[10px] font-medium text-muted-foreground bg-muted/40 rounded border border-transparent whitespace-nowrap">
                          {banks.find(b => b.id === tx.bankId)?.cards.find(c => c.id === tx.cardId)?.nickname || "Credit Card"}
                        </div>
                      ) : (
                        <Select value={tx.cardId ?? "none"} onValueChange={v => v && onUpdate(tx.id, { cardId: v === "none" ? undefined : v, annotated: true })}>
                          <SelectTrigger className="h-7 w-24 text-[10px] border-none shadow-none bg-muted/40 hover:bg-muted">
                            <SelectValue>
                              {tx.cardId && tx.cardId !== "none" 
                                ? banks.find(b => b.id === tx.bankId)?.cards.find(c => c.id === tx.cardId)?.nickname || "Unknown"
                                : "Unknown Source"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-[10px]">Unknown Source</SelectItem>
                            {banks.find(b => b.id === tx.bankId)?.cards.filter(c => c.type !== "credit").map(c => (
                              <SelectItem key={c.id} value={c.id} className="text-[10px]">
                                {c.nickname} {c.last4 && `(•${c.last4})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
                          <div className="flex items-center gap-1.5">
                            <Select value={(tx.linkedBillId || "none") as string} onValueChange={v => v && onUpdate(tx.id, { linkedBillId: v === "none" ? undefined : v, annotated: true })}>
                              <SelectTrigger className="h-6 w-28 text-[9px] bg-amber-50 text-amber-900 border-amber-200">
                                <SelectValue placeholder="Link Bill...">
                                  {tx.linkedBillId ? bills.find((b) => b.id === tx.linkedBillId)?.cycleName : "Not linked"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-[9px]">Not linked</SelectItem>
                                {bills.map(b => (
                                  <SelectItem key={b.id} value={b.id} className="text-[9px]">{b.cycleName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[9px]"
                              onClick={() => openCreateBillDialog(tx)}
                            >
                              + Cycle
                            </Button>
                          </div>
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

      <Dialog open={isCreateBillDialogOpen} onOpenChange={setIsCreateBillDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Billing Cycle</DialogTitle>
            <DialogDescription>
              Create and immediately link a billing cycle for this CC settlement transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <p className="text-xs font-medium mb-1">Credit Card</p>
                <Select value={newBillCardId} onValueChange={(value) => setNewBillCardId(value ?? "")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select credit card">
                    {creditCards.find((card) => card.id === newBillCardId)?.bankName} {creditCards.find((card) => card.id === newBillCardId)?.nickname ? `· ${creditCards.find((card) => card.id === newBillCardId)?.nickname}` : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {creditCards.map((card) => (
                    <SelectItem key={card.id} value={card.id} className="text-xs">
                      {card.bankName} · {card.nickname} {card.last4 ? `(•${card.last4})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Cycle Name</p>
              <Input
                placeholder="e.g. Mar 2026"
                value={newBillCycleName}
                onChange={(e) => setNewBillCycleName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Bill Amount</p>
              <Input
                type="number"
                placeholder="25000"
                value={newBillAmount}
                onChange={(e) => setNewBillAmount(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {newBillError && (
              <p className="text-xs text-destructive">{newBillError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateBillDialogOpen(false)}>Cancel</Button>
            <Button onClick={createBillFromClassification} disabled={isCreatingBill}>
              {isCreatingBill ? "Creating..." : "Create & Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { banks, loaded } = useAccounts();
  const [activeTab, setActiveTab] = useState<"import" | "split_tracker" | "manual_add">("import");
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<StatementSource[]>([]);
  const [parserId, setParserId] = useState<ParserId | "">("");
  const [uploadKind, setUploadKind] = useState<"" | "cc" | "non_cc">("");
  const [selectedCcBillId, setSelectedCcBillId] = useState("");

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
  const [selectedMetaIds, setSelectedMetaIds] = useState<string[]>([]);
  const transportMetaSelected = selectedMetaIds.includes("transport_upi_150_250");

  const [saved, setSaved] = useState(false);
  const [ledgerTransactions, setLedgerTransactions] = useState<Transaction[]>([]);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerError, setTrackerError] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [manualTx, setManualTx] = useState({
    id: "",
    refNo: "",
    date: "",
    narration: "",
    amount: "",
    category: "Other",
    transactionType: "spend" as Transaction["transactionType"],
    paymentMethod: "Other" as PaymentMethod,
    confidence: "",
    annotated: true,
    splitStatus: "none" as NonNullable<Transaction["splitStatus"]>,
    splitSettledAmount: "",
    bankId: "",
    cardId: "",
    statementType: "bank_account" as StatementType,
    closingBalance: "",
    linkedBillId: "",
  });

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

  const loadLedgerTransactions = useCallback(async () => {
    setTrackerLoading(true);
    setTrackerError("");
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) throw new Error("Failed to load transactions");
      const data: Transaction[] = await res.json();
      setLedgerTransactions(data);
    } catch (e) {
      setTrackerError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setTrackerLoading(false);
    }
  }, []);

  const updateSplitStatus = useCallback(async (id: string, splitStatus: NonNullable<Transaction["splitStatus"]>) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, splitStatus }),
    });

    if (!res.ok) {
      throw new Error("Failed to update split status");
    }

    setLedgerTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, splitStatus } : tx)));
  }, []);

  const handleManualCreate = useCallback(async () => {
    setManualMessage("");

    const amount = Number(manualTx.amount);
    if (!manualTx.refNo.trim() || !manualTx.date.trim() || !manualTx.narration.trim() || Number.isNaN(amount)) {
      setManualMessage("refNo, date, narration and amount are required.");
      return;
    }

    const confidence = manualTx.confidence.trim() ? Number(manualTx.confidence) : undefined;
    const splitSettledAmount = manualTx.splitSettledAmount.trim() ? Number(manualTx.splitSettledAmount) : undefined;
    const closingBalance = manualTx.closingBalance.trim() ? Number(manualTx.closingBalance) : undefined;

    if ((confidence != null && Number.isNaN(confidence)) || (splitSettledAmount != null && Number.isNaN(splitSettledAmount)) || (closingBalance != null && Number.isNaN(closingBalance))) {
      setManualMessage("confidence, split settled amount, and closing balance must be valid numbers.");
      return;
    }

    const payload: Transaction = {
      id: manualTx.id.trim() || `manual-${Date.now()}`,
      refNo: manualTx.refNo.trim(),
      date: manualTx.date.trim(),
      narration: manualTx.narration.trim(),
      amount,
      category: manualTx.category || undefined,
      transactionType: manualTx.transactionType,
      paymentMethod: manualTx.paymentMethod,
      confidence,
      annotated: manualTx.annotated,
      splitStatus: manualTx.splitStatus,
      splitSettledAmount,
      bankId: manualTx.bankId.trim() || undefined,
      cardId: manualTx.cardId.trim() || undefined,
      statementType: manualTx.statementType,
      closingBalance,
      linkedBillId: manualTx.linkedBillId.trim() || undefined,
    };

    setManualBusy(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: [payload] }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create transaction");

      if (result.saved === 1) {
        setManualMessage("Transaction saved.");
        await loadLedgerTransactions();
      } else {
        setManualMessage("No transaction created (likely duplicate refNo for this user).");
      }
    } catch (e) {
      setManualMessage(e instanceof Error ? e.message : "Failed to create transaction");
    } finally {
      setManualBusy(false);
    }
  }, [manualTx, loadLedgerTransactions]);

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
      const selectedMetaHints = CLASSIFICATION_METAS
        .filter((metaItem) => selectedMetaIds.includes(metaItem.id))
        .map((metaItem) => metaItem.hint);

      // Call API in a single request (batching is handled server-side)
      setClassifyLabel(`Sending ${deduped.length} rows to AI…`);
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: deduped, metaHints: selectedMetaHints }),
      });
      const data = await res.json();
      setClassifyProgress(deduped.length);

      if (!res.ok) throw new Error(data.error ?? "Classification failed");

      const classified: { refNo: string; transactionType: string; category: string; paymentMethod?: string; confidence: number; notes?: string }[] = data.classified;

      // Merge parsed rows with classification
      const classMap = new Map(classified.map(c => [c.refNo, c]));

      const source = sources[0];
      const sourceBankId = source?.bankId;
      const txs: Transaction[] = deduped.map((row, idx) => {
        const cls = classMap.get(row.refNo);
        const inferredPayment = (cls?.paymentMethod ?? "").toLowerCase();
        const validCards = banks.find(b => b.id === sourceBankId)?.cards || [];
        
        let aiCardId: string | undefined = source?.cardId;
        if (source?.statementType === "bank_account" && inferredPayment) {
          // Attempt to find a non-CC card matching "upi" or "debit"
          const match = validCards.find(c => c.type !== "credit" && (c.type === inferredPayment.split(" ")[0] || c.nickname.toLowerCase().includes(inferredPayment)));
          if (match) aiCardId = match.id;
        }

        if (source?.statementType === "bank_account" && !inferredPayment) {
          aiCardId = undefined;
        }

        const isDebit = row.withdrawal != null;
        const amt = isDebit ? -(row.withdrawal ?? 0) : (row.deposit ?? 0);
        const amountAbs = Math.abs(amt);
        const narration = row.narration ?? "";
        const narrationLower = narration.toLowerCase();
        const hasUpiSignal =
          inferredPayment.includes("upi") ||
          /\bupi\b/.test(narrationLower) ||
          /@[a-z]/.test(narrationLower);
        const lowSignalCategory = !cls?.category || cls.category === "Other";
        const shouldForceTransport =
          transportMetaSelected &&
          isDebit &&
          amountAbs >= 150 &&
          amountAbs <= 250 &&
          hasUpiSignal &&
          isNarrationUnclearForPurpose(narration) &&
          lowSignalCategory;

        const finalCategory = shouldForceTransport
          ? "Transport"
          : (cls?.category as Category ?? "Other");
        const finalType = shouldForceTransport
          ? "spend"
          : (cls?.transactionType ?? (isDebit ? "spend" : "income"));
        const finalPaymentMethod = shouldForceTransport
          ? "UPI"
          : (cls?.paymentMethod ?? "Other");
        const finalConfidence = shouldForceTransport
          ? Math.max(cls?.confidence ?? 0, 0.8)
          : cls?.confidence;

        return {
          id: `${row.refNo || idx}-${Date.now()}`,
          refNo: row.refNo,
          date: row.date,
          narration: row.narration,
          amount: amt,
          category: finalCategory as Category,
          paymentMethod: finalPaymentMethod as PaymentMethod,
          transactionType: finalType as Transaction["transactionType"],
          confidence: finalConfidence,
          annotated: (finalConfidence ?? 0) >= 0.75,
          splitStatus: "none",
          bankId: sourceBankId,
          cardId: source?.statementType === "bank_account" ? aiCardId : source?.cardId,
          statementType: source?.statementType,
          linkedBillId: source?.statementType === "credit_card" ? (selectedCcBillId || undefined) : undefined,
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
    setUploadKind("");
    setSelectedCcBillId("");
    setSelectedMetaIds([]);
    setClassifyProgress(0);
    setDuplicates([]);
  };

  const toggleMeta = (metaId: string) => {
    setSelectedMetaIds((prev) =>
      prev.includes(metaId) ? prev.filter((id) => id !== metaId) : [...prev, metaId]
    );
  };

  const [bills, setBills] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/bills").then(r => r.json()).then(setBills).catch(() => {});
  }, []);

  const handleBillCreated = (bill: any) => {
    setBills((prev) => {
      const exists = prev.some((existing) => existing.id === bill.id);
      if (exists) {
        return prev.map((existing) => (existing.id === bill.id ? { ...existing, ...bill } : existing));
      }
      return [bill, ...prev];
    });
  };

  useEffect(() => {
    if (activeTab !== "import") {
      loadLedgerTransactions();
    }
  }, [activeTab, loadLedgerTransactions]);

  if (!loaded) return null;

  const splitTracked = ledgerTransactions
    .filter((tx) => tx.splitStatus && tx.splitStatus !== "none")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const splitTrackerTotal = splitTracked.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const splitTrackerPending = splitTracked
    .filter((tx) => tx.splitStatus === "to_split" || tx.splitStatus === "splitwise_logged")
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return (
    <div className="p-8 space-y-6 max-w-[1300px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Transaction Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "import" | "split_tracker" | "manual_add")} className="space-y-5">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="split_tracker">Split Tracker</TabsTrigger>
          <TabsTrigger value="manual_add">Add Transaction</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
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

          {step === 1 && (
            <Step1Upload
              banks={banks}
              bills={bills}
              sources={sources}
              setSources={setSources}
              parserId={parserId}
              setParserId={setParserId}
              uploadKind={uploadKind}
              setUploadKind={setUploadKind}
              selectedCcBillId={selectedCcBillId}
              setSelectedCcBillId={setSelectedCcBillId}
              onParsed={handleParsed}
            />
          )}
          {step === 2 && meta && (
            <Step2Validate
              meta={meta}
              rowCount={rawRows.filter((r) => !duplicates.includes(r.refNo)).length}
              duplicates={duplicates}
              selectedMetaIds={selectedMetaIds}
              onToggleMeta={toggleMeta}
              onConfirm={handleValidated}
            />
          )}
          {step === 3 && <Step3Classify progress={classifyProgress} total={classifyTotal} current={classifyLabel} />}
          {step === 4 && <Step4Review bills={bills} banks={banks} transactions={transactions} onUpdate={updateTx} onBillCreated={handleBillCreated} onNext={handleConfirm} />}
        </TabsContent>

        <TabsContent value="split_tracker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Splitwise Tracker</CardTitle>
              <CardDescription className="text-xs">
                Track spend transactions from your ledger and update their Splitwise lifecycle.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">Total In Split Tracker</p>
                  <p className="text-sm font-semibold">{formatINR(splitTrackerTotal)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">Pending (To Split + On Splitwise)</p>
                  <p className="text-sm font-semibold">{formatINR(splitTrackerPending)}</p>
                </div>
              </div>

              {trackerError && <p className="text-xs text-destructive">{trackerError}</p>}

              {trackerLoading ? (
                <p className="text-xs text-muted-foreground">Loading split tracker...</p>
              ) : splitTracked.length === 0 ? (
                <p className="text-xs text-muted-foreground">No split-tracked transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Narration</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {splitTracked.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">{tx.date}</TableCell>
                        <TableCell className="text-xs max-w-[420px] truncate">{tx.narration}</TableCell>
                        <TableCell className="text-xs text-right">{formatINR(tx.amount)}</TableCell>
                        <TableCell className="text-xs">{SPLIT_STATUS_LABELS[tx.splitStatus || "none"]}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {tx.splitStatus === "to_split" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={async () => {
                                  try {
                                    await updateSplitStatus(tx.id, "splitwise_logged");
                                  } catch {
                                    alert("Failed to mark as put on Splitwise.");
                                  }
                                }}
                              >
                                Mark Put On Splitwise
                              </Button>
                            )}
                            {(tx.splitStatus === "to_split" || tx.splitStatus === "splitwise_logged") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                onClick={async () => {
                                  try {
                                    await updateSplitStatus(tx.id, "settled");
                                  } catch {
                                    alert("Failed to mark as cleared.");
                                  }
                                }}
                              >
                                Mark Splitwise Cleared
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-[10px]"
                              onClick={async () => {
                                const confirmed = window.confirm("This will remove this transaction from split tracking. Continue?");
                                if (!confirmed) return;
                                try {
                                  await updateSplitStatus(tx.id, "none");
                                } catch {
                                  alert("Failed to mark as unsplit.");
                                }
                              }}
                            >
                              Mark Unsplit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual_add" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Manual Transaction Entry</CardTitle>
              <CardDescription className="text-xs">
                Enter all fields directly for personal logging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input placeholder="id (optional)" value={manualTx.id} onChange={(e) => setManualTx((prev) => ({ ...prev, id: e.target.value }))} />
                <Input placeholder="refNo (required)" value={manualTx.refNo} onChange={(e) => setManualTx((prev) => ({ ...prev, refNo: e.target.value }))} />
                <Input placeholder="date (required)" value={manualTx.date} onChange={(e) => setManualTx((prev) => ({ ...prev, date: e.target.value }))} />

                <Input placeholder="narration (required)" value={manualTx.narration} onChange={(e) => setManualTx((prev) => ({ ...prev, narration: e.target.value }))} className="md:col-span-3" />
                <Input type="number" placeholder="amount (required)" value={manualTx.amount} onChange={(e) => setManualTx((prev) => ({ ...prev, amount: e.target.value }))} />
                <Input type="number" placeholder="confidence (optional)" value={manualTx.confidence} onChange={(e) => setManualTx((prev) => ({ ...prev, confidence: e.target.value }))} />
                <Input type="number" placeholder="closing balance (optional)" value={manualTx.closingBalance} onChange={(e) => setManualTx((prev) => ({ ...prev, closingBalance: e.target.value }))} />

                <Input type="number" placeholder="split settled amount (optional)" value={manualTx.splitSettledAmount} onChange={(e) => setManualTx((prev) => ({ ...prev, splitSettledAmount: e.target.value }))} />
                <Input placeholder="bankId (optional)" value={manualTx.bankId} onChange={(e) => setManualTx((prev) => ({ ...prev, bankId: e.target.value }))} />
                <Input placeholder="cardId (optional)" value={manualTx.cardId} onChange={(e) => setManualTx((prev) => ({ ...prev, cardId: e.target.value }))} />

                <Input placeholder="linkedBillId (optional)" value={manualTx.linkedBillId} onChange={(e) => setManualTx((prev) => ({ ...prev, linkedBillId: e.target.value }))} />

                <Select value={manualTx.transactionType} onValueChange={(value) => setManualTx((prev) => ({ ...prev, transactionType: value as Transaction["transactionType"] }))}>
                  <SelectTrigger><SelectValue placeholder="transactionType" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TX_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualTx.paymentMethod} onValueChange={(value) => setManualTx((prev) => ({ ...prev, paymentMethod: value as PaymentMethod }))}>
                  <SelectTrigger><SelectValue placeholder="paymentMethod" /></SelectTrigger>
                  <SelectContent>
                    {["UPI", "Debit", "Credit Card", "Net Banking", "Cash", "Other"].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualTx.category || "Other"} onValueChange={(value) => setManualTx((prev) => ({ ...prev, category: value ?? "Other" }))}>
                  <SelectTrigger><SelectValue placeholder="category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualTx.statementType} onValueChange={(value) => setManualTx((prev) => ({ ...prev, statementType: value as StatementType }))}>
                  <SelectTrigger><SelectValue placeholder="statementType" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_account">bank_account</SelectItem>
                    <SelectItem value="credit_card">credit_card</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={manualTx.splitStatus} onValueChange={(value) => setManualTx((prev) => ({ ...prev, splitStatus: value as NonNullable<Transaction["splitStatus"]> }))}>
                  <SelectTrigger><SelectValue placeholder="splitStatus" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SPLIT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualTx.annotated ? "true" : "false"} onValueChange={(value) => setManualTx((prev) => ({ ...prev, annotated: value === "true" }))}>
                  <SelectTrigger><SelectValue placeholder="annotated" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">annotated: true</SelectItem>
                    <SelectItem value="false">annotated: false</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {manualMessage && <p className="text-xs text-muted-foreground">{manualMessage}</p>}

              <Button onClick={handleManualCreate} disabled={manualBusy}>
                {manualBusy ? "Saving..." : "Save Manual Transaction"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
