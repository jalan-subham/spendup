"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  FileUp,
  Loader2,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Transaction } from "@/lib/parsers/icici-parser";

export default function StatementUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsedTransactions, setParsedTransactions] = useState<
    Transaction[] | null
  >(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setRequiresPassword(false);
      setPassword("");
      setError(null);
      setParsedTransactions(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    if (password) {
      formData.append("password", password);
    }

    try {
      const response = await fetch("/api/upload-statement", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401 && result.passwordRequired) {
          setRequiresPassword(true);
          setError(
            "This PDF is password protected. Please enter the password."
          );
        } else {
          setError(result.error || "Failed to upload and parse statement.");
        }
      } else {
        setParsedTransactions(result.data);
      }
    } catch (err) {
      setError("An unexpected error occurred while processing the file.");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <Card className="w-full">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg font-semibold">
            Import Bank Statement
          </CardTitle>
          <CardDescription>
            Upload a statement PDF to extract and inspect transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          {!parsedTransactions ? (
            <div className="space-y-4">
              <div className="mx-auto grid w-full max-w-sm items-center gap-1.5">
                <label
                  htmlFor="pdf-upload"
                  className="block text-xs font-medium text-foreground"
                >
                  Select PDF File
                </label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>

              {requiresPassword && (
                <div className="mx-auto grid w-full max-w-sm items-center gap-1.5 rounded-[2px] border border-[#e0bf00]/60 bg-[#fffbc2] p-4 text-[#614e00] dark:bg-[#2e2600]/60 dark:text-[#faf1a3]">
                  <label
                    htmlFor="pdf-password"
                    className="flex items-center gap-2 text-xs font-semibold"
                  >
                    <Lock size={14} /> Document Password
                  </label>
                  <Input
                    id="pdf-password"
                    type="password"
                    placeholder="e.g. SUBH0710"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] opacity-85">
                    Used only temporarily on the server and never stored.
                  </p>
                </div>
              )}

              {error && (
                <div className="mx-auto flex max-w-sm items-center gap-2 rounded-[2px] border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle size={14} />
                  <p>{error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-3 rounded-[2px] border border-success/40 bg-success/10 p-6 text-success">
              <CheckCircle2 size={36} />
              <h3 className="text-base font-semibold">Successfully Parsed</h3>
              <p className="text-xs">
                Extracted{" "}
                <strong className="font-mono">
                  {parsedTransactions.length}
                </strong>{" "}
                transactions.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setParsedTransactions(null);
                  setFile(null);
                  setRequiresPassword(false);
                  setPassword("");
                }}
              >
                Upload Another
              </Button>
            </div>
          )}
        </CardContent>
        {!parsedTransactions && (
          <CardFooter className="justify-center">
            <Button
              onClick={handleUpload}
              disabled={
                !file || isUploading || (requiresPassword && !password)
              }
              size="lg"
              className="w-full max-w-sm"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Extract Transactions
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>

      {parsedTransactions && parsedTransactions.length > 0 && (
        <Card className="w-full">
          <CardHeader className="border-b border-border">
            <CardTitle>Extracted Transactions</CardTitle>
            <CardDescription>
              Review your parsed rows before saving to the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-secondary text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedTransactions.slice(0, 50).map((t, idx) => (
                    <tr
                      key={idx}
                      className="transition-colors hover:bg-secondary/70"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-muted-foreground">
                        {t.date}
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-2.5 font-medium"
                        title={t.description}
                      >
                        {t.description}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-medium tabular-nums ${
                          t.type === "DEPOSIT" ? "text-success" : ""
                        }`}
                      >
                        {t.type === "DEPOSIT" ? "+" : "-"}
                        {t.amount.toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                        {t.balance.toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="default">
              Import {parsedTransactions.length} Transactions
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
