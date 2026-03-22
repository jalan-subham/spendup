import { NextRequest, NextResponse } from "next/server";
import { classifyTransactions } from "@/lib/groq";
import type { HdfcRawRow } from "@/lib/parsers/hdfc-text";

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: HdfcRawRow[] } = await req.json();
    if (!rows?.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

    const classified = await classifyTransactions(rows);
    return NextResponse.json({ classified });
  } catch (e: unknown) {
    console.error("[classify]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Classification failed" },
      { status: 500 }
    );
  }
}
