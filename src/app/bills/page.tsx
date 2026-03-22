"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Clock, Plus, Link as LinkIcon } from "lucide-react";
import type { CreditCardBill as BillType, Card as CardType, Bank as BankType, Transaction } from "@/lib/types";
import { useAccounts } from "@/lib/store";

export default function BillsPage() {
  const { banks } = useAccounts();
  const [bills, setBills] = useState<(BillType & { card: CardType, transactions: Transaction[] })[]>([]);
  const [unlinkedSettlements, setUnlinkedSettlements] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/bills").then(r => r.json()),
      fetch("/api/transactions").then(r => r.json())
    ]).then(([bData, tData]) => {
      setBills(bData);
      
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
    if (res.ok) {
      window.location.reload();
    }
  };

  const markAsPaid = async (billId: string, isPaid: boolean) => {
    const res = await fetch(`/api/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid }),
    });
    if (res.ok) window.location.reload();
  };

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">Loading bills...</div>;

  return (
    <div className="p-8 space-y-8 max-w-[1200px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Credit Cards</p>
          <h1 className="text-2xl font-semibold tracking-tight">Bills & Settlements</h1>
        </div>
        <Button size="sm" onClick={() => alert("Auto-generated when uploading statements or implement manual creation here!")}>
          <Plus className="h-4 w-4 mr-2" /> New Bill Cycle
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Active Billing Cycles</CardTitle>
            </CardHeader>
            <CardContent>
              {bills.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  No billing cycles created yet. Upload a CC statement to generate one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Card</TableHead>
                      <TableHead className="text-xs">Cycle</TableHead>
                      <TableHead className="text-xs text-right">Bill Amount</TableHead>
                      <TableHead className="text-xs text-right">Paid So Far</TableHead>
                      <TableHead className="text-xs text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map(b => {
                      const totalSettled = b.transactions
                        .filter(t => t.transactionType === "cc_settlement")
                        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                      const isFullySettled = totalSettled >= Math.abs(b.billAmount) || b.isPaid;

                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium text-xs">{banks.find(bank => bank.id === b.card?.bankId)?.name || 'Unknown'} - {b.card?.last4 || b.cardId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.cycleName}</TableCell>
                          <TableCell className="text-right font-mono text-xs">₹{Math.abs(b.billAmount).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600">₹{totalSettled.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {isFullySettled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Settled
                              </span>
                            ) : (
                              <div className="flex items-center gap-2 justify-end">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                                  <Clock className="w-3 h-3" /> Pending
                                </span>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => markAsPaid(b.id, true)}>Mark Paid</Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Unlinked Settlements</CardTitle>
            </CardHeader>
            <CardContent>
              {unlinkedSettlements.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  All settlements are linked.
                </div>
              ) : (
                <div className="space-y-4">
                  {unlinkedSettlements.map(tx => (
                    <div key={tx.id} className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-medium">{tx.narration}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                        </div>
                        <p className="text-xs font-mono font-bold">₹{Math.abs(tx.amount).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <select className="flex-1 text-[10px] h-7 bg-background border rounded px-1" id={`select-${tx.id}`}>
                          <option value="">Select Bill to Link...</option>
                          {bills.filter(b => !b.isPaid).map(b => (
                            <option key={b.id} value={b.id}>{b.cycleName} (₹{Math.abs(b.billAmount)})</option>
                          ))}
                        </select>
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          className="h-7 text-[10px]"
                          onClick={() => {
                            const val = (document.getElementById(`select-${tx.id}`) as HTMLSelectElement).value;
                            if (val) handleLink(val, tx.id);
                          }}
                        >
                          <LinkIcon className="w-3 h-3 mr-1" /> Link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
