"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { useAccounts, useTransactions } from "@/lib/store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { parseTxnDate } from "@/lib/date";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function MonthTransactionsPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground lg:p-8">
          Loading…
        </div>
      }
    >
      <MonthTransactionsPage />
    </Suspense>
  );
}

function MonthTransactionsPage() {
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
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading period transactions…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Monthly Transactions
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
              {from && to ? `${from} → ${to}` : "All available dates"} ·{" "}
              {filtered.length} rows
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export XLSX
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Closing Balance</TableHead>
                <TableHead className="pr-5">Ref No</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                    {t.date}
                  </TableCell>
                  <TableCell className="max-w-[340px] truncate text-xs font-medium">
                    {t.narration}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-[2px] border border-border bg-secondary px-2 py-0.5 font-mono text-[11px]">
                      {t.transactionType}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs font-medium tabular-nums ${
                      t.amount >= 0 ? "text-success" : "text-foreground"
                    }`}
                  >
                    {t.amount >= 0 ? "+" : "-"}
                    {formatINR(t.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {t.closingBalance != null
                      ? formatINR(t.closingBalance)
                      : "—"}
                  </TableCell>
                  <TableCell className="pr-5 font-mono text-[11px] text-muted-foreground">
                    {t.refNo}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-xs text-muted-foreground"
                  >
                    No transactions for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
