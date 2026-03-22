"use client";

import { useState } from "react";
import { useAccounts } from "@/lib/store";
import { COMMON_BANKS } from "@/lib/types";
import type { CardType, Bank } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreditCard,
  Smartphone,
  Landmark,
  Plus,
  Trash2,
  ChevronRight,
  Edit2,
} from "lucide-react";

const CARD_TYPE_LABELS: Record<CardType, { label: string; icon: React.ReactNode; color: string }> = {
  debit: { label: "Debit Card", icon: <CreditCard className="h-3.5 w-3.5" />, color: "text-blue-600 bg-blue-50 border-blue-100" },
  credit: { label: "Credit Card", icon: <CreditCard className="h-3.5 w-3.5" />, color: "text-violet-600 bg-violet-50 border-violet-100" },
  upi: { label: "UPI", icon: <Smartphone className="h-3.5 w-3.5" />, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
};

function AddBankDialog({ onAdd }: { onAdd: (name: string, color: string, openingBalance?: number) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selected, setSelected] = useState("");
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState("#6366f1");
  const [openingBalance, setOpeningBalance] = useState<string>("");

  const handleAdd = () => {
    const ob = openingBalance ? parseFloat(openingBalance) : 0;
    if (mode === "preset") {
      const bank = COMMON_BANKS.find((b) => b.name === selected);
      if (bank) onAdd(bank.name, bank.color, ob);
    } else {
      if (customName.trim()) onAdd(customName.trim(), customColor, ob);
    }
    setOpen(false);
    setSelected("");
    setCustomName("");
    setOpeningBalance("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Bank
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Bank</DialogTitle>
          <DialogDescription>Choose a bank to add to your accounts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button variant={mode === "preset" ? "default" : "outline"} size="sm" onClick={() => setMode("preset")} className="flex-1">Common Banks</Button>
            <Button variant={mode === "custom" ? "default" : "outline"} size="sm" onClick={() => setMode("custom")} className="flex-1">Custom</Button>
          </div>
          {mode === "preset" ? (
            <Select value={selected} onValueChange={(val) => setSelected(val || "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a bank…" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_BANKS.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input placeholder="Bank name" value={customName} onChange={(e) => setCustomName(e.target.value)} className="flex-1" />
              <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-input bg-transparent p-1" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Starting Balance <span className="opacity-50">(optional)</span></label>
            <Input 
              type="number" 
              placeholder="e.g. 10000" 
              value={openingBalance} 
              onChange={(e) => setOpeningBalance(e.target.value)} 
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={mode === "preset" ? !selected : !customName.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCardDialog({ bankId, onAdd }: { bankId: string; onAdd: (bankId: string, type: CardType, nickname: string, last4?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CardType>("debit");
  const [nickname, setNickname] = useState("");
  const [last4, setLast4] = useState("");

  const handleAdd = () => {
    if (nickname.trim()) {
      onAdd(bankId, type, nickname.trim(), last4.trim() || undefined);
      setOpen(false);
      setNickname("");
      setLast4("");
      setType("debit");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add card
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Card / UPI</DialogTitle>
          <DialogDescription>Add a debit card, credit card, or UPI handle to this bank.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["debit", "credit", "upi"] as CardType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                    type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {CARD_TYPE_LABELS[t].icon}
                  {CARD_TYPE_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nickname</label>
            <Input placeholder={type === "upi" ? "e.g. Primary UPI" : "e.g. Salary Account Card"} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          {type !== "upi" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Last 4 digits <span className="opacity-50">(optional)</span></label>
              <Input
                placeholder="1234"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, ""))}
                className="font-mono"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!nickname.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditBankDialog({ bank, onUpdate }: { bank: Bank; onUpdate: (bankId: string, patch: Partial<Bank>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(bank.name);
  const [color, setColor] = useState(bank.color);
  const [openingBalance, setOpeningBalance] = useState<string>(bank.openingBalance?.toString() || "");

  const handleSave = () => {
    const ob = openingBalance ? parseFloat(openingBalance) : 0;
    if (name.trim()) {
      onUpdate(bank.id, { name: name.trim(), color, openingBalance: ob });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Bank Profile</DialogTitle>
          <DialogDescription>Update the name, color, and starting balance for this account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input placeholder="Bank name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded-md border border-input bg-transparent p-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Starting Balance <span className="opacity-50">(optional)</span></label>
            <Input 
              type="number" 
              placeholder="e.g. 10000" 
              value={openingBalance} 
              onChange={(e) => setOpeningBalance(e.target.value)} 
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { banks, loaded, addBank, removeBank, updateBank, addCard, removeCard } = useAccounts();

  if (!loaded) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[800px]">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Configuration</p>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      {/* Bank Accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Bank Accounts & Cards</CardTitle>
            <CardDescription className="text-xs">Manage your banks, debit cards, credit cards, and UPI handles.</CardDescription>
          </div>
          <AddBankDialog onAdd={addBank} />
        </CardHeader>
        <CardContent className="p-0">
          {banks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <Landmark className="h-8 w-8 opacity-30" />
              <div>
                <p className="text-sm font-medium">No banks added yet</p>
                <p className="text-xs">Click "Add Bank" to get started.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {banks.map((bank) => (
                <div key={bank.id} className="px-6 py-4">
                  {/* Bank Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: bank.color }}>
                        {bank.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{bank.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {bank.cards.length === 0 ? "No cards added" : `${bank.cards.length} card${bank.cards.length !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <AddCardDialog bankId={bank.id} onAdd={addCard} />
                      <EditBankDialog bank={bank} onUpdate={updateBank} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeBank(bank.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Cards */}
                  {bank.cards.length > 0 && (
                    <div className="ml-11 space-y-2">
                      {bank.cards.map((card) => {
                        const cfg = CARD_TYPE_LABELS[card.type];
                        return (
                          <div key={card.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                            <div className="flex items-center gap-2.5">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                                {cfg.icon}
                                {cfg.label}
                              </span>
                              <span className="text-sm font-medium">{card.nickname}</span>
                              {card.last4 && (
                                <span className="text-xs text-muted-foreground font-mono">•••• {card.last4}</span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => removeCard(bank.id, card.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ETL Info Card */}
      <Card className="border-dashed">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground text-sm">How statement types work</p>
              <p>
                <strong>Bank Account Statement</strong> — includes UPI, debit card spends, and CC bill payments. CC bill payments are automatically tagged as <strong>CC Settlement</strong>
                <span className="text-[10px] ml-1.5 inline-flex align-middle rounded-full bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 font-medium">* Paying off your credit card bill</span>
                . Settlements are not counted towards your spending.
              </p>
              <p><strong>Credit Card Statement</strong> — the canonical record of CC spends. These are your actual credit card purchases, counted once.</p>
              <p className="text-emerald-600 font-medium">This prevents double-counting when you upload both.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
