"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

type Violation = {
  tx: Transaction;
  expected: string;
  reason: string;
};

const ALLOWED_POSITIVE = new Set([
  "income",
  "refund",
  "refund_settlement",
  "transfer_in",
]);
const ALLOWED_NEGATIVE = new Set([
  "spend",
  "transfer_out",
  "investment",
  "cc_settlement",
  "income_debit",
]);
const POSITIVE_TYPES: Transaction["transactionType"][] = [
  "income",
  "refund",
  "refund_settlement",
  "transfer_in",
];
const NEGATIVE_TYPES: Transaction["transactionType"][] = [
  "spend",
  "transfer_out",
  "investment",
  "cc_settlement",
  "income_debit",
];

function allowedTypesForAmount(
  amount: number
): Transaction["transactionType"][] {
  if (amount > 0) return POSITIVE_TYPES;
  if (amount < 0) return NEGATIVE_TYPES;
  return [];
}

export default function SanityPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [ignoreExcluded, setIgnoreExcluded] = useState(true);
  const [pendingTypes, setPendingTypes] = useState<
    Record<string, Transaction["transactionType"]>
  >({});
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Transaction[]) =>
        setTransactions(Array.isArray(rows) ? rows : [])
      )
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const checkedRows = useMemo(() => {
    if (!ignoreExcluded) return transactions;
    return transactions.filter((tx) => tx.transactionType !== "excluded");
  }, [transactions, ignoreExcluded]);

  const summary = useMemo(() => {
    let positive = 0;
    let negative = 0;
    let validPositive = 0;
    let validNegative = 0;
    const violations: Violation[] = [];

    for (const tx of checkedRows) {
      if (tx.amount > 0) {
        positive += 1;
        if (ALLOWED_POSITIVE.has(tx.transactionType)) {
          validPositive += 1;
        } else {
          violations.push({
            tx,
            expected: "income | refund | refund_settlement | transfer_in",
            reason: "Positive amount has non-allowed type",
          });
        }
      } else if (tx.amount < 0) {
        negative += 1;
        if (ALLOWED_NEGATIVE.has(tx.transactionType)) {
          validNegative += 1;
        } else {
          violations.push({
            tx,
            expected:
              "spend | transfer_out | investment | cc_settlement | income_debit",
            reason: "Negative amount has disallowed outgoing type",
          });
        }
      }
    }

    return {
      total: checkedRows.length,
      positive,
      negative,
      validPositive,
      validNegative,
      violations,
      validCount: validPositive + validNegative,
    };
  }, [checkedRows]);

  const filteredViolations = useMemo(() => {
    if (!search.trim()) return summary.violations;
    const q = search.toLowerCase();
    return summary.violations.filter(({ tx, reason }) => {
      return (
        tx.narration?.toLowerCase().includes(q) ||
        tx.refNo?.toLowerCase().includes(q) ||
        tx.transactionType?.toLowerCase().includes(q) ||
        reason.toLowerCase().includes(q)
      );
    });
  }, [summary.violations, search]);

  const dirtyIds = useMemo(() => {
    return Object.entries(pendingTypes)
      .filter(([id, nextType]) => {
        const tx = transactions.find((t) => t.id === id);
        return tx && tx.transactionType !== nextType;
      })
      .map(([id]) => id);
  }, [pendingTypes, transactions]);

  const saveAllChanges = async () => {
    if (dirtyIds.length === 0) return;
    setSavingAll(true);
    try {
      await Promise.all(
        dirtyIds.map((id) => {
          const transactionType = pendingTypes[id];
          return fetch("/api/transactions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, transactionType }),
          }).then((res) => {
            if (!res.ok) throw new Error("Failed to save one or more changes");
          });
        })
      );

      setTransactions((prev) =>
        prev.map((tx) => {
          const nextType = pendingTypes[tx.id];
          return nextType ? { ...tx, transactionType: nextType } : tx;
        })
      );

      setPendingTypes((prev) => {
        const copy = { ...prev };
        dirtyIds.forEach((id) => delete copy[id]);
        return copy;
      });
    } catch {
      alert("Could not save all type changes.");
    } finally {
      setSavingAll(false);
    }
  };

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Running sign/type sanity checks…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Sanity Audit
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Verify credit/debit sign direction rules across every imported
              transaction.
            </p>
          </div>
          <Link
            href="/transactions"
            className="inline-flex h-8 items-center rounded-[2px] border border-border bg-background px-3 text-xs font-medium hover:bg-secondary"
          >
            Open Import Ledger
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Border-joined audit summary */}
        <section className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-[4px] border border-border bg-card lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <div className="p-5 odd:border-r odd:border-border lg:odd:border-r-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Checked Rows
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {summary.total}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Valid Rows
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-success tabular-nums">
              {summary.validCount}
            </div>
          </div>
          <div className="p-5 odd:border-r odd:border-border lg:odd:border-r-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Violations
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                summary.violations.length > 0
                  ? "text-destructive"
                  : "text-success"
              }`}
            >
              {summary.violations.length}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Pass Rate
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {summary.total > 0
                ? `${Math.round((summary.validCount / summary.total) * 100)}%`
                : "100%"}
            </div>
          </div>
        </section>

        {/* Rule status strip */}
        <section className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-[4px] border border-border bg-secondary lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div className="text-xs font-semibold">Positive Sign Rule</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                amount &gt; 0 → income | refund | refund_settlement |
                transfer_in
              </div>
            </div>
            {summary.positive === summary.validPositive ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> All valid
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />{" "}
                {summary.positive - summary.validPositive} / {summary.positive}{" "}
                invalid
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div className="text-xs font-semibold">Negative Sign Rule</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                amount &lt; 0 → spend | transfer_out | investment |
                cc_settlement | income_debit
              </div>
            </div>
            {summary.negative === summary.validNegative ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> All valid
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium text-destructive">
                <ShieldAlert className="h-4 w-4" />{" "}
                {summary.negative - summary.validNegative} / {summary.negative}{" "}
                invalid
              </span>
            )}
          </div>
        </section>

        {/* Violations table */}
        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Flagged Violations
              </h2>
              <p className="text-xs text-muted-foreground">
                Batch-repair mismatched types and save all edits together.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {dirtyIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingTypes({})}
                  disabled={savingAll}
                >
                  Discard {dirtyIds.length}
                </Button>
              )}
              <Button
                size="sm"
                onClick={saveAllChanges}
                disabled={dirtyIds.length === 0 || savingAll}
              >
                {savingAll
                  ? "Saving…"
                  : `Save Changes${
                      dirtyIds.length ? ` (${dirtyIds.length})` : ""
                    }`}
              </Button>
              <Button
                size="sm"
                variant={ignoreExcluded ? "secondary" : "outline"}
                onClick={() => setIgnoreExcluded((v) => !v)}
              >
                {ignoreExcluded ? "Ignoring excluded" : "Including excluded"}
              </Button>
            </div>
          </div>

          <div className="border-b border-border bg-secondary/50 px-5 py-2.5">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search narration, ref no, or type…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>Narration &amp; Ref</TableHead>
                <TableHead>Current Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="pr-5">Fix Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredViolations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-xs text-success"
                  >
                    No sign/type violations for current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredViolations.map(({ tx, reason }) => {
                  const selectedType =
                    pendingTypes[tx.id] ?? tx.transactionType;
                  const isDirty = selectedType !== tx.transactionType;
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                        {tx.date}
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <p
                          className="truncate text-xs font-medium"
                          title={tx.narration}
                        >
                          {tx.narration}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {tx.refNo}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-[2px] border border-border bg-secondary px-2 py-0.5 font-mono text-[11px]">
                          {tx.transactionType}
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-xs font-medium tabular-nums ${
                          tx.amount >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {tx.amount >= 0 ? "+" : "-"}
                        {formatINR(tx.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-destructive">
                        {reason}
                      </TableCell>
                      <TableCell className="pr-5">
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedType}
                            onValueChange={(value) => {
                              if (!value) return;
                              setPendingTypes((prev) => ({
                                ...prev,
                                [tx.id]:
                                  value as Transaction["transactionType"],
                              }));
                            }}
                          >
                            <SelectTrigger className="h-8 w-[180px] font-mono text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {allowedTypesForAmount(tx.amount).map((type) => (
                                <SelectItem
                                  key={type}
                                  value={type}
                                  className="font-mono text-xs"
                                >
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isDirty && (
                            <span className="font-mono text-[10px] font-semibold text-warning">
                              unsaved
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
