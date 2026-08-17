"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/lib/store";
import type { BankBalanceSnapshot } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark } from "lucide-react";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

import { parseTxnDate as parseDate } from "@/lib/date";

export default function SnapshotsPage() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const [snapshots, setSnapshots] = useState<BankBalanceSnapshot[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [bankId, setBankId] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [closingBalance, setClosingBalance] = useState("");

  useEffect(() => {
    fetch("/api/balance-snapshots")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: BankBalanceSnapshot[]) => setSnapshots(Array.isArray(rows) ? rows : []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    fetch("/api/transactions")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setTransactions(Array.isArray(rows) ? rows : []))
      .catch(() => setTransactions([]));
  }, []);

  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => {
      const dateDiff = parseDate(b.asOfDate) - parseDate(a.asOfDate);
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [snapshots]);

  const filteredSnapshots = useMemo(() => {
    if (!bankId) return sortedSnapshots;
    return sortedSnapshots.filter((snap) => snap.bankId === bankId);
  }, [sortedSnapshots, bankId]);

  const lastDateForBank = useMemo(() => {
    if (!bankId) return "";
    const rows = transactions.filter(
      (tx) => tx.bankId === bankId && tx.statementType === "bank_account" && typeof tx.closingBalance === "number"
    );
    if (rows.length === 0) return "";
    return rows.reduce((latest, tx) => {
      if (!latest) return tx.date;
      return parseDate(tx.date) > parseDate(latest) ? tx.date : latest;
    }, "");
  }, [transactions, bankId]);

  const lastDateRows = useMemo(() => {
    if (!bankId || !lastDateForBank) return [];
    return transactions.filter(
      (tx) =>
        tx.bankId === bankId &&
        tx.statementType === "bank_account" &&
        tx.date === lastDateForBank &&
        typeof tx.closingBalance === "number"
    );
  }, [transactions, bankId, lastDateForBank]);

  const handleCreate = async () => {
    setError("");
    const closing = Number(closingBalance);

    if (!bankId) {
      setError("Select a bank.");
      return;
    }
    if (!asOfDate) {
      setError("Enter the snapshot date.");
      return;
    }
    if (!Number.isFinite(closing)) {
      setError("Closing balance must be a valid number.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/balance-snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId,
          asOfDate,
          closingBalance: closing,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create snapshot");
      }

      setSnapshots((prev) => [data, ...prev]);
      setAsOfDate("");
      setClosingBalance("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create snapshot");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || !accountsLoaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading snapshots...</div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Bank Tools</p>
          <h1 className="text-2xl font-semibold tracking-tight">Balance Snapshots</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add manual snapshots and review existing ones for each bank.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Landmark className="h-4 w-4" />
          <span>Closing balances only.</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Snapshot</CardTitle>
            <CardDescription className="text-xs">Manually add a statement snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Bank</label>
              <Select value={bankId} onValueChange={(v) => setBankId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">As of Date</label>
              <Input
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                placeholder="DD/MM/YY or DD/MM/YYYY"
              />
            </div>

            {bankId && lastDateRows.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold">Last Date Balances ({lastDateForBank})</p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Pick the last transaction for that date.
                </p>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {lastDateRows.map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        Number(closingBalance) === tx.closingBalance
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                      onClick={() => {
                        setAsOfDate(tx.date);
                        setClosingBalance(String(tx.closingBalance));
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{tx.narration || "(No narration)"}</span>
                        <span className="font-semibold tabular-nums">{formatINR(tx.closingBalance)}</span>
                      </div>
                      {tx.refNo && <p className="mt-1 text-[10px] text-muted-foreground font-mono">{tx.refNo}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Closing Balance</label>
              <Input
                type="number"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder="210468.40"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Add Snapshot"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Snapshot History</CardTitle>
            <CardDescription className="text-xs">Latest statement balances by bank.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Select value={bankId} onValueChange={(v) => setBankId(v ?? "")}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter by bank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All banks</SelectItem>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setBankId("")}>Clear</Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>As of Date</TableHead>
                  <TableHead>Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSnapshots.map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell className="text-xs font-medium">
                      {banks.find((bank) => bank.id === snap.bankId)?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {snap.asOfDate}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatINR(snap.closingBalance)}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSnapshots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs text-muted-foreground text-center py-6">
                      No snapshots found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
