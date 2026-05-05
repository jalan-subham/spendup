import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ billId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { billId } = await params;
  const { isPaid } = await req.json();

  const bill = await prisma.creditCardBill.findFirst({ where: { id: billId, userId: session.userId } });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.creditCardBill.update({
    where: { id: billId },
    data: { isPaid },
    include: { card: true, transactions: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ billId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;

  const bill = await prisma.creditCardBill.findFirst({ where: { id: billId, userId: session.userId } });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId: session.userId, linkedBillId: billId },
      data: { linkedBillId: null },
    }),
    prisma.creditCardBill.delete({ where: { id: billId } }),
  ]);

  return NextResponse.json({ ok: true });
}
