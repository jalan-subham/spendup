import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ billId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { billId } = await params;
  const { transactionId, action = 'link' } = await req.json();

  const bill = await prisma.creditCardBill.findFirst({ where: { id: billId, userId: session.userId } });
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const tx = await prisma.transaction.findFirst({ where: { id: transactionId, userId: session.userId } });
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const linkedBillId = action === 'unlink' ? null : billId;

  const updatedTx = await prisma.transaction.update({
    where: { id: transactionId },
    data: { linkedBillId }
  });

  return NextResponse.json({ ok: true, transaction: updatedTx });
}
