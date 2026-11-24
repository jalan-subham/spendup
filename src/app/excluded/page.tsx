"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { parseTxnDate } from "@/lib/date";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function ExcludedTransactionsPage() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Transaction[]) => setRows(data))
      .finally(() => setLoading(false));
  }, []);

  const excludedRows = useMemo(() => {
    return rows
      .filter((tx) => tx.transactionType === "excluded")
      .filter((tx) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          tx.narration.toLowerCase().includes(q) ||
          tx.refNo.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [rows, search]);

  const totalExcluded = excludedRows.reduce(
    (sum, tx) => sum + Math.abs(tx.amount),
    0
  );

  const restore = async (id: string) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, transactionType: "spend" }),
    });
    if (!res.ok) return;
    setRows((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, transactionType: "spend" } : tx))
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading excluded transactions…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Excluded Transactions
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Transactions marked excluded from monthly totals; restore any row
              to re-include it.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {excludedRows.length} rows · {formatINR(totalExcluded)}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1260px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="border-b border-border bg-secondary/50 px-5 py-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search narration or ref no…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {excludedRows.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              No excluded transactions found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead>Ref No</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {excludedRows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                      {tx.date}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs font-medium">
                      {tx.narration}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {tx.refNo}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-[2px] border border-border bg-secondary px-2 py-0.5 font-mono text-[10px]">
                        {tx.statementType === "credit_card" ? "CC" : "Bank"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                      {tx.amount < 0 ? "−" : "+"}
                      {formatINR(tx.amount)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => restore(tx.id)}
                      >
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
