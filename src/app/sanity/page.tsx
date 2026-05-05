"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
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

const ALLOWED_POSITIVE = new Set(["income", "refund", "refund_settlement", "transfer_in"]);
const ALLOWED_NEGATIVE = new Set(["spend", "transfer_out", "investment", "cc_settlement", "income_debit"]);
const POSITIVE_TYPES: Transaction["transactionType"][] = ["income", "refund", "refund_settlement", "transfer_in"];
const NEGATIVE_TYPES: Transaction["transactionType"][] = ["spend", "transfer_out", "investment", "cc_settlement", "income_debit"];

function allowedTypesForAmount(amount: number): Transaction["transactionType"][] {
  if (amount > 0) return POSITIVE_TYPES;
  if (amount < 0) return NEGATIVE_TYPES;
  return [];
}

export default function SanityPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [ignoreExcluded, setIgnoreExcluded] = useState(true);
  const [pendingTypes, setPendingTypes] = useState<Record<string, Transaction["transactionType"]>>({});
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Transaction[]) => setTransactions(Array.isArray(rows) ? rows : []))
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
            expected: "spend | transfer_out | investment | cc_settlement | income_debit",
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
    return <div className="p-8 text-sm text-muted-foreground">Loading sanity checks...</div>;
  }

  return (
    <div className="mx-auto max-w-[1250px] space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Data Quality</p>
          <h1 className="text-2xl font-semibold tracking-tight">Sanity Checks</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Rule: positives must be income/refund/refund settlement/transfer in; negatives must be spend/transfer out/investment/cc settlement/income debit.
          </p>
        </div>
        <Link href="/transactions">
          <Button size="sm" variant="outline">Open Transactions</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Checked Rows</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valid</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{summary.validCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Violations</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-destructive">{summary.violations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pass Rate</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {summary.total > 0 ? `${Math.round((summary.validCount / summary.total) * 100)}%` : "100%"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Positive Rule</CardTitle>
            <CardDescription className="text-xs">Amount greater than 0 must be income/refund/refund_settlement/transfer_in.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {summary.positive === summary.validPositive ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> All positive rows valid</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-destructive"><AlertTriangle className="h-4 w-4" /> {summary.positive - summary.validPositive} invalid out of {summary.positive}</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Negative Rule</CardTitle>
            <CardDescription className="text-xs">Amount less than 0 must be spend/transfer_out/investment/cc_settlement/income_debit.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {summary.negative === summary.validNegative ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> All negative rows valid</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-destructive"><ShieldAlert className="h-4 w-4" /> {summary.negative - summary.validNegative} invalid out of {summary.negative}</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Violations</CardTitle>
              <CardDescription className="text-xs">Rows that break your sign/type sanity rule.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {dirtyIds.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setPendingTypes({})} disabled={savingAll}>
                  Discard {dirtyIds.length}
                </Button>
              )}
              <Button size="sm" onClick={saveAllChanges} disabled={dirtyIds.length === 0 || savingAll}>
                {savingAll ? "Saving..." : `Save All Changes${dirtyIds.length ? ` (${dirtyIds.length})` : ""}`}
              </Button>
              <Button size="sm" variant={ignoreExcluded ? "default" : "outline"} onClick={() => setIgnoreExcluded((v) => !v)}>
                {ignoreExcluded ? "Ignoring excluded" : "Including excluded"}
              </Button>
            </div>
          </div>
          <div className="pt-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search narration, ref no, type..."
              className="h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Narration</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Expected</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Fix Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredViolations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-xs text-emerald-600">
                    No violations for current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredViolations.map(({ tx, expected, reason }) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-muted-foreground">{tx.date}</TableCell>
                    <TableCell className="max-w-[360px] text-xs">
                      <p className="truncate font-medium" title={tx.narration}>{tx.narration}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{tx.refNo}</p>
                    </TableCell>
                    <TableCell className="text-xs">{tx.transactionType}</TableCell>
                    <TableCell className={`text-right font-mono text-xs ${tx.amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {tx.amount >= 0 ? "+" : "-"}{formatINR(tx.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{expected}</TableCell>
                    <TableCell className="text-xs text-destructive">{reason}</TableCell>
                    <TableCell>
                      {(() => {
                        const selectedType = pendingTypes[tx.id] ?? tx.transactionType;
                        const isDirty = selectedType !== tx.transactionType;
                        return (
                          <div className="flex items-center gap-2">
                            <Select
                              value={selectedType}
                              onValueChange={(value) => {
                                if (!value) return;
                                setPendingTypes((prev) => ({ ...prev, [tx.id]: value as Transaction["transactionType"] }));
                              }}
                            >
                              <SelectTrigger className="h-8 w-[190px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {allowedTypesForAmount(tx.amount).map((type) => (
                                  <SelectItem key={type} value={type} className="text-xs">
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isDirty ? <span className="text-[10px] font-medium text-amber-600">unsaved</span> : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
