import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bills = await prisma.creditCardBill.findMany({
    where: { userId: session.userId },
    include: { card: true, transactions: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(bills);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId, cycleName, billAmount, dueDate } = await req.json();
  
  const card = await prisma.card.findFirst({ where: { id: cardId, bank: { userId: session.userId } } });
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const bill = await prisma.creditCardBill.upsert({
    where: { cardId_cycleName: { cardId, cycleName } },
    update: { billAmount, dueDate },
    create: {
      userId: session.userId,
      cardId,
      cycleName,
      billAmount,
      dueDate: dueDate || null,
    },
    include: { card: true, transactions: true },
  });
  return NextResponse.json(bill);
}
