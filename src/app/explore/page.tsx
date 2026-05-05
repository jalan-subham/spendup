"use client";

import { useMemo, useState } from "react";
import type { Transaction, TransactionType } from "@/lib/types";
import { useAccounts, useTransactions } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Building2, CalendarRange, Sparkles, X } from "lucide-react";

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
    const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  const dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) {
    const [, d, m, y] = dash;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }

  const isoTime = new Date(s).getTime();
  return Number.isNaN(isoTime) ? 0 : isoTime;
}

function formatShortDate(s: string) {
  const ts = parseDDMMYY(s);
  if (!ts) return s;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(ts);
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
  adjustment: "Adjustment",
  excluded: "Excluded",
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
  adjustment: "text-sky-600",
  excluded: "text-slate-500",
};

const CHART_COLORS = ["#0F766E", "#D97706", "#1D4ED8", "#DC2626", "#4D7C0F", "#0891B2", "#9A3412", "#334155"];
const POSITIVE_TYPES: TransactionType[] = ["income", "refund", "refund_settlement", "transfer_in"];
const NEGATIVE_TYPES: TransactionType[] = ["spend", "transfer_out", "investment", "cc_settlement", "income_debit"];

const CATEGORY_CHART_CONFIG = {
  amount: { label: "Spent", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

type SourceOption = {
  key: string;
  label: string;
  bankId?: string;
  color: string;
};

export default function ExplorePage() {
  const { banks, loaded: accountsLoaded } = useAccounts();
  const { transactions, loaded, setTransactions } = useTransactions();

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editType, setEditType] = useState<TransactionType>("spend");
  const [editCategory, setEditCategory] = useState<string>("Uncategorized");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("Other");
  const [editComment, setEditComment] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Derive unique category list
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => { if (t.category) cats.add(t.category); });
    return Array.from(cats).sort();
  }, [transactions]);

  const getBankName = (bankId?: string) => banks.find(b => b.id === bankId)?.name ?? "Unknown bank";
  const getBankColor = (bankId?: string) => banks.find(b => b.id === bankId)?.color ?? "#64748B";

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const map = new Map<string, SourceOption>();

    for (const tx of transactions) {
      if (!tx.bankId && !tx.cardId) continue;

      const bank = banks.find(b => b.id === tx.bankId);
      const bankName = bank?.name ?? "Unknown bank";
      const bankColor = bank?.color ?? "#64748B";

      if (tx.statementType === "credit_card") {
        const card = bank?.cards.find(c => c.id === tx.cardId);
        const label = card ? `${bankName} • ${card.nickname}` : `${bankName} • Credit Card`;
        const key = `cc:${tx.bankId ?? "unknown"}:${tx.cardId ?? "unknown"}`;
        if (!map.has(key)) {
          map.set(key, { key, label, bankId: tx.bankId, color: bankColor });
        }
      } else {
        const key = `ba:${tx.bankId ?? "unknown"}`;
        if (!map.has(key)) {
          map.set(key, { key, label: `${bankName} • Account`, bankId: tx.bankId, color: bankColor });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [transactions, banks]);

  const getSourceKey = (t: Transaction) => {
    if (t.statementType === "credit_card") {
      return `cc:${t.bankId ?? "unknown"}:${t.cardId ?? "unknown"}`;
    }
    return `ba:${t.bankId ?? "unknown"}`;
  };

  // Apply filters
  const filtered = useMemo(() => {
    const fromTs = filterDateFrom ? new Date(filterDateFrom).getTime() : 0;
    const toTs = filterDateTo ? new Date(filterDateTo).getTime() + 86399999 : Infinity;

    return transactions
      .filter(t => {
        if (filterType !== "all" && t.transactionType !== filterType) return false;
        if (!showExcluded && t.transactionType === "excluded") return false;
        if (selectedBanks.length > 0 && (!t.bankId || !selectedBanks.includes(t.bankId))) return false;
        if (selectedSources.length > 0 && !selectedSources.includes(getSourceKey(t))) return false;
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
  }, [transactions, filterType, filterCategory, filterDateFrom, filterDateTo, search, selectedBanks, selectedSources, showExcluded]);

  // Summary from current filtered set
  const summary = useMemo(() => {
    let spend = 0;
    let refunds = 0;
    let income = 0;

    for (const t of filtered) {
      const amt = Math.abs(t.amount);
      if (t.transactionType === "spend") spend += amt;
      if (t.transactionType === "refund" || t.transactionType === "refund_settlement") refunds += amt;
      if (t.transactionType === "income") income += amt;
    }

    return {
      spend,
      refunds,
      income,
      count: filtered.length,
    };
  }, [filtered]);

  const categorySpendData = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of filtered) {
      if (tx.transactionType !== "spend") continue;
      const key = tx.category || "Uncategorized";
      map.set(key, (map.get(key) ?? 0) + Math.abs(tx.amount));
    }

    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [filtered]);

  const sourceSplitData = useMemo(() => {
    const map = new Map<string, { key: string; label: string; value: number; color: string }>();

    for (const tx of filtered) {
      if (tx.transactionType !== "spend") continue;
      const sourceKey = getSourceKey(tx);
      const source = sourceOptions.find(s => s.key === sourceKey);
      const label = source?.label ?? "Unknown source";
      const color = source?.color ?? "#64748B";
      const existing = map.get(sourceKey) ?? { key: sourceKey, label, value: 0, color };
      existing.value += Math.abs(tx.amount);
      map.set(sourceKey, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [filtered, sourceOptions]);

  const typeDistributionData = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of filtered) {
      const key = TX_TYPE_LABELS[tx.transactionType];
      map.set(key, (map.get(key) ?? 0) + Math.abs(tx.amount));
    }

    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);
  }, [filtered]);

  const sourceColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    sourceSplitData.forEach((item, index) => {
      m[item.key] = CHART_COLORS[index % CHART_COLORS.length];
    });
    return m;
  }, [sourceSplitData]);

  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setFilterCategory("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSelectedBanks([]);
    setSelectedSources([]);
    setShowExcluded(false);
  };

  const hasActiveFilters =
    search ||
    filterType !== "all" ||
    filterCategory !== "all" ||
    filterDateFrom ||
    filterDateTo ||
    selectedBanks.length > 0 ||
    selectedSources.length > 0 ||
    showExcluded;

  const openEditor = (tx: Transaction) => {
    setEditingTx(tx);
    setEditType(tx.transactionType);
    setEditCategory(tx.category || "Uncategorized");
    setEditPaymentMethod(tx.paymentMethod || "Other");
    setEditComment(tx.comment || "");
    setEditError("");
  };

  const editorDirty = !!editingTx && (
    editType !== editingTx.transactionType ||
    editCategory !== (editingTx.category || "Uncategorized") ||
    editPaymentMethod !== (editingTx.paymentMethod || "Other") ||
    editComment !== (editingTx.comment || "")
  );

  const saveEditor = async () => {
    if (!editingTx) return;
    setEditSaving(true);
    setEditError("");
    try {
      const payload = {
        id: editingTx.id,
        transactionType: editType,
        category: editCategory === "Uncategorized" ? null : editCategory,
        paymentMethod: editPaymentMethod,
        comment: editComment.trim() ? editComment.trim() : null,
      };

      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to update transaction");
      }

      const updated = (await res.json()) as Transaction;
      setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? { ...tx, ...updated } : tx)));
      setEditingTx(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setEditSaving(false);
    }
  };

  if (!loaded || !accountsLoaded) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="relative mx-auto max-w-[1450px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-8 top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <Card className="border-border/60 bg-gradient-to-br from-cyan-50/65 via-background to-amber-50/60 dark:from-cyan-950/20 dark:to-amber-950/15">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" />
                Explore Lab
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">Transaction Intelligence</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Slice by banks, statement sources, categories, and date range. The charts below react instantly as you tune filters.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rows</p>
                <p className="font-semibold tabular-nums">{summary.count}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Spend</p>
                <p className="font-semibold tabular-nums text-destructive">{formatINR(summary.spend)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Refunds</p>
                <p className="font-semibold tabular-nums text-emerald-600">{formatINR(summary.refunds)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>Pick one or many banks and sources, then drill down with the rest of the controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Search</label>
              <Input
                placeholder="Narration or ref no..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Type</label>
              <Select value={filterType} onValueChange={(v) => v && setFilterType(v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(Object.keys(TX_TYPE_LABELS) as TransactionType[]).map(k => (
                    <SelectItem key={k} value={k}>{TX_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Category</label>
              <Select value={filterCategory} onValueChange={(v) => v && setFilterCategory(v)}>
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From</label>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To</label>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Banks (multi-select)</p>
              {selectedBanks.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedBanks([])}>
                  Clear banks
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {banks.map((bank) => {
                const active = selectedBanks.includes(bank.id);
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => {
                      setSelectedBanks((prev) =>
                        prev.includes(bank.id) ? prev.filter(id => id !== bank.id) : [...prev, bank.id]
                      );
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                      active ? "border-foreground/40 bg-foreground/10" : "border-border/70 bg-background hover:bg-muted/60"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bank.color }} />
                    {bank.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sources (multi-select)</p>
              {selectedSources.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedSources([])}>
                  Clear sources
                </Button>
              )}
            </div>
            {sourceOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No source metadata found yet. Upload more statements to unlock source slicing.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sourceOptions.map((source) => {
                  const active = selectedSources.includes(source.key);
                  return (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => {
                        setSelectedSources((prev) =>
                          prev.includes(source.key) ? prev.filter(k => k !== source.key) : [...prev, source.key]
                        );
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                        active ? "border-foreground/40 bg-foreground/10" : "border-border/70 bg-background hover:bg-muted/60"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                      {source.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => setShowExcluded(v => !v)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs transition ${
                showExcluded ? "border-amber-400/70 bg-amber-100/70 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" : "border-border/70 text-muted-foreground"
              }`}
            >
              Include excluded transactions
            </button>

            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" />
                Reset all filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Spend</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">{formatINR(summary.spend)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Income Tagged</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600">{formatINR(summary.income)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Banks Selected</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{selectedBanks.length || banks.length}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sources Selected</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{selectedSources.length || sourceOptions.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-border/70 bg-card/90 xl:col-span-5">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Source Split</CardTitle>
            <CardDescription>Spend contribution by account source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-2 pb-3">
            <ChartContainer config={CATEGORY_CHART_CONFIG} className="h-[240px] w-full">
              <PieChart>
                <Pie data={sourceSplitData} dataKey="value" nameKey="label" innerRadius={56} outerRadius={88} paddingAngle={2}>
                  {sourceSplitData.map((item) => (
                    <Cell key={item.key} fill={sourceColorMap[item.key] ?? item.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, name) => [formatINR(Number(value)), name as string]} />} />
              </PieChart>
            </ChartContainer>

            <div className="grid gap-1.5">
              {sourceSplitData.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs">
                  <span className="inline-flex items-center gap-2 truncate">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sourceColorMap[item.key] ?? item.color }} />
                    {item.label}
                  </span>
                  <span className="font-medium tabular-nums">{formatINR(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90 xl:col-span-7">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Top Spending Categories</CardTitle>
            <CardDescription>Highest spend categories in the current window.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <ChartContainer config={CATEGORY_CHART_CONFIG} className="h-[260px] w-full">
              <BarChart data={categorySpendData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.35} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={6} width={120} className="text-[10px]" />
                <ChartTooltip content={<ChartTooltipContent className="border-border/80 bg-popover/95 backdrop-blur-sm" formatter={(v) => [formatINR(Number(v)), "Spent"]} />} />
                <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="pb-1">
          <CardTitle className="text-base">Type Distribution</CardTitle>
          <CardDescription>Absolute amount contribution by classified transaction type.</CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <ChartContainer config={CATEGORY_CHART_CONFIG} className="h-[260px] w-full">
            <BarChart data={typeDistributionData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.35} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" interval={0} angle={-8} textAnchor="end" height={56} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-[10px]" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => [formatINR(Number(v)), "Amount"]} />} />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Filtered Transactions</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              {filterDateFrom || filterDateTo ? `${filterDateFrom || "..."} to ${filterDateTo || "..."}` : "All dates"}
            </CardDescription>
          </div>
          <p className="text-xs text-muted-foreground">{summary.count} row{summary.count !== 1 ? "s" : ""} shown</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Narration</TableHead>
                  <TableHead className="w-28 text-xs">Bank</TableHead>
                  <TableHead className="w-40 text-xs">Source</TableHead>
                  <TableHead className="w-36 text-xs">Type</TableHead>
                  <TableHead className="w-24 text-xs">Payment</TableHead>
                  <TableHead className="w-32 text-xs">Category</TableHead>
                  <TableHead className="w-32 text-right text-xs">Amount</TableHead>
                  <TableHead className="w-24 text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">
                      No transactions match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(t => {
                    const amtColor = TYPE_COLORS[t.transactionType] ?? (t.amount < 0 ? "text-destructive" : "text-emerald-600");
                    const source = sourceOptions.find(s => s.key === getSourceKey(t));
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{formatShortDate(t.date)}</TableCell>
                        <TableCell className="max-w-[360px] text-sm">
                          <p className="truncate font-medium" title={t.narration}>{t.narration}</p>
                          {t.refNo ? <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{t.refNo}</p> : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getBankColor(t.bankId) }} />
                            <span className="truncate">{getBankName(t.bankId)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[11px] text-muted-foreground">{source?.label ?? "Unknown source"}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${amtColor}`}>
                            {TX_TYPE_LABELS[t.transactionType]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t.paymentMethod || "-"}</span>
                        </TableCell>
                        <TableCell>
                          {t.category ? (
                            <span className="inline-flex items-center rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t.category}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">Uncategorized</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${amtColor}`}>
                          {t.amount < 0 ? "-" : "+"}{formatINR(t.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => openEditor(t)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-muted/50">
                  <TableCell colSpan={8} className="text-right text-xs text-muted-foreground">
                    <span className="text-destructive">Spend {formatINR(summary.spend)}</span>
                    &nbsp;·&nbsp;
                    <span className="text-emerald-600">Refunds {formatINR(summary.refunds)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-emerald-600">
                    Income {formatINR(summary.income)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingTx} onOpenChange={(open) => { if (!open) setEditingTx(null); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Fix Transaction Classification</span>
              {editorDirty ? <span className="text-xs font-medium text-amber-600">Unsaved changes</span> : null}
            </DialogTitle>
            <DialogDescription>
              Update type/category for this row, then save. This is useful for misclassified income/refund rows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-gradient-to-b from-muted/35 to-background p-3">
              <p className="truncate text-sm font-semibold">{editingTx?.narration}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md border bg-background px-2 py-0.5">Ref: {editingTx?.refNo || "-"}</span>
                <span className="rounded-md border bg-background px-2 py-0.5">{editingTx?.date}</span>
                <span className={`rounded-md border px-2 py-0.5 ${editingTx && editingTx.amount < 0 ? "border-destructive/30 text-destructive" : "border-emerald-500/30 text-emerald-600"}`}>
                  {editingTx ? (editingTx.amount < 0 ? "-" : "+") + formatINR(editingTx.amount) : ""}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Quick Type Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {(editingTx?.amount != null && editingTx.amount < 0 ? NEGATIVE_TYPES : POSITIVE_TYPES).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditType(type)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${editType === type ? "border-foreground/40 bg-foreground/10" : "border-border bg-background hover:bg-muted/60"}`}
                  >
                    {TX_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Type</p>
                <Select value={editType} onValueChange={(v) => v && setEditType(v as TransactionType)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TX_TYPE_LABELS) as TransactionType[]).map((k) => (
                      <SelectItem key={k} value={k}>{TX_TYPE_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Category</p>
                <Select value={editCategory} onValueChange={(v) => v && setEditCategory(v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-1">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Payment Method</p>
                <Select value={editPaymentMethod} onValueChange={(v) => v && setEditPaymentMethod(v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      "UPI",
                      "Debit",
                      "Credit Card",
                      "Net Banking",
                      "Cash",
                      "Other",
                    ].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Comment</p>
              <Input value={editComment} onChange={(e) => setEditComment(e.target.value)} placeholder="Optional note for future review..." className="h-9 text-sm" />
            </div>

            {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={saveEditor} disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
