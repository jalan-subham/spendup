"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BankBalanceSnapshot, Transaction } from "@/lib/types";
import { useAccounts, useTransactions } from "@/lib/store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseTxnDate } from "@/lib/date";

const PIE_COLORS = [
  "#6c35f5",
  "#0b7d55",
  "#0088e5",
  "#d67f2e",
  "#b500bf",
  "#cf3f48",
  "#581ccb",
  "#6b6b6b",
];

const chartConfig = {
  amount: {
    label: "Spend",
    theme: { light: "#6c35f5", dark: "#968dfa" },
  },
} satisfies ChartConfig;

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function txnMonth(s: string): string {
  const ts = parseTxnDate(s);
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function formatShortDate(s: string): string {
  const ts = parseTxnDate(s);
  if (!ts) return s;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(ts);
}

function monthRange(ym: string): { from: string; to: string } | null {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!year || !month) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

const ALLOWED_POSITIVE = new Set([
  "income",
  "refund",
  "refund_settlement",
  "transfer_in",
]);
const ALLOWED_NEGATIVE = new Set([
  "spend",
  "transfer_out",
  "investment",
  "cc_settlement",
  "income_debit",
]);

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
      .then((rows: BankBalanceSnapshot[]) =>
        setSnapshots(Array.isArray(rows) ? rows : [])
      )
      .catch(() => setSnapshots([]))
      .finally(() => setSnapshotsLoaded(true));
  }, []);

  const allMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      const m = txnMonth(t.date);
      if (m) set.add(m);
    });
    return Array.from(set).sort();
  }, [transactions]);

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const defaultMonth = allMonths.includes(currentYM)
    ? currentYM
    : allMonths[allMonths.length - 1] || currentYM;
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
    const params = new URLSearchParams({
      from: activeMonthRange.from,
      to: activeMonthRange.to,
    });
    window.open(
      `/month-transactions?${params.toString()}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const monthTxns = useMemo(() => {
    if (isAllTime)
      return transactions.filter((t) => t.transactionType !== "excluded");
    return transactions.filter(
      (t) => txnMonth(t.date) === activeMonth && t.transactionType !== "excluded"
    );
  }, [transactions, activeMonth, isAllTime]);

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
          if (tx.category && tx.category !== "Other") {
            categoryMap[tx.category] = (categoryMap[tx.category] ?? 0) + abs;
          } else {
            categoryMap["Other"] = (categoryMap["Other"] ?? 0) + abs;
          }
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
    const savingsRate =
      netIncome > 0
        ? Math.round(((netIncome - actualSpend) / netIncome) * 100)
        : 0;

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
      .filter(
        (t) =>
          t.transactionType === "spend" &&
          (t.category || "Other") === selectedCategory
      )
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
    return [...filtered]
      .sort((a, b) => parseTxnDate(b.date) - parseTxnDate(a.date))
      .slice(0, 15);
  }, [monthTxns, deferredSearch]);

  const bankBalances = useMemo(() => {
    const latestByBank = new Map<string, Transaction>();
    for (const tx of transactions) {
      if (
        tx.statementType !== "bank_account" ||
        tx.bankId == null ||
        typeof tx.closingBalance !== "number"
      )
        continue;
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
        closingBalance:
          latestSnapshot?.closingBalance ?? latest?.closingBalance,
        asOfDate: latestSnapshot?.asOfDate ?? latest?.date,
      };
    });
  }, [banks, transactions, snapshots]);

  const totalVerifiedBalance = useMemo(() => {
    return bankBalances.reduce(
      (sum, item) => sum + (item.closingBalance ?? 0),
      0
    );
  }, [bankBalances]);

  const bankMap = useMemo(() => {
    return new Map(banks.map((b) => [b.id, b]));
  }, [banks]);

  if (!transactionsLoaded || !accountsLoaded || !snapshotsLoaded) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <div className="h-14 border-b border-border" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-[4px] border border-border bg-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top command bar */}
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Financial Overview
            </h1>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {metrics.txnCount} txns · {metrics.spendCount} spends
              {isAllTime ? " (all)" : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-[2px] border border-border bg-secondary">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goPrev}
                disabled={!canPrev || isAllTime}
                aria-label="Previous month"
                className="rounded-none border-r border-border"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <button
                type="button"
                onClick={() =>
                  setSelectedMonth(activeMonth === "all" ? defaultMonth : "all")
                }
                title="Click to toggle All Time"
                className="min-w-[112px] px-3 py-1 text-center font-mono text-xs font-medium tabular-nums transition-colors hover:bg-muted"
              >
                {isAllTime ? "All Time" : monthLabel(activeMonth)}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goNext}
                disabled={!canNext || isAllTime}
                aria-label="Next month"
                className="rounded-none border-l border-border"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={!activeMonthRange}
              onClick={openMonthTransactions}
            >
              Month Ledger
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>

            <Link
              href="/transactions"
              className="inline-flex h-7 items-center gap-1.5 rounded-[2px] bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors duration-120 hover:bg-[#581ccb] dark:hover:bg-[#7e64fb]"
            >
              <Plus className="h-3.5 w-3.5" />
              Import Statement
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Sanity alert strip */}
        {sanityViolations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#e0bf00]/60 bg-[#fffbc2] px-4 py-2.5 text-xs text-[#614e00] dark:border-[#ecd60e]/30 dark:bg-[#2e2600]/60 dark:text-[#faf1a3]">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold tabular-nums">
                  {sanityViolations.length}
                </strong>{" "}
                transaction{sanityViolations.length > 1 ? "s have" : " has"}{" "}
                sign/type mismatches awaiting audit.
              </span>
            </div>
            <Link
              href="/sanity"
              className="font-mono font-semibold underline underline-offset-3 hover:opacity-80"
            >
              Review in Sanity →
            </Link>
          </div>
        )}

        {/* Border-joined 4-cell KPI grid */}
        <section
          aria-label="Monthly summary metrics"
          data-slot="kpi-grid"
          className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-[4px] border border-border bg-card lg:grid-cols-4 lg:divide-x lg:divide-y-0"
        >
          <div className="p-5 odd:border-r odd:border-border lg:odd:border-r-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Actual Spend
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
              {formatINR(metrics.actualSpend)}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Goods &amp; services only
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Net Income
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-success tabular-nums">
              {formatINR(metrics.netIncome)}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Salary + {formatINR(metrics.refundSum)} refunds
            </div>
          </div>

          <div className="p-5 odd:border-r odd:border-border lg:odd:border-r-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Savings Rate
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${
                metrics.savingsRate >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {metrics.savingsRate}%
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              (Income − Spend) / Income
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Investments
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-iris-ink tabular-nums">
              {formatINR(metrics.investSum)}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              SIPs, MFs &amp; equities
            </div>
          </div>
        </section>

        {/* Horizontal Reconciliation & Money-Flow Pipeline */}
        <section
          aria-label="Reconciliation and money flow pipeline"
          className="overflow-hidden rounded-[4px] border border-border bg-secondary"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h2 className="text-xs font-semibold tracking-tight">
              Reconciliation &amp; Money Flow
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              CC settlements excluded from net spend
            </span>
          </div>
          <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
            {[
              {
                label: "Income Inflow",
                amount: metrics.netIncome,
                dot: "bg-success",
                caption: "Credits & refunds",
              },
              {
                label: "CC Settlements",
                amount: metrics.ccSettleSum,
                dot: "bg-primary",
                caption: "Internal: bank → card",
              },
              {
                label: "Transfers Out",
                amount: metrics.transferOut,
                dot: "bg-[#0088e5] dark:bg-[#70c5ff]",
                caption: "To other accounts",
              },
              {
                label: "Transfers In",
                amount: metrics.transferIn,
                dot: "bg-[#0088e5] dark:bg-[#70c5ff]",
                caption: "From other accounts",
              },
              {
                label: "Verified Balances",
                amount: totalVerifiedBalance,
                dot:
                  bankBalances.some((b) => b.closingBalance != null)
                    ? "bg-success"
                    : "bg-muted-foreground",
                caption: `${bankBalances.length} bank account${
                  bankBalances.length === 1 ? "" : "s"
                }`,
              },
            ].map((node) => (
              <div key={node.label} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${node.dot}`} />
                  <span>{node.label}</span>
                </div>
                <div className="mt-1.5 font-mono text-sm font-semibold tabular-nums">
                  {formatINR(node.amount)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {node.caption}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Empty state when no transactions exist */}
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[4px] border border-dashed border-border bg-secondary/50 px-6 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-border bg-background">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <h2 className="mt-4 text-base font-semibold tracking-tight">
              No statements imported yet
            </h2>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Add your bank accounts in Settings, then upload an HDFC text
              export, ICICI Excel sheet, or encrypted credit card PDF to
              populate your ledger.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <Link
                href="/settings"
                className="inline-flex h-8 items-center rounded-[2px] border border-border bg-background px-3 text-xs font-medium hover:bg-secondary"
              >
                Configure Banks
              </Link>
              <Link
                href="/transactions"
                className="inline-flex h-8 items-center rounded-[2px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-[#581ccb]"
              >
                Import First Statement
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Work grid: Daily Spend + Verified Balances & Category Breakdown */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Daily Spend Area Chart */}
              <div className="rounded-[4px] border border-border bg-card lg:col-span-7">
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Daily Spend Trend
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Settled goods &amp; services per day
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {isAllTime ? "All Time" : monthLabel(activeMonth)}
                  </span>
                </div>
                <div className="p-4">
                  {metrics.areaData.length > 0 ? (
                    <ChartContainer
                      config={chartConfig}
                      className="h-[230px] w-full"
                    >
                      <AreaChart
                        data={metrics.areaData}
                        margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="spendFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-amount)"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-amount)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--border)"
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          dataKey="day"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          className="font-mono text-[10px]"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          className="font-mono text-[10px]"
                          tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(v) => [formatINR(Number(v)), "Spend"]}
                            />
                          }
                        />
                        <Area
                          dataKey="amount"
                          type="monotone"
                          fill="url(#spendFill)"
                          stroke="var(--color-amount)"
                          strokeWidth={1.75}
                        />
                      </AreaChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex h-[230px] items-center justify-center text-xs text-muted-foreground">
                      No daily spend data for this period.
                    </div>
                  )}
                </div>
              </div>

              {/* Bank Balances & Category Breakdown */}
              <div className="flex flex-col gap-4 lg:col-span-5">
                {/* Bank Balances */}
                <div className="rounded-[4px] border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Bank Balances
                    </h2>
                    <Link
                      href="/snapshots"
                      className="text-xs font-medium text-iris-ink hover:underline"
                    >
                      Snapshots →
                    </Link>
                  </div>
                  {bankBalances.length === 0 ? (
                    <div className="px-5 py-6 text-xs text-muted-foreground">
                      No bank accounts configured yet.{" "}
                      <Link href="/settings" className="text-iris-ink underline">
                        Add bank
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {bankBalances.map((item) => (
                        <div
                          key={item.bankId}
                          className="flex items-center justify-between px-5 py-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                              style={{ backgroundColor: item.bankColor }}
                            />
                            <div>
                              <div className="text-sm font-medium">
                                {item.bankName}
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {item.closingBalance != null && item.asOfDate
                                  ? `As of ${formatShortDate(item.asOfDate)}`
                                  : "No statement data"}
                              </div>
                            </div>
                          </div>
                          <div className="font-mono text-sm font-semibold tabular-nums">
                            {item.closingBalance != null
                              ? formatINR(item.closingBalance)
                              : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category Breakdown */}
                <div className="flex-1 rounded-[4px] border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Category Breakdown
                    </h2>
                    {selectedCategory && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className="font-mono text-[11px] text-iris-ink hover:underline"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                  {metrics.categoryData.length > 0 ? (
                    <div className="grid grid-cols-1 items-center gap-3 p-4 sm:grid-cols-2">
                      <ChartContainer
                        config={chartConfig}
                        className="h-[150px] w-full"
                      >
                        <PieChart>
                          <Pie
                            data={metrics.categoryData}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={38}
                            outerRadius={64}
                            paddingAngle={2}
                            cursor="pointer"
                            onClick={(_: unknown, idx: number) => {
                              const next = metrics.categoryData[idx]?.name ?? null;
                              setSelectedCategory(
                                selectedCategory === next ? null : next
                              );
                            }}
                          >
                            {metrics.categoryData.map((entry, i) => (
                              <Cell
                                key={entry.name}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                                opacity={
                                  selectedCategory &&
                                  selectedCategory !== entry.name
                                    ? 0.25
                                    : 1
                                }
                                stroke={
                                  selectedCategory === entry.name
                                    ? "var(--foreground)"
                                    : "transparent"
                                }
                                strokeWidth={
                                  selectedCategory === entry.name ? 1.5 : 0
                                }
                              />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                hideLabel
                                formatter={(v, name) => [
                                  formatINR(Number(v)),
                                  name as string,
                                ]}
                              />
                            }
                          />
                        </PieChart>
                      </ChartContainer>
                      <div className="space-y-1">
                        {metrics.categoryData.slice(0, 6).map((c, i) => {
                          const active = selectedCategory === c.name;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() =>
                                setSelectedCategory(active ? null : c.name)
                              }
                              className={`flex w-full items-center justify-between rounded-[2px] px-2 py-1 text-left text-xs transition-colors duration-100 ${
                                active
                                  ? "bg-accent text-accent-foreground font-semibold"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              }`}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-[1px]"
                                  style={{
                                    backgroundColor:
                                      PIE_COLORS[i % PIE_COLORS.length],
                                  }}
                                />
                                <span className="truncate">{c.name}</span>
                              </span>
                              <span className="ml-2 font-mono text-[11px] tabular-nums">
                                {formatINR(c.amount)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[150px] items-center justify-center text-xs text-muted-foreground">
                      No spend categories this period.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Category drill-down */}
            {selectedCategory && (
              <section className="overflow-hidden rounded-[4px] border border-primary/40 bg-card">
                <div className="flex items-center justify-between border-b border-border bg-accent/60 px-5 py-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      {selectedCategory}
                    </h2>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {categoryTransactions.length} transaction
                      {categoryTransactions.length !== 1 ? "s" : ""} ·{" "}
                      {formatINR(
                        categoryTransactions.reduce(
                          (s, t) => s + Math.abs(t.amount),
                          0
                        )
                      )}{" "}
                      total
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedCategory(null)}
                    aria-label="Close category breakdown"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="pr-5 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                          {formatShortDate(tx.date)}
                        </TableCell>
                        <TableCell className="max-w-[340px] truncate text-sm font-medium">
                          {tx.narration}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-[2px] border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {tx.paymentMethod || "Other"}
                          </span>
                        </TableCell>
                        <TableCell className="pr-5 text-right font-mono text-sm font-medium tabular-nums">
                          {formatINR(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {/* Recent Audited Transactions */}
            {monthTxns.length > 0 && (
              <section className="overflow-hidden rounded-[4px] border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Recent Transactions
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {isAllTime ? "All time" : monthLabel(activeMonth)} ·{" "}
                      Showing latest {recentTransactions.length}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="search"
                      value={recentSearch}
                      onChange={(e) => setRecentSearch(e.target.value)}
                      placeholder="Filter narration or category…"
                      className="h-8 w-[220px] pl-8 text-xs"
                    />
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="pr-5 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-20 text-center text-xs text-muted-foreground"
                        >
                          No transactions match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentTransactions.map((tx) => {
                        const bank = tx.bankId ? bankMap.get(tx.bankId) : undefined;
                        const typeBadge: Record<
                          string,
                          { label: string; cls: string }
                        > = {
                          spend: {
                            label: "Spend",
                            cls: "border-border text-foreground",
                          },
                          income: {
                            label: "Income",
                            cls: "border-success/40 bg-success/10 text-success",
                          },
                          refund: {
                            label: "Refund",
                            cls: "border-success/40 bg-success/10 text-success",
                          },
                          refund_settlement: {
                            label: "Refund",
                            cls: "border-success/40 bg-success/10 text-success",
                          },
                          cc_settlement: {
                            label: "CC Settlement",
                            cls: "border-primary/40 bg-accent text-accent-foreground",
                          },
                          investment: {
                            label: "Invest",
                            cls: "border-primary/30 text-iris-ink",
                          },
                          transfer_in: {
                            label: "Transfer In",
                            cls: "border-[#0088e5]/30 text-[#005e9e] dark:text-[#70c5ff]",
                          },
                          transfer_out: {
                            label: "Transfer Out",
                            cls: "border-[#0088e5]/30 text-[#005e9e] dark:text-[#70c5ff]",
                          },
                          income_debit: {
                            label: "Income Debit",
                            cls: "border-destructive/40 text-destructive",
                          },
                        };
                        const badge = typeBadge[tx.transactionType] ?? {
                          label: tx.transactionType,
                          cls: "border-border text-muted-foreground",
                        };

                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                              {formatShortDate(tx.date)}
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate text-sm font-medium">
                              {tx.narration}
                            </TableCell>
                            <TableCell>
                              {bank ? (
                                <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium">
                                  <span
                                    className="h-1.5 w-1.5 rounded-[1px]"
                                    style={{ backgroundColor: bank.color }}
                                  />
                                  {bank.name}
                                </span>
                              ) : (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {tx.statementType === "credit_card"
                                    ? "CC"
                                    : "Bank"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[11px] font-medium ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center rounded-[2px] border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                                {tx.category || "Uncategorized"}
                              </span>
                            </TableCell>
                            <TableCell
                              className={`pr-5 text-right font-mono text-sm font-medium tabular-nums ${
                                tx.amount < 0
                                  ? "text-foreground"
                                  : "text-success"
                              }`}
                            >
                              {tx.amount < 0
                                ? `-${formatINR(tx.amount)}`
                                : `+${formatINR(tx.amount)}`}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
