"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bank, Card, CardType } from "@/lib/types";

// ─── useAccounts ─────────────────────────────────────────────────────────────

export function useAccounts() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Initial load
  useEffect(() => {
    fetch("/api/banks")
      .then(r => r.ok ? r.json() : [])
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
    const bank: Bank = await res.json();
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
    const updated: Bank = await res.json();
    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, ...updated } : b));
  }, []);

  const addCard = useCallback(async (bankId: string, type: CardType, nickname: string, last4?: string): Promise<Card> => {
    const res = await fetch(`/api/banks/${bankId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, nickname, last4 }),
    });
    const card: Card = await res.json();
    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, cards: [...b.cards, card] } : b));
    return card;
  }, []);

  const removeCard = useCallback(async (bankId: string, cardId: string) => {
    await fetch(`/api/banks/${bankId}/cards?cardId=${cardId}`, { method: "DELETE" });
    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, cards: b.cards.filter(c => c.id !== cardId) } : b));
  }, []);

  return { banks, loaded, addBank, removeBank, updateBank, addCard, removeCard };
}
