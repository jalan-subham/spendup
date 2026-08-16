import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await params;

  const file = await prisma.userFile.findFirst({
    where: { id: fileId, userId: session.userId },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": contentDisposition(file.name),
      "Content-Length": String(file.size),
    },
  });
}
