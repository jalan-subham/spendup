"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Plus, Link as LinkIcon, AlertCircle, Trash2, CreditCard } from "lucide-react";
import type { CreditCardBill as BillType, Card as CardType, Bank as BankType, Transaction } from "@/lib/types";
import { useAccounts } from "@/lib/store";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(amount));
}

import { parseTxnDate } from "@/lib/date";

export default function BillsPage() {
  const { banks } = useAccounts();
  const [bills, setBills] = useState<(BillType & { card: CardType, transactions: Transaction[] })[]>([]);
  const [unlinkedSettlements, setUnlinkedSettlements] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("bills");

  // New Bill Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBillCardId, setNewBillCardId] = useState("");
  const [newBillCycleName, setNewBillCycleName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillError, setNewBillError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/bills").then(r => r.json()),
      fetch("/api/transactions").then(r => r.json())
    ]).then(([bData, tData]) => {
      setBills(bData);
      setAllTransactions(tData as Transaction[]);
      const unlinked = (tData as Transaction[]).filter(
        t => t.transactionType === "cc_settlement" && !t.linkedBillId
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
    const confirmed = window.confirm(`Delete billing cycle "${cycleName}"? Linked settlements will be unlinked but not deleted.`);
    if (!confirmed) return;
    const res = await fetch(`/api/bills/${billId}`, { method: "DELETE" });
    if (res.ok) window.location.reload();
    else alert("Failed to delete cycle.");
  };

  const markSettlementAsAdjustment = async (txId: string) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, transactionType: "adjustment", linkedBillId: null }),
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
        body: JSON.stringify({ cardId: newBillCardId, cycleName: newBillCycleName, billAmount: parseFloat(newBillAmount) || 0 }),
      });
      if (res.ok) { setIsDialogOpen(false); window.location.reload(); }
      else { const e = await res.json(); setNewBillError(e.error || "Failed to create bill."); }
    } catch { setNewBillError("An unexpected error occurred."); }
    finally { setIsSubmitting(false); }
  };

  // CC transaction view data (merged from /credit-cards)
  const ccAllRows = useMemo(() => {
    return allTransactions
      .filter(tx => tx.statementType === "credit_card" && tx.transactionType !== "excluded")
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [allTransactions]);

  const totalCcNetSpend = useMemo(() => ccAllRows.reduce((sum, tx) => sum - tx.amount, 0), [ccAllRows]);

  const [activeBill, setActiveBill] = useState("");
  useEffect(() => { if (bills.length > 0 && !activeBill) setActiveBill(bills[0].id); }, [bills, activeBill]);

  const creditCards = banks.flatMap(b => b.cards.map(c => ({ ...c, bankName: b.name }))).filter(c => c.type === "credit");
  const selectedNewBillCard = creditCards.find(c => c.id === newBillCardId);

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">Loading bills...</div>;

  return (
    <div className="p-8 space-y-6 max-w-[1300px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Credit Cards</p>
          <h1 className="text-2xl font-semibold tracking-tight">Bills & Credit Card Cycles</h1>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={<Button size="sm"><Plus className="h-4 w-4 mr-2" />New Bill Cycle</Button>} />
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create Billing Cycle</DialogTitle>
              <DialogDescription>Manually create a new credit card bill. You can link settlements to it later.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Credit Card</label>
                <div className="col-span-3">
                  <Select value={newBillCardId} onValueChange={(v) => v && setNewBillCardId(v)}>
                    <SelectTrigger><SelectValue placeholder="Select a card">{selectedNewBillCard ? `${selectedNewBillCard.bankName} - ${selectedNewBillCard.nickname}${selectedNewBillCard.last4 ? ` (•${selectedNewBillCard.last4})` : ""}` : undefined}</SelectValue></SelectTrigger>
                    <SelectContent>{creditCards.map(c => (<SelectItem key={c.id} value={c.id}>{c.bankName} - {c.nickname} {c.last4 && `(•${c.last4})`}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Cycle Name</label>
                <div className="col-span-3"><Input placeholder="e.g. Mar 2026" value={newBillCycleName} onChange={e => setNewBillCycleName(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm">Bill Amount</label>
                <div className="col-span-3 relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">₹</div>
                  <Input type="number" placeholder="25000" className="pl-8" value={newBillAmount} onChange={e => setNewBillAmount(e.target.value)} />
                </div>
              </div>
              {newBillError && (<div className="bg-destructive/10 text-destructive text-sm p-3 rounded flex items-center gap-2"><AlertCircle size={14} />{newBillError}</div>)}
            </div>
            <DialogFooter><Button type="submit" disabled={isSubmitting} onClick={handleCreateBill}>{isSubmitting ? "Creating..." : "Create Cycle"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total CC Transactions</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{ccAllRows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net CC Spend</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{totalCcNetSpend >= 0 ? formatINR(totalCcNetSpend) : `-${formatINR(totalCcNetSpend)}`}</p>
            <p className="text-[10px] text-muted-foreground mt-1">After credits/refunds</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unlinked Settlements</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{unlinkedSettlements.length}</p></CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bills">Billing Cycles</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="cc_transactions">CC Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="space-y-6 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Active Billing Cycles</CardTitle></CardHeader>
            <CardContent>
              {bills.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">No billing cycles created yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Card</TableHead>
                      <TableHead className="text-xs">Cycle</TableHead>
                      <TableHead className="text-xs text-right">Bill Amount</TableHead>
                      <TableHead className="text-xs text-right">Paid So Far</TableHead>
                      <TableHead className="text-xs text-right">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map(b => {
                      const totalSettled = b.transactions.filter(t => t.transactionType === "cc_settlement").reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      const isFullySettled = totalSettled >= Math.abs(b.billAmount) || b.isPaid;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium text-xs">{banks.find(bank => bank.id === b.card?.bankId)?.name || 'Unknown'} - {b.card?.last4 || b.cardId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.cycleName}</TableCell>
                          <TableCell className="text-right font-mono text-xs">₹{Math.abs(b.billAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600">₹{totalSettled.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {isFullySettled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Settled</span>
                            ) : (
                              <div className="flex items-center gap-2 justify-end">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full whitespace-nowrap"><Clock className="w-3 h-3" /> Pending</span>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 ml-1" onClick={() => markAsPaid(b.id, true)}>Mark Paid</Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive hover:text-destructive" onClick={() => deleteCycle(b.id, b.cycleName)}>
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Cycle detail view */}
          {bills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cycle Transactions</CardTitle>
                <CardDescription className="text-xs">Browse CC transactions cycle by cycle</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeBill} onValueChange={setActiveBill} className="space-y-4">
                  <TabsList className="flex flex-wrap h-auto">
                    {bills.map(bill => {
                      const card = banks.flatMap(b => b.cards).find(c => c.id === bill.cardId);
                      return (<TabsTrigger key={bill.id} value={bill.id} className="text-xs">{bill.cycleName}{card?.last4 ? ` · •${card.last4}` : ""}</TabsTrigger>);
                    })}
                  </TabsList>
                  {bills.map(bill => {
                    const cycleRows = [...(bill.transactions || [])].filter(tx => tx.statementType === "credit_card" && tx.transactionType !== "excluded").sort((a, b) => parseTxnDate(a.date) - parseTxnDate(b.date));
                    const cycleNetSpend = cycleRows.reduce((sum, tx) => sum - tx.amount, 0);
                    return (
                      <TabsContent key={bill.id} value={bill.id} className="space-y-3">
                        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Cycle {bill.cycleName} · {cycleRows.length} rows</p>
                          <p className="text-xs font-semibold">{cycleNetSpend >= 0 ? "Net Spend" : "Net Credit"} {formatINR(cycleNetSpend)}</p>
                        </div>
                        {cycleRows.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-8 text-center">No linked CC transactions in this cycle.</p>
                        ) : (
                          <Table>
                            <TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Narration</TableHead><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {cycleRows.map(tx => (<TableRow key={tx.id}><TableCell className="text-xs font-mono text-muted-foreground">{tx.date}</TableCell><TableCell className="text-xs font-medium max-w-[420px] truncate">{tx.narration}</TableCell><TableCell className="text-[10px] text-muted-foreground uppercase tracking-wide">{tx.transactionType}</TableCell><TableCell className="text-xs text-right font-medium">{tx.amount < 0 ? "−" : "+"}{formatINR(tx.amount)}</TableCell></TableRow>))}
                            </TableBody>
                          </Table>
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settlements" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Unlinked Settlements</CardTitle></CardHeader>
            <CardContent>
              {unlinkedSettlements.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">All settlements are linked.</div>
              ) : (
                <div className="space-y-4">
                  {unlinkedSettlements.map(tx => (
                    <div key={tx.id} className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
                      <div className="flex justify-between items-start">
                        <div><p className="text-xs font-medium">{tx.narration}</p><p className="text-[10px] text-muted-foreground">{tx.date}</p></div>
                        <p className="text-xs font-mono font-bold">₹{Math.abs(tx.amount).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <select className="flex-1 text-[10px] h-7 bg-background border rounded px-1" id={`select-${tx.id}`}>
                          <option value="">Select Bill to Link...</option>
                          {bills.filter(b => !b.isPaid).map(b => (<option key={b.id} value={b.id}>{b.cycleName} (₹{Math.abs(b.billAmount)})</option>))}
                        </select>
                        <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => { const val = (document.getElementById(`select-${tx.id}`) as HTMLSelectElement).value; if (val) handleLink(val, tx.id); }}>
                          <LinkIcon className="w-3 h-3 mr-1" /> Link
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => markSettlementAsAdjustment(tx.id)}>Mark Adjustment</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cc_transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">All CC Transactions</CardTitle>
              <CardDescription className="text-xs">Every credit card transaction across all cycles</CardDescription>
            </CardHeader>
            <CardContent>
              {ccAllRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No credit-card transactions imported yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Narration</TableHead><TableHead className="text-xs">Cycle</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ccAllRows.slice(0, 50).map(tx => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs font-mono text-muted-foreground">{tx.date}</TableCell>
                        <TableCell className="text-xs font-medium max-w-[420px] truncate">{tx.narration}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{bills.find(b => b.id === tx.linkedBillId)?.cycleName || "Unlinked"}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{tx.amount < 0 ? "−" : "+"}{formatINR(tx.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
