"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bank, Card, CardType, Transaction } from "@/lib/types";

const TRANSACTIONS_CACHE_TTL_MS = 30_000;

let transactionsCache: Transaction[] | null = null;
let transactionsLastFetchedAt = 0;
let transactionsRequest: Promise<Transaction[]> | null = null;
const transactionSubscribers = new Set<(rows: Transaction[]) => void>();

function notifyTransactionSubscribers(rows: Transaction[]) {
  transactionSubscribers.forEach((subscriber) => subscriber(rows));
}

function setTransactionsCache(rows: Transaction[]) {
  transactionsCache = rows;
  transactionsLastFetchedAt = Date.now();
  notifyTransactionSubscribers(rows);
}

function shouldUseTransactionsCache() {
  if (!transactionsCache) return false;
  return Date.now() - transactionsLastFetchedAt < TRANSACTIONS_CACHE_TTL_MS;
}

async function fetchTransactions(force = false): Promise<Transaction[]> {
  if (!force && shouldUseTransactionsCache()) {
    return transactionsCache ?? [];
  }

  if (!force && transactionsRequest) {
    return transactionsRequest;
  }

  const request = fetch("/api/transactions")
    .then(async (res) => {
      if (!res.ok) return [] as Transaction[];
      const data = await parseJsonSafely<Transaction[]>(res);
      return Array.isArray(data) ? data : [];
    })
    .catch(() => [] as Transaction[])
    .finally(() => {
      transactionsRequest = null;
    });

  transactionsRequest = request;
  const rows = await request;
  setTransactionsCache(rows);
  return rows;
}

async function parseJsonSafely<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getErrorMessage(res: Response): Promise<string> {
  const data = await parseJsonSafely<{ error?: string; message?: string }>(res);
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  return `${res.status} ${res.statusText}`;
}

// ─── useAccounts ─────────────────────────────────────────────────────────────

export function useAccounts() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Initial load
  useEffect(() => {
    fetch("/api/banks")
      .then(async (r) => {
        if (!r.ok) return [] as Bank[];
        const data = await parseJsonSafely<Bank[]>(r);
        return Array.isArray(data) ? data : [];
      })
      .then((data: Bank[]) => {
        setBanks(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const addBank = useCallback(async (name: string, color: string, openingBalance?: number): Promise<Bank> => {
    const res = await fetch("/api/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, openingBalance: openingBalance ?? 0 }),
    });

    if (!res.ok) {
      throw new Error(await getErrorMessage(res));
    }

    const bank = await parseJsonSafely<Bank>(res);
    if (!bank) {
      throw new Error("Bank API returned an empty or invalid response.");
    }

    setBanks(prev => [...prev, bank]);
    return bank;
  }, []);

  const removeBank = useCallback(async (bankId: string) => {
    await fetch(`/api/banks?id=${bankId}`, { method: "DELETE" });
    setBanks(prev => prev.filter(b => b.id !== bankId));
  }, []);

  const updateBank = useCallback(async (bankId: string, patch: Partial<Bank>) => {
    const res = await fetch("/api/banks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bankId, ...patch }),
    });

    if (!res.ok) {
      throw new Error(await getErrorMessage(res));
    }

    const updated = await parseJsonSafely<Bank>(res);
    if (!updated) {
      throw new Error("Bank update API returned an empty or invalid response.");
    }

    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, ...updated } : b));
  }, []);

  const addCard = useCallback(async (bankId: string, type: CardType, nickname: string, last4?: string): Promise<Card> => {
    const res = await fetch(`/api/banks/${bankId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, nickname, last4 }),
    });

    if (!res.ok) {
      throw new Error(await getErrorMessage(res));
    }

    const card = await parseJsonSafely<Card>(res);
    if (!card) {
      throw new Error("Card API returned an empty or invalid response.");
    }

    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, cards: [...b.cards, card] } : b));
    return card;
  }, []);

  const removeCard = useCallback(async (bankId: string, cardId: string) => {
    await fetch(`/api/banks/${bankId}/cards?cardId=${cardId}`, { method: "DELETE" });
    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, cards: b.cards.filter(c => c.id !== cardId) } : b));
  }, []);

  return { banks, loaded, addBank, removeBank, updateBank, addCard, removeCard };
}

// ─── useTransactions ─────────────────────────────────────────────────────────

export function useTransactions() {
  const [transactions, setTransactionsState] = useState<Transaction[]>(transactionsCache ?? []);
  const [loaded, setLoaded] = useState<boolean>(transactionsCache !== null);

  useEffect(() => {
    const subscriber = (rows: Transaction[]) => {
      setTransactionsState(rows);
      setLoaded(true);
    };

    transactionSubscribers.add(subscriber);

    if (transactionsCache !== null) {
      setTransactionsState(transactionsCache);
      setLoaded(true);

      // Keep cached data snappy while refreshing stale snapshots in the background.
      if (!shouldUseTransactionsCache()) {
        void fetchTransactions(true);
      }
    } else {
      void fetchTransactions().finally(() => setLoaded(true));
    }

    return () => {
      transactionSubscribers.delete(subscriber);
    };
  }, []);

  const setTransactions = useCallback((updater: Transaction[] | ((prev: Transaction[]) => Transaction[])) => {
    const next = typeof updater === "function"
      ? (updater as (prev: Transaction[]) => Transaction[])(transactionsCache ?? [])
      : updater;
    setTransactionsCache(next);
    setLoaded(true);
  }, []);

  const refreshTransactions = useCallback(async () => {
    const rows = await fetchTransactions(true);
    setLoaded(true);
    return rows;
  }, []);

  return { transactions, loaded, setTransactions, refreshTransactions };
}
