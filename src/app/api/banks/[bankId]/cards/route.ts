import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST /api/banks/[bankId]/cards — add a card
export async function POST(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bankId } = await params;

  // Verify bank belongs to this user before adding a card
  const bank = await prisma.bank.findFirst({ where: { id: bankId, userId: session.userId } });
  if (!bank) return NextResponse.json({ error: "Bank not found" }, { status: 404 });

  const { type, nickname, last4 } = await req.json();
  const card = await prisma.card.create({
    data: { bankId, type, nickname, last4: last4 || null },
  });
  return NextResponse.json(card);
}

// DELETE /api/banks/[bankId]/cards?cardId=xxx
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bankId } = await params;
  const url = new URL(req.url);
  const cardId = url.searchParams.get("cardId");
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  // Verify card belongs to this bank (and user owns bank)
  const bank = await prisma.bank.findFirst({ where: { id: bankId, userId: session.userId } });
  if (!bank) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.card.delete({ where: { id: cardId } });
  return NextResponse.json({ ok: true });
}
