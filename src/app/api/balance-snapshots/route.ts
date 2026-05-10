import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshots = await prisma.bankBalanceSnapshot.findMany({
    where: { userId: session.userId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(snapshots);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await req.json();
  const { bankId, asOfDate, closingBalance } = payload ?? {};

  if (!bankId || !asOfDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!isFiniteNumber(closingBalance)) {
    return NextResponse.json({ error: "Closing balance must be a valid number" }, { status: 400 });
  }

  const bank = await prisma.bank.findFirst({
    where: { id: bankId, userId: session.userId },
    select: { id: true },
  });

  if (!bank) return NextResponse.json({ error: "Bank not found" }, { status: 404 });

  const snapshot = await prisma.bankBalanceSnapshot.create({
    data: {
      userId: session.userId,
      bankId,
      asOfDate,
      closingBalance,
    },
  });

  return NextResponse.json(snapshot);
}
