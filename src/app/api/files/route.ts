import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  return base.trim() || "unnamed-file";
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const files = await prisma.userFile.findMany({
    where: { userId: session.userId },
    select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(files);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const saved = await prisma.userFile.create({
    data: {
      userId: session.userId,
      name: sanitizeFileName(file.name),
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      content: buffer,
    },
    select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
  });

  return NextResponse.json(saved, { status: 201 });
}
