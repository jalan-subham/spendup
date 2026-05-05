import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Transaction } from "@/lib/types";

function hasUnknownCommentArgument(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("Unknown argument `comment`");
}

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
    return NextResponse.json(rows, {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=60",
      },
    });
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
            ...(t.comment != null ? { comment: t.comment } : {}),
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
            linkedBillId: t.linkedBillId ?? null,
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
    let updated;
    try {
      updated = await prisma.transaction.update({ where: { id, userId }, data });
    } catch (e) {
      if (!hasUnknownCommentArgument(e) || !("comment" in data)) {
        throw e;
      }

      const { comment, ...dataWithoutComment } = data as Record<string, unknown>;
      updated = await prisma.transaction.update({
        where: { id, userId },
        data: dataWithoutComment,
      });

      // Fallback for stale generated Prisma client that doesn't know `comment` yet.
      await prisma.$executeRaw`
        UPDATE "Transaction"
        SET "comment" = ${comment == null ? null : String(comment)}
        WHERE "id" = ${id} AND "userId" = ${userId}
      `;

      return NextResponse.json({ ...updated, comment: comment == null ? null : String(comment) });
    }
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
