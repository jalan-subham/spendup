import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRecentDbQueries } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 30;

  return NextResponse.json({ queries: getRecentDbQueries(limit) });
}
