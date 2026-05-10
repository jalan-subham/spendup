"use client";

import { useMemo, useState } from "react";
import { useAccounts, useTransactions } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, CalendarRange } from "lucide-react";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function parseDDMMYY(s: string) {
  if (!s) return 0;
  const slash = s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const [, d, m, yRaw] = slash;
    const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  const dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) {
    const [, d, m, y] = dash;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  const isoTime = new Date(s).getTime();
  return Number.isNaN(isoTime) ? 0 : isoTime;
}

function endOfDayTimestamp(value: string) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

type TxWithTs = Transaction & { _ts: number };

type ClosingResult = {
  tx?: TxWithTs;
  fallbackOpening?: number;
  targetTs: number;
};

export default function BalanceFinderPage() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const { transactions, loaded: transactionsLoaded } = useTransactions();

  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const bank = banks.find((b) => b.id === selectedBankId);

  const bankTransactions = useMemo<TxWithTs[]>(() => {
    if (!selectedBankId) return [];
    return transactions
      .filter((tx) => tx.bankId === selectedBankId)
      .filter((tx) => tx.statementType !== "credit_card")
      .map((tx) => ({ ...tx, _ts: parseDDMMYY(tx.date) }))
      .filter((tx) => tx._ts > 0)
      .sort((a, b) => b._ts - a._ts);
  }, [transactions, selectedBankId]);

  const closingResult = useMemo<ClosingResult | null>(() => {
    if (!selectedBankId || !selectedDate) return null;

    const targetTs = endOfDayTimestamp(selectedDate);
    if (!targetTs) return { targetTs: 0 };

    const candidates = bankTransactions.filter((tx) => tx.closingBalance != null && tx._ts <= targetTs);
    const best = candidates.reduce<TxWithTs | null>((prev, curr) => {
      if (!prev) return curr;
      return curr._ts > prev._ts ? curr : prev;
    }, null);

    if (best) {
      return { tx: best, targetTs };
    }

    const fallbackOpening = bank?.openingBalance ?? undefined;
    return { fallbackOpening, targetTs };
  }, [bankTransactions, bank?.openingBalance, selectedBankId, selectedDate]);

  const showResult = !!closingResult && !!selectedBankId && !!selectedDate;
  const showEmptyState = accountsLoaded && transactionsLoaded && banks.length === 0;
  const showMissingData = showResult && !closingResult?.tx && closingResult?.fallbackOpening == null;

  if (!accountsLoaded || !transactionsLoaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading balance finder...</div>;
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Bank Tools</p>
          <h1 className="text-2xl font-semibold tracking-tight">Closing Balance Finder</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a bank and date to see the last recorded closing balance on or before that day.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Landmark className="h-4 w-4" />
          <span>Uses statement closing balances.</span>
        </div>
      </div>

      {showEmptyState ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No banks configured yet. Add one in Settings to start using this page.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Inputs</CardTitle>
              <CardDescription className="text-xs">Select a bank account and target date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Bank</label>
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDate("");
                    setSelectedBankId("");
                  }}
                >
                  Clear
                </Button>
              </div>

              <div className="rounded-lg border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
                Tip: if the statement data does not store closing balances, the page can only fall back to the bank opening balance.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Result</CardTitle>
              <CardDescription className="text-xs">Balance snapshot for the selected date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showResult ? (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  <CalendarRange className="h-4 w-4" />
                  Select a bank and date to compute the closing balance.
                </div>
              ) : showMissingData ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  No closing balance was recorded before that date.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Bank</p>
                      <p className="mt-1 text-sm font-semibold">{bank?.name ?? "Unknown"}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Closing Balance</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {closingResult?.tx?.closingBalance != null
                          ? formatINR(closingResult.tx.closingBalance)
                          : closingResult?.fallbackOpening != null
                          ? formatINR(closingResult.fallbackOpening)
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {closingResult?.tx ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Narration</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Closing Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="whitespace-nowrap">{closingResult.tx.date}</TableCell>
                          <TableCell className="max-w-[340px] truncate">{closingResult.tx.narration}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {closingResult.tx.amount < 0 ? "-" : "+"}{formatINR(closingResult.tx.amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(closingResult.tx.closingBalance ?? 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                      Using the configured opening balance because no closing balance was recorded before this date.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
