"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bank, Card, CardType } from "@/lib/types";

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
