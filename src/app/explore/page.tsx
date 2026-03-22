"use client";

import { useEffect, useState, useMemo } from "react";
import type { Transaction, TransactionType } from "@/lib/types";
import { useAccounts } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function parseDDMMYY(s: string) {
  if (!s) return 0;
  const [d, m, y] = s.split("/");
  return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
}

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  spend: "Spend",
  income: "Income",
  income_debit: "Income Debit",
  cc_settlement: "CC Settlement",
  investment: "Investment",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  refund: "Refund",
  refund_settlement: "Refund Settlement",
};

const TYPE_COLORS: Partial<Record<TransactionType, string>> = {
  spend: "text-destructive",
  income: "text-emerald-600",
  income_debit: "text-orange-500",
  refund_settlement: "text-emerald-600",
  refund: "text-emerald-500",
  cc_settlement: "text-violet-500",
  investment: "text-blue-500",
  transfer_in: "text-sky-600",
  transfer_out: "text-sky-400",
};

export default function ExplorePage() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBank, setFilterBank] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  useEffect(() => {
    fetch("/api/transactions")
      .then(r => r.ok ? r.json() : [])
      .then((data: Transaction[]) => setTransactions(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Derive unique category list
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => { if (t.category) cats.add(t.category); });
    return Array.from(cats).sort();
  }, [transactions]);

  // Apply filters
  const filtered = useMemo(() => {
    const fromTs = filterDateFrom ? new Date(filterDateFrom).getTime() : 0;
    const toTs = filterDateTo ? new Date(filterDateTo).getTime() + 86399999 : Infinity;

    return transactions
      .filter(t => {
        if (filterType !== "all" && t.transactionType !== filterType) return false;
        if (filterBank !== "all" && t.bankId !== filterBank) return false;
        if (filterCategory !== "all" && (t.category || "Uncategorized") !== filterCategory) return false;
        const txTs = parseDDMMYY(t.date);
        if (txTs < fromTs || txTs > toTs) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!t.narration?.toLowerCase().includes(q) && !t.refNo?.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => parseDDMMYY(b.date) - parseDDMMYY(a.date));
  }, [transactions, filterType, filterBank, filterCategory, filterDateFrom, filterDateTo, search]);

  // Summary from current filtered set
  const summary = useMemo(() => {
    let inflow = 0, outflow = 0;
    filtered.forEach(t => {
      if (t.amount > 0) inflow += t.amount;
      else outflow += Math.abs(t.amount);
    });
    return { inflow, outflow, net: inflow - outflow, count: filtered.length };
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setFilterBank("all");
    setFilterCategory("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasActiveFilters = search || filterType !== "all" || filterBank !== "all" || filterCategory !== "all" || filterDateFrom || filterDateTo;

  const getBankName = (bankId?: string) => banks.find(b => b.id === bankId)?.name ?? "—";
  const getBankColor = (bankId?: string) => banks.find(b => b.id === bankId)?.color ?? "#999";

  if (!loaded || !accountsLoaded) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Deep Dive</p>
        <h1 className="text-2xl font-semibold tracking-tight">Explore Transactions</h1>
      </div>

      {/* ── Filter Bar ───────────────────────── */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Search</label>
            <Input
              placeholder="Narration or ref no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Type */}
          <div className="min-w-[160px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(TX_TYPE_LABELS) as TransactionType[]).map(k => (
                  <SelectItem key={k} value={k}>{TX_TYPE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bank */}
          <div className="min-w-[140px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Bank</label>
            <Select value={filterBank} onValueChange={setFilterBank}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All banks</SelectItem>
                {banks.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="min-w-[140px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                {allCategories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date From */}
          <div className="min-w-[130px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">From</label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Date To */}
          <div className="min-w-[130px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">To</label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-muted-foreground self-end">
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Results Table ─────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24 text-xs">Date</TableHead>
                <TableHead className="text-xs">Narration</TableHead>
                <TableHead className="w-28 text-xs">Bank</TableHead>
                <TableHead className="w-36 text-xs">Type</TableHead>
                <TableHead className="w-24 text-xs">Payment</TableHead>
                <TableHead className="w-32 text-xs">Category</TableHead>
                <TableHead className="w-32 text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16 text-sm">
                    No transactions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(t => {
                  const amtColor = TYPE_COLORS[t.transactionType] ?? (t.amount < 0 ? "text-destructive" : "text-emerald-600");
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">{t.date}</TableCell>
                      <TableCell className="text-sm max-w-[320px]">
                        <p className="truncate font-medium" title={t.narration}>{t.narration}</p>
                        {t.refNo && <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{t.refNo}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getBankColor(t.bankId) }} />
                          <span className="truncate">{getBankName(t.bankId)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${amtColor}`}>
                          {TX_TYPE_LABELS[t.transactionType]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                          {t.paymentMethod || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t.category ? (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground">
                            {t.category}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${amtColor}`}>
                        {t.amount < 0 ? "−" : "+"}{formatINR(t.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-muted/50">
                <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
                  {summary.count} row{summary.count !== 1 ? "s" : ""} &nbsp;·&nbsp;
                  <span className="text-emerald-600">+{formatINR(summary.inflow)} in</span>
                  &nbsp;·&nbsp;
                  <span className="text-destructive">−{formatINR(summary.outflow)} out</span>
                </TableCell>
                <TableCell className={`text-right font-mono font-bold text-sm ${summary.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {summary.net >= 0 ? "+" : "−"}{formatINR(summary.net)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>
    </div>
  );
}
