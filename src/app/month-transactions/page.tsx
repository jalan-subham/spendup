"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { useAccounts, useTransactions } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

function parseTxnDate(s: string) {
  if (!s) return 0;
  const slash = s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const [, d, m, yRaw] = slash;
    const y = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return new Date(y, parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }
  const dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) {
    const [, d, m, y] = dash;
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)).getTime();
  }
  const isoTime = new Date(s).getTime();
  return Number.isNaN(isoTime) ? 0 : isoTime;
}

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function MonthTransactionsPage() {
  const searchParams = useSearchParams();
  const { banks } = useAccounts();
  const { transactions, loaded } = useTransactions();

  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 86399999 : Infinity;

    return transactions
      .filter((t) => t.transactionType !== "excluded")
      .filter((t) => {
        const ts = parseTxnDate(t.date);
        return ts >= fromTs && ts <= toTs;
      })
      .sort((a, b) => parseTxnDate(a.date) - parseTxnDate(b.date));
  }, [transactions, from, to]);

  const handleDownload = () => {
    const rows = filtered.map((t) => ({
      Date: t.date,
      Narration: t.narration,
      Amount: t.amount,
      Type: t.transactionType,
      Category: t.category || "",
      Payment: t.paymentMethod || "",
      Bank: banks.find((b) => b.id === t.bankId)?.name || "",
      ClosingBalance: t.closingBalance ?? "",
      RefNo: t.refNo,
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Transactions");

    const safeFrom = from ? from.replace(/\//g, "-") : "all";
    const safeTo = to ? to.replace(/\//g, "-") : "all";
    XLSX.writeFile(book, `transactions_${safeFrom}_to_${safeTo}.xlsx`);
  };

  if (!loaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading transactions...</div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-8">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Transactions</p>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly Transactions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {from && to ? `Period: ${from} to ${to}` : "All available dates"} · {filtered.length} rows
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Transactions List</CardTitle>
              <CardDescription className="text-xs">Simple list for this period.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={filtered.length === 0}>
              Download XLSX
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-y">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Narration</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-right">Closing Balance</TableHead>
                <TableHead className="text-xs">Ref No</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{t.date}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-xs font-medium">{t.narration}</TableCell>
                  <TableCell className="text-xs">{t.transactionType}</TableCell>
                  <TableCell className={`text-right text-xs tabular-nums ${t.amount >= 0 ? "text-emerald-600" : "text-foreground"}`}>
                    {t.amount >= 0 ? "+" : "-"}{formatINR(t.amount)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {t.closingBalance != null ? formatINR(t.closingBalance) : "-"}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{t.refNo}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-xs text-muted-foreground">
                    No transactions for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
