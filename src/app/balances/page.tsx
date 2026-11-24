"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccounts, useTransactions } from "@/lib/store";
import type { Transaction } from "@/lib/types";
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
import { CalendarRange, Landmark } from "lucide-react";

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
    const year =
      yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  const dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) {
    const [, d, m, y] = dash;
    return new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10)
    ).getTime();
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

    const candidates = bankTransactions.filter(
      (tx) => tx.closingBalance != null && tx._ts <= targetTs
    );
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
  const showEmptyState =
    accountsLoaded && transactionsLoaded && banks.length === 0;
  const showMissingData =
    showResult &&
    !closingResult?.tx &&
    closingResult?.fallbackOpening == null;

  if (!accountsLoaded || !transactionsLoaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading balance finder…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Closing Balance Finder
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Inspect the last recorded statement closing balance on or before
              any date.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            <span>Statement ledger checkpoints</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {showEmptyState ? (
          <div className="rounded-[4px] border border-dashed border-border bg-secondary/40 p-8 text-center text-sm text-muted-foreground">
            No banks configured yet.{" "}
            <Link href="/settings" className="text-iris-ink underline">
              Add a bank in Settings
            </Link>{" "}
            to query historical closing balances.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <section className="h-fit rounded-[4px] border border-border bg-card">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  Query Parameters
                </h2>
              </div>
              <div className="space-y-4 p-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium">Bank</label>
                  <Select
                    value={selectedBankId}
                    onValueChange={(v) => setSelectedBankId(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
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

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium">
                    Target Date
                  </label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelectedDate(new Date().toISOString().slice(0, 10))
                    }
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

                <div className="rounded-[2px] border border-border bg-secondary p-3 text-xs text-muted-foreground">
                  If no statement closing balance exists before the selected
                  date, SpendUp falls back to the bank&apos;s configured opening
                  balance.
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[4px] border border-border bg-card">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  Balance Result
                </h2>
              </div>
              <div className="p-5">
                {!showResult ? (
                  <div className="flex items-center gap-3 rounded-[2px] border border-dashed border-border bg-secondary/40 p-6 text-xs text-muted-foreground">
                    <CalendarRange className="h-4 w-4 shrink-0" />
                    Select a bank account and target date to compute the closing
                    balance.
                  </div>
                ) : showMissingData ? (
                  <div className="rounded-[2px] border border-dashed border-border bg-secondary/40 p-6 text-xs text-muted-foreground">
                    No closing balance was recorded on or before that date.
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-[4px] border border-border bg-secondary sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                      <div className="p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Bank Account
                        </div>
                        <div className="mt-1.5 text-base font-semibold">
                          {bank?.name ?? "Unknown"}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Closing Balance
                        </div>
                        <div className="mt-1.5 font-mono text-xl font-semibold text-success tabular-nums">
                          {closingResult?.tx?.closingBalance != null
                            ? formatINR(closingResult.tx.closingBalance)
                            : closingResult?.fallbackOpening != null
                            ? formatINR(closingResult.fallbackOpening)
                            : "N/A"}
                        </div>
                      </div>
                    </div>

                    {closingResult?.tx ? (
                      <div className="overflow-hidden rounded-[2px] border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>Date</TableHead>
                              <TableHead>Narration</TableHead>
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                              <TableHead className="text-right">
                                Closing Balance
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {closingResult.tx.date}
                              </TableCell>
                              <TableCell className="max-w-[340px] truncate text-xs font-medium">
                                {closingResult.tx.narration}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">
                                {closingResult.tx.amount < 0 ? "−" : "+"}
                                {formatINR(closingResult.tx.amount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                                {formatINR(
                                  closingResult.tx.closingBalance ?? 0
                                )}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="rounded-[2px] border border-border bg-secondary p-4 text-xs text-muted-foreground">
                        Using configured opening balance because no statement
                        closing balance was recorded before this date.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
