"use client";

import { useState } from "react";
import { useAccounts } from "@/lib/store";
import { COMMON_BANKS } from "@/lib/types";
import type { CardType, Bank } from "@/lib/types";
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
  Edit2,
} from "lucide-react";

const CARD_TYPE_LABELS: Record<
  CardType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  debit: {
    label: "Debit Card",
    icon: <CreditCard className="h-3.5 w-3.5" />,
    color:
      "border-[#0088e5]/30 bg-[#f5fbff] text-[#005e9e] dark:bg-[#00183e] dark:text-[#8ad6ff]",
  },
  credit: {
    label: "Credit Card",
    icon: <CreditCard className="h-3.5 w-3.5" />,
    color:
      "border-primary/35 bg-accent text-accent-foreground",
  },
  upi: {
    label: "UPI",
    icon: <Smartphone className="h-3.5 w-3.5" />,
    color:
      "border-success/35 bg-success/10 text-success",
  },
};

function AddBankDialog({
  onAdd,
}: {
  onAdd: (name: string, color: string, openingBalance?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selected, setSelected] = useState("");
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState("#6c35f5");
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
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add Bank
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Bank</DialogTitle>
          <DialogDescription>
            Choose a preset bank or configure a custom institution.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={mode === "preset" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("preset")}
            >
              Common Banks
            </Button>
            <Button
              variant={mode === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("custom")}
            >
              Custom
            </Button>
          </div>
          {mode === "preset" ? (
            <Select
              value={selected}
              onValueChange={(val) => setSelected(val || "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a bank…" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_BANKS.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[1px]"
                        style={{ backgroundColor: b.color }}
                      />
                      {b.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Bank name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="flex-1"
              />
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                aria-label="Bank accent color"
                className="h-8 w-10 cursor-pointer rounded-[2px] border border-input bg-transparent p-1"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Starting Balance{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              type="number"
              placeholder="e.g. 10000"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={mode === "preset" ? !selected : !customName.trim()}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCardDialog({
  bankId,
  onAdd,
}: {
  bankId: string;
  onAdd: (
    bankId: string,
    type: CardType,
    nickname: string,
    last4?: string
  ) => void;
}) {
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
          <Button variant="outline" size="xs">
            <Plus className="h-3 w-3" />
            Add card
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Card / UPI</DialogTitle>
          <DialogDescription>
            Attach a debit card, credit card, or UPI handle to this bank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["debit", "credit", "upi"] as CardType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1.5 rounded-[2px] border p-2.5 text-xs font-medium transition-colors ${
                    type === t
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {CARD_TYPE_LABELS[t].icon}
                  {CARD_TYPE_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Nickname</label>
            <Input
              placeholder={
                type === "upi" ? "e.g. Primary UPI" : "e.g. Salary Account Card"
              }
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          {type !== "upi" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Last 4 digits{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                placeholder="1234"
                maxLength={4}
                value={last4}
                onChange={(e) =>
                  setLast4(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="font-mono"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!nickname.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditBankDialog({
  bank,
  onUpdate,
}: {
  bank: Bank;
  onUpdate: (bankId: string, patch: Partial<Bank>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(bank.name);
  const [color, setColor] = useState(bank.color);
  const [openingBalance, setOpeningBalance] = useState<string>(
    bank.openingBalance?.toString() || ""
  );

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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${bank.name}`}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Bank Profile</DialogTitle>
          <DialogDescription>
            Update the display name, badge color, and opening balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Bank name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Bank color"
              className="h-8 w-10 cursor-pointer rounded-[2px] border border-input bg-transparent p-1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">
              Starting Balance{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              type="number"
              placeholder="e.g. 10000"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const {
    banks,
    loaded,
    addBank,
    removeBank,
    updateBank,
    addCard,
    removeCard,
  } = useAccounts();

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-muted-foreground lg:p-8">
        Loading account configuration…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Settings
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage banks, opening balances, debit/credit cards, and UPI
              handles.
            </p>
          </div>
          <AddBankDialog onAdd={addBank} />
        </div>
      </header>

      <div className="mx-auto max-w-[920px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[4px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight">
              Configured Banks &amp; Cards
            </h2>
          </div>

          {banks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
              <Landmark className="h-7 w-7 opacity-40" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  No banks added yet
                </p>
                <p className="mt-1 text-xs">
                  Add a bank account above before importing statements.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {banks.map((bank) => (
                <div key={bank.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-xs font-semibold text-white"
                        style={{ backgroundColor: bank.color }}
                      >
                        {bank.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{bank.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {bank.cards.length} card
                          {bank.cards.length === 1 ? "" : "s"}
                          {typeof bank.openingBalance === "number" &&
                          bank.openingBalance !== 0
                            ? ` · Opening ₹${bank.openingBalance.toLocaleString(
                                "en-IN"
                              )}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AddCardDialog bankId={bank.id} onAdd={addCard} />
                      <EditBankDialog bank={bank} onUpdate={updateBank} />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeBank(bank.id)}
                        aria-label={`Remove ${bank.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {bank.cards.length > 0 && (
                    <div className="mt-3 space-y-1.5 sm:ml-11">
                      {bank.cards.map((card) => {
                        const cfg = CARD_TYPE_LABELS[card.type];
                        return (
                          <div
                            key={card.id}
                            className="flex items-center justify-between rounded-[2px] border border-border bg-secondary px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-medium ${cfg.color}`}
                              >
                                {cfg.icon}
                                {cfg.label}
                              </span>
                              <span className="text-xs font-medium">
                                {card.nickname}
                              </span>
                              {card.last4 && (
                                <span className="font-mono text-xs text-muted-foreground">
                                  •••• {card.last4}
                                </span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => removeCard(bank.id, card.id)}
                              aria-label={`Remove ${card.nickname}`}
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
        </section>

        <section className="rounded-[4px] border border-border bg-secondary p-5">
          <h2 className="text-sm font-semibold tracking-tight">
            How statement reconciliation works
          </h2>
          <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Bank Account Statement</strong>{" "}
              — captures UPI, debit card spends, and credit card bill payments.
              Payments toward your credit card are tagged as{" "}
              <span className="rounded-[2px] border border-primary/35 bg-accent px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-foreground">
                cc_settlement
              </span>{" "}
              and excluded from monthly spend.
            </p>
            <p>
              <strong className="text-foreground">Credit Card Statement</strong>{" "}
              — serves as the canonical ledger of individual card purchases,
              preventing double-counting when both statements are uploaded.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
