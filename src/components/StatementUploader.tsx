"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, FileUp, Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { Transaction } from '@/lib/parsers/icici-parser';

export default function StatementUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [parsedTransactions, setParsedTransactions] = useState<Transaction[] | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // Reset state on new file
      setRequiresPassword(false);
      setPassword('');
      setError(null);
      setParsedTransactions(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (password) {
      formData.append('password', password);
    }

    try {
      const response = await fetch('/api/upload-statement', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401 && result.passwordRequired) {
          setRequiresPassword(true);
          setError('This PDF is password protected. Please enter the password.');
        } else {
          setError(result.error || 'Failed to upload and parse statement.');
        }
      } else {
        setParsedTransactions(result.data);
      }
    } catch (err) {
      setError('An unexpected error occurred while processing the file.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <Card className="w-full shadow-lg border-2 border-primary/10">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-primary">Import Bank Statement</CardTitle>
          <CardDescription className="text-md">
            Securely import your ICICI Bank PDF statements to auto-sync transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {!parsedTransactions ? (
            <div className="space-y-4">
              <div className="grid w-full max-w-sm items-center gap-1.5 mx-auto">
                <label htmlFor="pdf-upload" className="block text-sm font-medium text-muted-foreground">Select PDF File</label>
                <div className="flex gap-2 items-center">
                  <Input 
                    id="pdf-upload" 
                    type="file" 
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {requiresPassword && (
                <div className="grid w-full max-w-sm items-center gap-1.5 mx-auto bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-bottom-4">
                  <label htmlFor="pdf-password" className="text-amber-800 dark:text-amber-400 flex items-center gap-2 font-medium">
  <Lock size={16} /> Document Password
</label>
                  <Input 
                    id="pdf-password" 
                    type="password" 
                    placeholder="e.g. SUBH0710"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-amber-300 focus-visible:ring-amber-500"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Your password is only used temporarily on the server and is never stored.
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg max-w-sm mx-auto">
                  <AlertCircle size={16} />
                  <p>{error}</p>
                </div>
              )}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center p-6 space-y-4 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-400 rounded-xl border border-green-200 dark:border-green-900 animate-in zoom-in-95">
               <CheckCircle2 size={48} className="text-green-500" />
               <h3 className="text-xl font-bold">Successfully Parsed!</h3>
               <p>We found <strong>{parsedTransactions.length}</strong> transactions in your statement.</p>
               <Button variant="outline" className="mt-4" onClick={() => {
                 setParsedTransactions(null);
                 setFile(null);
                 setRequiresPassword(false);
                 setPassword('');
               }}>Upload Another</Button>
             </div>
          )}

        </CardContent>
        <CardFooter className="flex justify-center pb-8">
          {!parsedTransactions && (
            <Button 
                onClick={handleUpload} 
                disabled={!file || isUploading || (requiresPassword && !password)}
                size="lg"
                className="w-full max-w-sm shadow-md transition-all hover:scale-105 active:scale-95"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-5 w-5" />
                  Extract Transactions
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Transactions Preview Table */}
      {parsedTransactions && parsedTransactions.length > 0 && (
        <Card className="w-full shadow-md animate-in slide-in-from-bottom-8 duration-500">
          <CardHeader>
            <CardTitle>Extracted Transactions</CardTitle>
            <CardDescription>Review your transactions before saving them to the database.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border p-1 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedTransactions.slice(0, 50).map((t, idx) => (
                    <tr key={idx} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-3 max-w-xs truncate" title={t.description}>{t.description}</td>
                      <td className={`px-4 py-3 text-right font-medium ${t.type === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : ''}`}>
                        {t.type === 'DEPOSIT' ? '+' : '-'}{t.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {t.balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </td>
                    </tr>
                  ))}
                  {parsedTransactions.length > 50 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground italic">
                        ... and {parsedTransactions.length - 50} more transactions
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="default">
              Import {parsedTransactions.length} Transactions
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
