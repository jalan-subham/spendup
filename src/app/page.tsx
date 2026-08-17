"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BankBalanceSnapshot, Transaction } from "@/lib/types";
import { useAccounts, useTransactions } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, IndianRupee, Search, TrendingUp, PiggyBank, Landmark, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PIE_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#ef4444", "#22c55e", "#3b82f6", "#ec4899", "#64748b"];

const chartConfig = {
  amount: {
    label: "Amount",
    theme: { light: "hsl(var(--chart-1))", dark: "oklch(0.74 0.17 248)" },
  },
} satisfies ChartConfig;

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

import { parseTxnDate } from "@/lib/date";

function txnMonth(s: string): string {
  const ts = parseTxnDate(s);
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function formatShortDate(s: string): string {
  const ts = parseTxnDate(s);
  if (!ts) return s;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(ts);
}

function monthRange(ym: string): { from: string; to: string } | null {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!year || !month) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

// Sanity check helpers
const ALLOWED_POSITIVE = new Set(["income", "refund", "refund_settlement", "transfer_in"]);
const ALLOWED_NEGATIVE = new Set(["spend", "transfer_out", "investment", "cc_settlement", "income_debit"]);

export default function Home() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const { transactions, loaded: transactionsLoaded } = useTransactions();
  const [snapshots, setSnapshots] = useState<BankBalanceSnapshot[]>([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [recentSearch, setRecentSearch] = useState("");
  const deferredSearch = useDeferredValue(recentSearch);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/balance-snapshots")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: BankBalanceSnapshot[]) => setSnapshots(Array.isArray(rows) ? rows : []))
      .catch(() => setSnapshots([]))
      .finally(() => setSnapshotsLoaded(true));
  }, []);

  // Month picker - default to current month
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => { const m = txnMonth(t.date); if (m) set.add(m); });
    return Array.from(set).sort();
  }, [transactions]);

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultMonth = allMonths.includes(currentYM) ? currentYM : allMonths[allMonths.length - 1] || currentYM;
  const [selectedMonth, setSelectedMonth] = useState("");
  const activeMonth = selectedMonth || defaultMonth;

  const monthIdx = allMonths.indexOf(activeMonth);
  const canPrev = monthIdx > 0;
  const canNext = monthIdx < allMonths.length - 1;
  const goPrev = () => canPrev && setSelectedMonth(allMonths[monthIdx - 1]);
  const goNext = () => canNext && setSelectedMonth(allMonths[monthIdx + 1]);
  const isAllTime = activeMonth === "all";
  const activeMonthRange = !isAllTime ? monthRange(activeMonth) : null;
  const openMonthTransactions = () => {
    if (!activeMonthRange) return;
    const params = new URLSearchParams({ from: activeMonthRange.from, to: activeMonthRange.to });
    window.open(`/month-transactions?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const monthTxns = useMemo(() => {
    if (isAllTime) return transactions.filter((t) => t.transactionType !== "excluded");
    return transactions.filter((t) => txnMonth(t.date) === activeMonth && t.transactionType !== "excluded");
  }, [transactions, activeMonth, isAllTime]);

  // Sanity violations (all-time)
  const sanityViolations = useMemo(() => {
    return transactions.filter((t) => {
      if (t.transactionType === "excluded") return false;
      if (t.amount > 0 && !ALLOWED_POSITIVE.has(t.transactionType)) return true;
      if (t.amount < 0 && !ALLOWED_NEGATIVE.has(t.transactionType)) return true;
      return false;
    });
  }, [transactions]);

  const metrics = useMemo(() => {
    let actualSpend = 0;
    let incomeSum = 0;
    let investSum = 0;
    let ccSettleSum = 0;
    let transferIn = 0;
    let transferOut = 0;
    let refundSum = 0;

    const categoryMap: Record<string, number> = {};
    const dailySpendMap = new Map<string, number>();

    for (const tx of monthTxns) {
      const abs = Math.abs(tx.amount);

      switch (tx.transactionType) {
        case "spend":
          actualSpend += abs;
          // Category breakdown
          if (tx.category && tx.category !== "Other") {
            categoryMap[tx.category] = (categoryMap[tx.category] ?? 0) + abs;
          } else {
            categoryMap["Other"] = (categoryMap["Other"] ?? 0) + abs;
          }
          // Daily spend
          dailySpendMap.set(tx.date, (dailySpendMap.get(tx.date) ?? 0) + abs);
          break;
        case "income":
          incomeSum += abs;
          break;
        case "investment":
          investSum += abs;
          break;
        case "cc_settlement":
          ccSettleSum += abs;
          break;
        case "transfer_in":
          transferIn += abs;
          break;
        case "transfer_out":
          transferOut += abs;
          break;
        case "refund":
        case "refund_settlement":
          refundSum += abs;
          break;
      }
    }

    const netIncome = incomeSum + refundSum;
    const savingsRate = netIncome > 0 ? Math.round(((netIncome - actualSpend) / netIncome) * 100) : 0;

    const categoryData = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    const areaData = Array.from(dailySpendMap.entries())
      .sort((a, b) => parseTxnDate(a[0]) - parseTxnDate(b[0]))
      .map(([date, amount]) => ({ day: formatShortDate(date), amount }));

    return {
      actualSpend,
      netIncome,
      investSum,
      ccSettleSum,
      savingsRate,
      refundSum,
      transferIn,
      transferOut,
      txnCount: monthTxns.length,
      spendCount: monthTxns.filter((t) => t.transactionType === "spend").length,
      categoryData,
      areaData,
    };
  }, [monthTxns]);

  const categoryTransactions = useMemo(() => {
    if (!selectedCategory) return [];
    return monthTxns
      .filter((t) => t.transactionType === "spend" && (t.category || "Other") === selectedCategory)
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date));
  }, [monthTxns, selectedCategory]);

  const recentTransactions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const filtered = query
      ? monthTxns.filter(
          (t) =>
            t.narration.toLowerCase().includes(query) ||
            t.transactionType.toLowerCase().includes(query) ||
            (t.category || "").toLowerCase().includes(query)
        )
      : monthTxns;
    return [...filtered].sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date)).slice(0, 15);
  }, [monthTxns, deferredSearch]);

  const bankBalances = useMemo(() => {
    const latestByBank = new Map<string, Transaction>();
    for (const tx of transactions) {
      if (tx.statementType !== "bank_account" || tx.bankId == null || typeof tx.closingBalance !== "number") continue;
      const existing = latestByBank.get(tx.bankId);
      if (!existing || parseTxnDate(tx.date) > parseTxnDate(existing.date)) {
        latestByBank.set(tx.bankId, tx);
      }
    }

    const latestSnapshotByBank = new Map<string, BankBalanceSnapshot>();
    for (const snap of snapshots) {
      const existing = latestSnapshotByBank.get(snap.bankId);
      if (!existing) {
        latestSnapshotByBank.set(snap.bankId, snap);
        continue;
      }
      const snapTs = parseTxnDate(snap.asOfDate);
      const existingTs = parseTxnDate(existing.asOfDate);
      if (snapTs > existingTs) {
        latestSnapshotByBank.set(snap.bankId, snap);
      } else if (snapTs === existingTs && snap.createdAt > existing.createdAt) {
        latestSnapshotByBank.set(snap.bankId, snap);
      }
    }

    return banks.map((bank) => {
      const latestSnapshot = latestSnapshotByBank.get(bank.id);
      const latest = latestByBank.get(bank.id);
      return {
        bankId: bank.id,
        bankName: bank.name,
        bankColor: bank.color,
        closingBalance: latestSnapshot?.closingBalance ?? latest?.closingBalance,
        asOfDate: latestSnapshot?.asOfDate ?? latest?.date,
      };
    });
  }, [banks, transactions, snapshots]);

  if (!transactionsLoaded || !accountsLoaded || !snapshotsLoaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="mx-auto max-w-[1260px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header with month nav */}
      <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-slate-50 via-background to-emerald-50/70 p-5 shadow-sm dark:from-slate-900/60 dark:via-slate-950 dark:to-emerald-950/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SpendUp</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Financial Overview</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goPrev} disabled={!canPrev || isAllTime}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setSelectedMonth(activeMonth === "all" ? defaultMonth : "all")}
              className="min-w-[120px] rounded-xl border border-border/70 bg-background/80 px-4 py-1.5 text-center text-sm font-semibold tabular-nums backdrop-blur-sm transition-colors hover:bg-muted/60"
            >
              {isAllTime ? "All Time" : monthLabel(activeMonth)}
            </button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={goNext} disabled={!canNext || isAllTime}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={!activeMonthRange}
              onClick={openMonthTransactions}
            >
              View Month Transactions
            </Button>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {metrics.txnCount} transactions · {metrics.spendCount} spends{isAllTime ? " (all time)" : ""}
        </p>
      </div>

      {/* Sanity alert */}
      {sanityViolations.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{sanityViolations.length}</strong> transaction{sanityViolations.length > 1 ? "s have" : " has"} sign/type mismatches.{" "}
            <a href="/sanity" className="underline font-medium">Fix in Sanity →</a>
          </span>
        </div>
      )}

      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-none bg-gradient-to-br from-rose-600 to-rose-700 text-rose-50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide opacity-90">Actual Spend</span>
              <ArrowDownRight className="h-4 w-4 opacity-80" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{formatINR(metrics.actualSpend)}</p>
            <p className="mt-1 text-xs text-rose-200">Goods & services only</p>
          </CardContent>
        </Card>

        <Card className="border-none bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide opacity-90">Income</span>
              <ArrowUpRight className="h-4 w-4 opacity-80" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">{formatINR(metrics.netIncome)}</p>
            <p className="mt-1 text-xs text-emerald-200">Salary + refunds</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 backdrop-blur-sm dark:bg-slate-900/70">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Savings Rate</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${metrics.savingsRate >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {metrics.savingsRate}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">(Income − Spend) / Income</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 backdrop-blur-sm dark:bg-slate-900/70">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Investments</span>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold tabular-nums text-violet-500">{formatINR(metrics.investSum)}</p>
            <p className="mt-1 text-xs text-muted-foreground">SIPs, MFs, stocks</p>
          </CardContent>
        </Card>
      </div>

      {/* Money flow breakdown */}
      <Card className="border-border/70 bg-card/85 backdrop-blur-md dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Money Flow</CardTitle>
          <CardDescription className="text-xs">Where your money went this period. CC settlements are internal movements, not spend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "CC Settlements", amount: metrics.ccSettleSum, color: "text-amber-500", caption: "Internal: bank → card" },
              { label: "Investments", amount: metrics.investSum, color: "text-violet-500", caption: "Capital deployed" },
              { label: "Transfers Out", amount: metrics.transferOut, color: "text-sky-500", caption: "To other accounts" },
              { label: "Transfers In", amount: metrics.transferIn, color: "text-cyan-500", caption: "From other accounts" },
              { label: "Refunds", amount: metrics.refundSum, color: "text-emerald-500", caption: "Money returned" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border/60 bg-background/50 p-3 dark:bg-slate-900/40">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className={`mt-1 text-sm font-semibold tabular-nums ${item.color}`}>{formatINR(item.amount)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{item.caption}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Balances */}
      <Card className="border-border/70 bg-card/80 backdrop-blur-sm dark:bg-slate-900/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Bank Balances</CardTitle>
          <CardDescription className="text-xs">Latest closing balance from uploaded statements.</CardDescription>
        </CardHeader>
        <CardContent>
          {bankBalances.length === 0 ? (
            <div className="text-xs text-muted-foreground">No bank accounts configured yet.</div>
          ) : (
            <div className="space-y-2">
              {bankBalances.map((item) => (
                <div key={item.bankId} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/35 px-3 py-2.5 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.bankColor }} />
                    <div>
                      <p className="text-sm font-medium">{item.bankName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.closingBalance != null ? `As of ${formatShortDate(item.asOfDate!)}` : "No statement data"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {item.closingBalance != null ? formatINR(item.closingBalance) : "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      {monthTxns.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="border-border/70 bg-card/80 backdrop-blur-sm lg:col-span-4 dark:bg-slate-900/70">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold">Daily Spend Trend</CardTitle>
              <CardDescription className="text-xs">Spend per day (goods & services only)</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pt-4">
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <AreaChart data={metrics.areaData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-amount)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-amount)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.45} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => [formatINR(Number(v)), "Spend"]} />} />
                  <Area dataKey="amount" type="monotone" fill="url(#fillAmount)" stroke="var(--color-amount)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 backdrop-blur-sm lg:col-span-3 dark:bg-slate-900/70">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold">Category Breakdown</CardTitle>
              <CardDescription className="text-xs">Where you spent</CardDescription>
            </CardHeader>
            <CardContent className="px-2 pt-4">
              {metrics.categoryData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <PieChart>
                    <Pie data={metrics.categoryData} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} cursor="pointer" onClick={(_: unknown, idx: number) => setSelectedCategory(metrics.categoryData[idx]?.name ?? null)}>
                      {metrics.categoryData.map((entry, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={selectedCategory && selectedCategory !== entry.name ? 0.3 : 1} stroke={selectedCategory === entry.name ? "hsl(var(--foreground))" : "transparent"} strokeWidth={selectedCategory === entry.name ? 2 : 0} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v, name) => [formatINR(Number(v)), name as string]} />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">No spend data</div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1">
                {metrics.categoryData.slice(0, 8).map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => setSelectedCategory(selectedCategory === c.name ? null : c.name)}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-left transition-colors ${selectedCategory === c.name ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {c.name}: {formatINR(c.amount)}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Category drill-down */}
      {selectedCategory && (
        <Card className="border-border/70 bg-card/80 backdrop-blur-sm dark:bg-slate-900/70">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">{selectedCategory}</CardTitle>
              <CardDescription className="text-xs">
                {categoryTransactions.length} transaction{categoryTransactions.length !== 1 ? "s" : ""} · {formatINR(categoryTransactions.reduce((s, t) => s + Math.abs(t.amount), 0))} total
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedCategory(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-y hover:bg-transparent">
                  <TableHead className="pl-6 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Payment</TableHead>
                  <TableHead className="pr-6 text-right text-xs">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">{formatShortDate(tx.date)}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm font-medium">{tx.narration}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {tx.paymentMethod || "Other"}
                      </span>
                    </TableCell>
                    <TableCell className="pr-6 text-right text-sm font-medium tabular-nums">
                      {formatINR(tx.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                {categoryTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-xs text-muted-foreground">No transactions.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent transactions */}
      {monthTxns.length > 0 && (
        <Card className="border-border/70 bg-card/80 backdrop-blur-sm dark:bg-slate-900/70">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
              <CardDescription className="text-xs">{isAllTime ? "All time" : monthLabel(activeMonth)}</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                value={recentSearch}
                onChange={(e) => setRecentSearch(e.target.value)}
                placeholder="Search..."
                className="h-8 w-[200px] pl-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-y hover:bg-transparent">
                  <TableHead className="pl-6 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="pr-6 text-right text-xs">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-16 text-center text-xs text-muted-foreground">
                      No transactions match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentTransactions.map((tx) => {
                    const typeColors: Record<string, string> = {
                      spend: "", income: "text-emerald-500", refund: "text-emerald-500", refund_settlement: "text-emerald-500",
                      cc_settlement: "text-amber-500", investment: "text-violet-500", transfer_in: "text-cyan-500",
                      transfer_out: "text-sky-500", income_debit: "text-orange-500",
                    };
                    const typeLabels: Record<string, string> = {
                      spend: "Spend", income: "Income", refund: "Refund", refund_settlement: "Refund",
                      cc_settlement: "CC Payment", investment: "Invest", transfer_in: "Transfer In",
                      transfer_out: "Transfer Out", income_debit: "Income Debit", adjustment: "Adjustment",
                    };
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="pl-6 font-mono text-xs text-muted-foreground">{formatShortDate(tx.date)}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm font-medium">{tx.narration}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium ${typeColors[tx.transactionType] || "text-muted-foreground"}`}>
                            {typeLabels[tx.transactionType] || tx.transactionType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {tx.category || "Uncategorized"}
                          </span>
                        </TableCell>
                        <TableCell className={`pr-6 text-right text-sm font-medium tabular-nums ${tx.amount < 0 ? "text-foreground" : "text-emerald-500"}`}>
                          {tx.amount < 0 ? `-${formatINR(tx.amount)}` : `+${formatINR(tx.amount)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {transactions.length === 0 && (
        <Card className="border-dashed border-border/70 bg-muted/25">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
            <IndianRupee className="h-8 w-8 opacity-20" />
            <div>
              <p className="text-sm font-medium">No spending data</p>
              <p className="mt-1 text-xs">Upload a statement to populate your dashboard charts.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
