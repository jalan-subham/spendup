"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts } from "@/lib/store";
import type { CreditCardBill, Transaction } from "@/lib/types";

type BillWithTransactions = CreditCardBill & { transactions: Transaction[]; cardId: string };

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

import { parseTxnDate } from "@/lib/date";

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
      .filter((tx) => tx.statementType === "credit_card" && tx.transactionType !== "excluded")
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [allTransactions]);

  const unlinkedCcRows = useMemo(() => {
    return ccAllRows.filter((tx) => !tx.linkedBillId);
  }, [ccAllRows]);

  const totalCcNetSpend = useMemo(() => {
    // Negative tx.amount = spend, positive = credits/refunds. Net spend should reduce by credits.
    return ccAllRows.reduce((sum, tx) => sum - tx.amount, 0);
  }, [ccAllRows]);

  if (!loaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading credit-card view...</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-[1300px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Credit Cards</p>
        <h1 className="text-2xl font-semibold tracking-tight">Billing Cycle Transactions</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total CC Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{ccAllRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Net CC Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {totalCcNetSpend >= 0 ? formatINR(totalCcNetSpend) : `-${formatINR(totalCcNetSpend)}`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">After credits/refunds/cashback</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Unlinked CC Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{unlinkedCcRows.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All CC Transactions (Across Cycles)</CardTitle>
          <CardDescription className="text-xs">
            CC rows stay in your main ledger and are also visible cycle-wise below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ccAllRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No credit-card transactions imported yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Narration</TableHead>
                  <TableHead className="text-xs">Cycle</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ccAllRows.slice(0, 40).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{tx.date}</TableCell>
                    <TableCell className="text-xs font-medium max-w-[420px] truncate">{tx.narration}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      {bills.find((b) => b.id === tx.linkedBillId)?.cycleName || "Unlinked"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{tx.amount < 0 ? "−" : "+"}{formatINR(tx.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Billing Cycle View</CardTitle>
          <CardDescription className="text-xs">Browse CC transactions cycle by cycle.</CardDescription>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No billing cycles found. Create or import one from the Transactions page.</p>
          ) : (
            <Tabs value={activeBill} onValueChange={setActiveBill} className="space-y-4">
              <TabsList className="flex flex-wrap h-auto">
                {bills.map((bill) => {
                  const card = banks.flatMap((b) => b.cards).find((c) => c.id === bill.cardId);
                  return (
                    <TabsTrigger key={bill.id} value={bill.id} className="text-xs">
                      {bill.cycleName}{card?.last4 ? ` · •${card.last4}` : ""}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {bills.map((bill) => {
                const cycleRows = [...(bill.transactions || [])]
                  .filter((tx) => tx.statementType === "credit_card" && tx.transactionType !== "excluded")
                  .sort((a, b) => parseTxnDate(a.date) - parseTxnDate(b.date));
                const cycleNetSpend = cycleRows.reduce((sum, tx) => sum - tx.amount, 0);

                return (
                  <TabsContent key={bill.id} value={bill.id} className="space-y-3">
                    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Cycle {bill.cycleName} · {cycleRows.length} rows
                      </p>
                      <p className="text-xs font-semibold">
                        {cycleNetSpend >= 0 ? "Net Spend" : "Net Credit"} {formatINR(cycleNetSpend)}
                      </p>
                    </div>

                    {cycleRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-8 text-center">No linked CC transactions in this cycle yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Narration</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cycleRows.map((tx) => (
                            <TableRow key={tx.id}>
                              <TableCell className="text-xs font-mono text-muted-foreground">{tx.date}</TableCell>
                              <TableCell className="text-xs font-medium max-w-[420px] truncate">{tx.narration}</TableCell>
                              <TableCell className="text-[10px] text-muted-foreground uppercase tracking-wide">{tx.transactionType}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{tx.amount < 0 ? "−" : "+"}{formatINR(tx.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
