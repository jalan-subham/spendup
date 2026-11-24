"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccounts } from "@/lib/store";
import type { BankBalanceSnapshot } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Landmark } from "lucide-react";
import { parseTxnDate as parseDate } from "@/lib/date";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

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
      .then((rows: BankBalanceSnapshot[]) =>
        setSnapshots(Array.isArray(rows) ? rows : [])
      )
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
      (tx) =>
        tx.bankId === bankId &&
        tx.statementType === "bank_account" &&
        typeof tx.closingBalance === "number"
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
      setError(
        err instanceof Error ? err.message : "Failed to create snapshot"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || !accountsLoaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading balance snapshots…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Balance Snapshots
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Maintain verified closing balance checkpoints across bank
              accounts.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            <span>{snapshots.length} checkpoints stored</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1260px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <section className="h-fit rounded-[4px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">
              New Checkpoint
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium">Bank</label>
              <Select
                value={bankId}
                onValueChange={(v) => setBankId(v ?? "")}
              >
                <SelectTrigger className="w-full">
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

            <div className="space-y-1.5">
              <label className="block text-xs font-medium">As of Date</label>
              <Input
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                placeholder="DD/MM/YY or DD/MM/YYYY"
                className="font-mono"
              />
            </div>

            {bankId && lastDateRows.length > 0 && (
              <div className="rounded-[2px] border border-border bg-secondary p-3">
                <div className="text-xs font-semibold">
                  Last Statement Date ({lastDateForBank})
                </div>
                <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
                  Pick the final transaction row from that day:
                </p>
                <div className="max-h-40 space-y-1.5 overflow-auto">
                  {lastDateRows.map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      className={`w-full rounded-[2px] border px-2.5 py-2 text-left text-xs transition-colors ${
                        Number(closingBalance) === tx.closingBalance
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-background hover:bg-muted/60"
                      }`}
                      onClick={() => {
                        setAsOfDate(tx.date);
                        setClosingBalance(String(tx.closingBalance));
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {tx.narration || "(No narration)"}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatINR(tx.closingBalance)}
                        </span>
                      </div>
                      {tx.refNo && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {tx.refNo}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium">
                Closing Balance (INR)
              </label>
              <Input
                type="number"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                placeholder="210468.40"
                className="font-mono"
              />
            </div>

            {error && (
              <div className="rounded-[2px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Add Snapshot"}
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Snapshot History
              </h2>
              <p className="text-xs text-muted-foreground">
                Latest closing balances recorded by bank.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={bankId}
                onValueChange={(v) => setBankId(v ?? "")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All banks" />
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
              {bankId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBankId("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Bank</TableHead>
                <TableHead>As of Date</TableHead>
                <TableHead className="pr-5 text-right">
                  Closing Balance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSnapshots.map((snap) => (
                <TableRow key={snap.id}>
                  <TableCell className="pl-5 text-xs font-medium">
                    {banks.find((bank) => bank.id === snap.bankId)?.name ??
                      "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {snap.asOfDate}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-mono text-xs font-semibold tabular-nums">
                    {formatINR(snap.closingBalance)}
                  </TableCell>
                </TableRow>
              ))}
              {filteredSnapshots.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-10 text-center text-xs text-muted-foreground"
                  >
                    No snapshots recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
