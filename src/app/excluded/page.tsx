"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

import { parseTxnDate } from "@/lib/date";

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
        return tx.narration.toLowerCase().includes(q) || tx.refNo.toLowerCase().includes(q);
      })
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [rows, search]);

  const totalExcluded = excludedRows.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const restore = async (id: string) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, transactionType: "spend" }),
    });
    if (!res.ok) return;
    setRows((prev) => prev.map((tx) => (tx.id === id ? { ...tx, transactionType: "spend" } : tx)));
  };

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading excluded transactions...</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-[1200px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Cleanup</p>
        <h1 className="text-2xl font-semibold tracking-tight">Excluded Transactions</h1>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-sm font-semibold">Excluded Ledger Rows</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search narration or ref no..."
              className="max-w-sm h-9"
            />
            <p className="text-xs text-muted-foreground">
              {excludedRows.length} rows · Total {formatINR(totalExcluded)}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {excludedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No excluded transactions found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Narration</TableHead>
                  <TableHead className="text-xs">Ref</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {excludedRows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{tx.date}</TableCell>
                    <TableCell className="text-xs font-medium max-w-[320px] truncate">{tx.narration}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground font-mono">{tx.refNo}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {tx.statementType === "credit_card" ? "CC" : "Bank"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{tx.amount < 0 ? "−" : "+"}{formatINR(tx.amount)}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => restore(tx.id)}>
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
