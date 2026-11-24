"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts } from "@/lib/store";
import type { CreditCardBill, Transaction } from "@/lib/types";
import { parseTxnDate } from "@/lib/date";

type BillWithTransactions = CreditCardBill & {
  transactions: Transaction[];
  cardId: string;
};

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function CreditCardsPage() {
  const { banks, loaded } = useAccounts();
  const [bills, setBills] = useState<BillWithTransactions[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [activeBill, setActiveBill] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/bills").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/transactions").then((r) => (r.ok ? r.json() : [])),
    ]).then(([billData, txData]) => {
      const typedBills = billData as BillWithTransactions[];
      setBills(typedBills);
      setAllTransactions(txData as Transaction[]);
      if (typedBills.length > 0) setActiveBill(typedBills[0].id);
    });
  }, []);

  const ccAllRows = useMemo(() => {
    return allTransactions
      .filter(
        (tx) =>
          tx.statementType === "credit_card" &&
          tx.transactionType !== "excluded"
      )
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [allTransactions]);

  const unlinkedCcRows = useMemo(() => {
    return ccAllRows.filter((tx) => !tx.linkedBillId);
  }, [ccAllRows]);

  const totalCcNetSpend = useMemo(() => {
    return ccAllRows.reduce((sum, tx) => sum - tx.amount, 0);
  }, [ccAllRows]);

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading credit-card ledger…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Billing Cycle Transactions
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-[4px] border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Total CC Transactions
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {ccAllRows.length}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Net CC Spend
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {totalCcNetSpend >= 0
                ? formatINR(totalCcNetSpend)
                : `-${formatINR(totalCcNetSpend)}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              After credits/refunds/cashback
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Unlinked CC Rows
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
              {unlinkedCcRows.length}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">
              All CC Transactions
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              CC rows stay in your main ledger and are also grouped by cycle
              below.
            </p>
          </div>
          {ccAllRows.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No credit-card transactions imported yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="pr-5 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ccAllRows.slice(0, 40).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                      {tx.date}
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate text-xs font-medium">
                      {tx.narration}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {bills.find((b) => b.id === tx.linkedBillId)?.cycleName ||
                        "Unlinked"}
                    </TableCell>
                    <TableCell className="pr-5 text-right font-mono text-xs font-medium tabular-nums">
                      {tx.amount < 0 ? "−" : "+"}
                      {formatINR(tx.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">
              Billing Cycle View
            </h2>
          </div>
          <div className="p-5">
            {bills.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No billing cycles found.
              </p>
            ) : (
              <Tabs
                value={activeBill}
                onValueChange={setActiveBill}
                className="space-y-4"
              >
                <TabsList className="flex h-auto flex-wrap">
                  {bills.map((bill) => {
                    const card = banks
                      .flatMap((b) => b.cards)
                      .find((c) => c.id === bill.cardId);
                    return (
                      <TabsTrigger
                        key={bill.id}
                        value={bill.id}
                        className="font-mono text-xs"
                      >
                        {bill.cycleName}
                        {card?.last4 ? ` · •${card.last4}` : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {bills.map((bill) => {
                  const cycleRows = [...(bill.transactions || [])]
                    .filter(
                      (tx) =>
                        tx.statementType === "credit_card" &&
                        tx.transactionType !== "excluded"
                    )
                    .sort((a, b) => parseTxnDate(a.date) - parseTxnDate(b.date));
                  const cycleNetSpend = cycleRows.reduce(
                    (sum, tx) => sum - tx.amount,
                    0
                  );

                  return (
                    <TabsContent
                      key={bill.id}
                      value={bill.id}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between rounded-[2px] border border-border bg-secondary px-4 py-2.5">
                        <p className="font-mono text-xs text-muted-foreground">
                          Cycle {bill.cycleName} · {cycleRows.length} rows
                        </p>
                        <p className="font-mono text-xs font-semibold tabular-nums">
                          {cycleNetSpend >= 0 ? "Net Spend" : "Net Credit"}{" "}
                          {formatINR(cycleNetSpend)}
                        </p>
                      </div>

                      {cycleRows.length === 0 ? (
                        <p className="py-8 text-center text-xs text-muted-foreground">
                          No linked CC transactions in this cycle yet.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-[2px] border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Date</TableHead>
                                <TableHead>Narration</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">
                                  Amount
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cycleRows.map((tx) => (
                                <TableRow key={tx.id}>
                                  <TableCell className="font-mono text-xs text-muted-foreground">
                                    {tx.date}
                                  </TableCell>
                                  <TableCell className="max-w-[420px] truncate text-xs font-medium">
                                    {tx.narration}
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] uppercase text-muted-foreground">
                                    {tx.transactionType}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                                    {tx.amount < 0 ? "−" : "+"}
                                    {formatINR(tx.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
