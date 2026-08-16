import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await params;

  const file = await prisma.userFile.findFirst({
    where: { id: fileId, userId: session.userId },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.userFile.delete({ where: { id: fileId } });
  return NextResponse.json({ ok: true });
}
