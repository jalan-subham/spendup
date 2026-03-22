import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

async function requireUserId(req: NextRequest): Promise<string | NextResponse> {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session.userId;
}

// GET /api/banks
export async function GET(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  const banks = await prisma.bank.findMany({
    where: { userId },
    include: { cards: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(banks);
}

// POST /api/banks — create a bank
export async function POST(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  const { name, color, openingBalance } = await req.json();
  const bank = await prisma.bank.create({
    data: { userId, name, color, openingBalance: openingBalance ?? 0 },
    include: { cards: true },
  });
  return NextResponse.json(bank);
}

// PATCH /api/banks — update a bank
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  const { id, ...data } = await req.json();
  const bank = await prisma.bank.update({ where: { id, userId }, data, include: { cards: true } });
  return NextResponse.json(bank);
}

// DELETE /api/banks?id=xxx
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId(req);
  if (userId instanceof NextResponse) return userId;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.bank.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
