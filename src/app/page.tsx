"use client";

import { useEffect, useState, useMemo } from "react";
import type { Transaction } from "@/lib/types";
import { useAccounts } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CreditCard, IndianRupee, TrendingDown, TrendingUp, Download, Search, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const chartConfig = {
  amount: { label: "₹ Spent", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.abs(amount));
}

function parseDDMMYY(s: string) {
  if (!s) return 0;
  const [d, m, y] = s.split("/");
  return new Date(2000 + parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
}

export default function Home() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/transactions")
      .then(r => r.ok ? r.json() : [])
      .then((data: Transaction[]) => setTransactions(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const metrics = useMemo(() => {
    let spendSum = 0;
    let refundSettleSum = 0;
    let incomeSum = 0;
    let incomeDebitSum = 0;
    let ccSettleSum = 0;
    let investSum = 0;

    // Seed net balance with all opening balances
    let netBalance = banks.reduce((s, b) => s + (b.openingBalance || 0), 0);

    const categoryMap: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};

    transactions.forEach(t => {
      // Calculate global net balance directly from amounts signed
      netBalance += t.amount;

      const amtAbs = Math.abs(t.amount);

      if (t.transactionType === "spend") {
        spendSum += amtAbs;
        if (t.category && t.category !== "Other") {
          categoryMap[t.category] = (categoryMap[t.category] || 0) + amtAbs;
        }
        dailyMap[t.date] = (dailyMap[t.date] || 0) + amtAbs;
      } else if (t.transactionType === "refund_settlement") {
        refundSettleSum += amtAbs;
      } else if (t.transactionType === "income") {
        incomeSum += amtAbs;
      } else if (t.transactionType === "income_debit") {
        incomeDebitSum += amtAbs;
      } else if (t.transactionType === "cc_settlement") {
        ccSettleSum += amtAbs;
      } else if (t.transactionType === "investment") {
        investSum += amtAbs;
      }
    });

    const netSpends = Math.max(0, spendSum - refundSettleSum);
    const netIncome = Math.max(0, incomeSum - incomeDebitSum);

    const categoryData = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    const topCategory = categoryData.length > 0 ? categoryData[0] : null;

    const areaData = Object.entries(dailyMap)
      .sort((a, b) => parseDDMMYY(a[0]) - parseDDMMYY(b[0]))
      .slice(-7)
      .map(([date, amount]) => {
        const [d, m] = date.split("/");
        return { day: `${d}/${m}`, amount };
      });

    return {
      netBalance,
      netSpends,
      netIncome,
      ccSettleSum,
      investSum,
      topCategory,
      categoryData,
      areaData,
      spendCount: transactions.filter(t => t.transactionType === 'spend').length
    };
  }, [transactions, banks]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => parseDDMMYY(b.date) - parseDDMMYY(a.date))
      .slice(0, 8);
  }, [transactions]);

  if (!loaded || !accountsLoaded) return <div className="p-8 text-sm text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="p-8 space-y-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Your Ledger</p>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        </div>
        <Button size="sm" variant="outline" className="gap-2 text-xs">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="col-span-2 lg:col-span-1 bg-foreground text-background border-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium opacity-60">Net Income</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-50" />
            </div>
            <div className="text-2xl font-semibold">₹{metrics.netIncome.toLocaleString("en-IN")}</div>
            <p className="text-[11px] opacity-50 mt-1 flex items-center gap-1">
              After reversals/debits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Net Spend</span>
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div className="text-2xl font-semibold">₹{metrics.netSpends.toLocaleString("en-IN")}</div>
            <p className="text-[11px] text-muted-foreground mt-1">{metrics.spendCount} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">CC Settlements</span>
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold">₹{metrics.ccSettleSum.toLocaleString("en-IN")}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Paid bills</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Top Category</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold">{metrics.topCategory ? metrics.topCategory.name : "None yet"}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {metrics.topCategory ? `₹${metrics.topCategory.amount.toLocaleString("en-IN")} · Top spender` : "No categorised spends"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {transactions.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold">Daily Spending</CardTitle>
              <CardDescription className="text-xs">Your most recent active days</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 px-2">
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <AreaChart data={metrics.areaData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-amount)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-amount)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Spent"]} />} />
                  <Area dataKey="amount" type="monotone" fill="url(#fillAmount)" stroke="var(--color-amount)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold">By Category</CardTitle>
              <CardDescription className="text-xs">Top categories overall</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 px-2">
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={metrics.categoryData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={4} className="text-[10px]" width={80} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={18} fill="var(--color-amount)" fillOpacity={0.85} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <IndianRupee className="h-8 w-8 opacity-20" />
            <div>
              <p className="text-sm font-medium">No spending data</p>
              <p className="text-xs mt-1">Upload a statement to populate your charts.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions Table */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
              <CardDescription className="text-xs">The latest additions to your ledger</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input type="search" placeholder="Search..." className="h-8 w-[200px] pl-8 text-xs" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-y">
                  <TableHead className="text-xs pl-6">Date</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right pr-6">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((tx) => (
                  <TableRow key={tx.id} className="group">
                    <TableCell className="pl-6 text-xs text-muted-foreground font-mono">{tx.date}</TableCell>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">{tx.narration}</TableCell>
                    <TableCell>
                      <span className="text-[10px] text-muted-foreground">{tx.transactionType}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground">
                        {tx.category || "Uncategorized"}
                      </span>
                    </TableCell>
                    <TableCell className={`text-sm text-right pr-6 font-medium tabular-nums ${tx.amount < 0 ? "text-foreground" : "text-emerald-600"}`}>
                      {tx.amount < 0 ? `−${formatINR(tx.amount)}` : `+${formatINR(tx.amount)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
