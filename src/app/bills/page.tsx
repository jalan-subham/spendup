"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  Plus,
  Link as LinkIcon,
  AlertCircle,
  Trash2,
} from "lucide-react";
import type {
  CreditCardBill as BillType,
  Card as CardType,
  Transaction,
} from "@/lib/types";
import { useAccounts } from "@/lib/store";
import { parseTxnDate } from "@/lib/date";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function BillsPage() {
  const { banks } = useAccounts();
  const [bills, setBills] = useState<
    (BillType & { card: CardType; transactions: Transaction[] })[]
  >([]);
  const [unlinkedSettlements, setUnlinkedSettlements] = useState<Transaction[]>(
    []
  );
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("bills");
  const [selectedBillByTx, setSelectedBillByTx] = useState<
    Record<string, string>
  >({});

  // New Bill Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBillCardId, setNewBillCardId] = useState("");
  const [newBillCycleName, setNewBillCycleName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillError, setNewBillError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/bills").then((r) => r.json()),
      fetch("/api/transactions").then((r) => r.json()),
    ]).then(([bData, tData]) => {
      setBills(bData);
      setAllTransactions(tData as Transaction[]);
      const unlinked = (tData as Transaction[]).filter(
        (t) => t.transactionType === "cc_settlement" && !t.linkedBillId
      );
      setUnlinkedSettlements(unlinked);
      setLoaded(true);
    });
  }, []);

  const handleLink = async (billId: string, txId: string) => {
    const res = await fetch(`/api/bills/${billId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: txId, action: "link" }),
    });
    if (res.ok) window.location.reload();
  };

  const markAsPaid = async (billId: string, isPaid: boolean) => {
    const res = await fetch(`/api/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid }),
    });
    if (res.ok) window.location.reload();
  };

  const deleteCycle = async (billId: string, cycleName: string) => {
    const confirmed = window.confirm(
      `Delete billing cycle "${cycleName}"? Linked settlements will be unlinked but not deleted.`
    );
    if (!confirmed) return;
    const res = await fetch(`/api/bills/${billId}`, { method: "DELETE" });
    if (res.ok) window.location.reload();
    else alert("Failed to delete cycle.");
  };

  const markSettlementAsAdjustment = async (txId: string) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: txId,
        transactionType: "adjustment",
        linkedBillId: null,
      }),
    });
    if (res.ok) window.location.reload();
    else alert("Failed to update transaction type.");
  };

  const handleCreateBill = async () => {
    if (!newBillCardId || !newBillCycleName || !newBillAmount) {
      setNewBillError("Please fill out all required fields.");
      return;
    }
    setNewBillError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: newBillCardId,
          cycleName: newBillCycleName,
          billAmount: parseFloat(newBillAmount) || 0,
        }),
      });
      if (res.ok) {
        setIsDialogOpen(false);
        window.location.reload();
      } else {
        const e = await res.json();
        setNewBillError(e.error || "Failed to create bill.");
      }
    } catch {
      setNewBillError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const ccAllRows = useMemo(() => {
    return allTransactions
      .filter(
        (tx) =>
          tx.statementType === "credit_card" &&
          tx.transactionType !== "excluded"
      )
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [allTransactions]);

  const totalCcNetSpend = useMemo(
    () => ccAllRows.reduce((sum, tx) => sum - tx.amount, 0),
    [ccAllRows]
  );

  const [activeBill, setActiveBill] = useState("");
  useEffect(() => {
    if (bills.length > 0 && !activeBill) setActiveBill(bills[0].id);
  }, [bills, activeBill]);

  const creditCards = banks
    .flatMap((b) => b.cards.map((c) => ({ ...c, bankName: b.name })))
    .filter((c) => c.type === "credit");
  const selectedNewBillCard = creditCards.find((c) => c.id === newBillCardId);

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading credit card cycles…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Bills &amp; Credit Card Cycles
            </h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  New Bill Cycle
                </Button>
              }
            />
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Billing Cycle</DialogTitle>
                <DialogDescription>
                  Create a credit card billing cycle to link bank settlements
                  and prevent double-counting.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium">
                    Credit Card
                  </label>
                  <Select
                    value={newBillCardId}
                    onValueChange={(v) => v && setNewBillCardId(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a card">
                        {selectedNewBillCard
                          ? `${selectedNewBillCard.bankName} - ${
                              selectedNewBillCard.nickname
                            }${
                              selectedNewBillCard.last4
                                ? ` (•${selectedNewBillCard.last4})`
                                : ""
                            }`
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {creditCards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.bankName} - {c.nickname}{" "}
                          {c.last4 && `(•${c.last4})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium">
                    Cycle Name
                  </label>
                  <Input
                    placeholder="e.g. Mar 2026"
                    value={newBillCycleName}
                    onChange={(e) => setNewBillCycleName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium">
                    Bill Amount (INR)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-xs text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      type="number"
                      placeholder="25000"
                      className="pl-7 font-mono"
                      value={newBillAmount}
                      onChange={(e) => setNewBillAmount(e.target.value)}
                    />
                  </div>
                </div>
                {newBillError && (
                  <div className="flex items-center gap-2 rounded-[2px] border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {newBillError}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={handleCreateBill}
                >
                  {isSubmitting ? "Creating…" : "Create Cycle"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Border-joined summary strip */}
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
              After credits and refunds
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Unlinked Settlements
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                unlinkedSettlements.length > 0
                  ? "text-warning"
                  : "text-success"
              }`}
            >
              {unlinkedSettlements.length}
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="bills">Billing Cycles</TabsTrigger>
            <TabsTrigger value="settlements">
              Settlements
              {unlinkedSettlements.length > 0 && (
                <span className="ml-1 rounded-[2px] bg-primary/15 px-1.5 font-mono text-[10px] text-iris-ink">
                  {unlinkedSettlements.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="cc_transactions">CC Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="bills" className="mt-4 space-y-6">
            <section className="overflow-hidden rounded-[4px] border border-border bg-card">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  Active Billing Cycles
                </h2>
              </div>
              {bills.length === 0 ? (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  No billing cycles created yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Card</TableHead>
                      <TableHead>Cycle</TableHead>
                      <TableHead className="text-right">Bill Amount</TableHead>
                      <TableHead className="text-right">Paid So Far</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="pr-5 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((b) => {
                      const totalSettled = b.transactions
                        .filter((t) => t.transactionType === "cc_settlement")
                        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      const isFullySettled =
                        totalSettled >= Math.abs(b.billAmount) || b.isPaid;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="pl-5 text-sm font-medium">
                            {banks.find((bank) => bank.id === b.card?.bankId)
                              ?.name || "Unknown"}{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              ··{b.card?.last4 || b.cardId.slice(-4)}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {b.cycleName}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatINR(b.billAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-success tabular-nums">
                            {formatINR(totalSettled)}
                          </TableCell>
                          <TableCell className="text-right">
                            {isFullySettled ? (
                              <span className="inline-flex items-center gap-1 rounded-[2px] border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[11px] font-medium text-success">
                                <CheckCircle2 className="h-3 w-3" /> Settled
                              </span>
                            ) : (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-[2px] border border-[#e0bf00]/50 bg-[#fffbc2] px-2 py-0.5 font-mono text-[11px] font-medium text-[#614e00] dark:bg-[#2e2600] dark:text-[#faf1a3]">
                                  <Clock className="h-3 w-3" /> Pending
                                </span>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => markAsPaid(b.id, true)}
                                >
                                  Mark Paid
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteCycle(b.id, b.cycleName)}
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>

            {bills.length > 0 && (
              <section className="overflow-hidden rounded-[4px] border border-border bg-card">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="text-sm font-semibold tracking-tight">
                    Cycle Transactions
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Browse credit card purchases cycle by cycle.
                  </p>
                </div>
                <div className="p-5">
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
                        .sort(
                          (a, b) => parseTxnDate(a.date) - parseTxnDate(b.date)
                        );
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
                            <span className="font-mono text-xs text-muted-foreground">
                              Cycle {bill.cycleName} · {cycleRows.length} rows
                            </span>
                            <span className="font-mono text-xs font-semibold tabular-nums">
                              {cycleNetSpend >= 0 ? "Net Spend" : "Net Credit"}{" "}
                              {formatINR(cycleNetSpend)}
                            </span>
                          </div>
                          {cycleRows.length === 0 ? (
                            <p className="py-8 text-center text-xs text-muted-foreground">
                              No linked CC transactions in this cycle.
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
                </div>
              </section>
            )}
          </TabsContent>

          <TabsContent value="settlements" className="mt-4">
            <section className="overflow-hidden rounded-[4px] border border-border bg-card">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  Unlinked Settlements
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Link savings account CC bill payments to their corresponding
                  billing cycle.
                </p>
              </div>
              {unlinkedSettlements.length === 0 ? (
                <div className="p-10 text-center text-xs text-success">
                  All CC settlements are linked.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {unlinkedSettlements.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {tx.narration}
                        </p>
                        <div className="mt-1 flex items-center gap-3 font-mono text-xs text-muted-foreground">
                          <span>{tx.date}</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatINR(tx.amount)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          aria-label={`Select billing cycle for ${tx.narration}`}
                          value={selectedBillByTx[tx.id] ?? ""}
                          onChange={(e) =>
                            setSelectedBillByTx((prev) => ({
                              ...prev,
                              [tx.id]: e.target.value,
                            }))
                          }
                          className="h-7 rounded-[2px] border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                        >
                          <option value="">Select bill cycle…</option>
                          {bills
                            .filter((b) => !b.isPaid)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.cycleName} ({formatINR(b.billAmount)})
                              </option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!selectedBillByTx[tx.id]}
                          onClick={() => {
                            const val = selectedBillByTx[tx.id];
                            if (val) handleLink(val, tx.id);
                          }}
                        >
                          <LinkIcon className="h-3 w-3" /> Link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markSettlementAsAdjustment(tx.id)}
                        >
                          Mark Adjustment
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="cc_transactions" className="mt-4">
            <section className="overflow-hidden rounded-[4px] border border-border bg-card">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold tracking-tight">
                  All Credit Card Transactions
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Latest {Math.min(50, ccAllRows.length)} rows across all cycles
                </p>
              </div>
              {ccAllRows.length === 0 ? (
                <p className="p-10 text-center text-xs text-muted-foreground">
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
                    {ccAllRows.slice(0, 50).map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                          {tx.date}
                        </TableCell>
                        <TableCell className="max-w-[420px] truncate text-xs font-medium">
                          {tx.narration}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {bills.find((b) => b.id === tx.linkedBillId)
                            ?.cycleName || "Unlinked"}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
