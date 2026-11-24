"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/brand-mark";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Network error, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[380px] rounded-[4px] border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight">SpendUp</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">SETUP // NEW</span>
        </div>

        <div className="p-6">
          <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Your banks, statements, and files remain isolated to this account.
          </p>

          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reg-username" className="block text-xs font-medium text-foreground">
                Username
              </label>
              <Input
                id="reg-username"
                autoFocus
                placeholder="e.g. subham"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="block text-xs font-medium text-foreground">
                Password
              </label>
              <Input
                id="reg-password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-confirm" className="block text-xs font-medium text-foreground">
                Confirm Password
              </label>
              <Input
                id="reg-confirm"
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-[2px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !username || !password || !confirm}
            >
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>
        </div>

        <div className="border-t border-border bg-secondary px-6 py-3.5 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-iris-ink underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
