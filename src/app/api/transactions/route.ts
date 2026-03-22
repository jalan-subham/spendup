import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Transaction } from "@/lib/types";

async function requireUserId(req: NextRequest): Promise<string | NextResponse> {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session.userId;
}

// GET /api/transactions
export async function GET(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  try {
    const rows = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[GET /api/transactions]", e);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST /api/transactions — bulk upsert
export async function POST(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  try {
    const { transactions }: { transactions: Transaction[] } = await req.json();
    if (!Array.isArray(transactions)) return NextResponse.json({ error: "Expected array" }, { status: 400 });

    const results = await Promise.allSettled(
      transactions.map(t =>
        prisma.transaction.upsert({
          where: { userId_refNo: { userId, refNo: t.refNo } },
          update: {},
          create: {
            id: t.id,
            refNo: t.refNo,
            userId,
            date: t.date,
            narration: t.narration,
            amount: t.amount,
            category: t.category ?? null,
            transactionType: t.transactionType,
            paymentMethod: t.paymentMethod ?? null,
            confidence: t.confidence ?? null,
            annotated: t.annotated ?? false,
            splitStatus: t.splitStatus ?? "none",
            splitSettledAmt: t.splitSettledAmount ?? null,
            closingBalance: t.closingBalance ?? null,
            statementType: t.statementType ?? null,
            bankId: t.bankId ?? null,
            cardId: t.cardId ?? null,
            // (linkedBillId is populated dynamically via separate endpoint or app state)
          },
        })
      )
    );

    const saved = results.filter(r => r.status === "fulfilled").length;
    const skipped = results.filter(r => r.status === "rejected").length;
    return NextResponse.json({ saved, skipped });
  } catch (e) {
    console.error("[POST /api/transactions]", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// PATCH /api/transactions
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  try {
    const { id, ...data } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = await prisma.transaction.update({ where: { id, userId }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/transactions]", e);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE /api/transactions?id=xxx
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  try {
    const url = new URL(req.url);
    const singleId = url.searchParams.get("id");
    if (singleId) {
      await prisma.transaction.delete({ where: { id: singleId, userId } });
      return NextResponse.json({ deleted: 1 });
    }
    const { ids }: { ids: string[] } = await req.json();
    const { count } = await prisma.transaction.deleteMany({ where: { id: { in: ids }, userId } });
    return NextResponse.json({ deleted: count });
  } catch (e) {
    console.error("[DELETE /api/transactions]", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
