import { NextResponse } from "next/server";
import { getStandings } from "@/lib/apiFootball";
import { toGroupStandings } from "@/lib/wcMap";

export const dynamic = "force-dynamic";

/** GET /api/wc/standings → the 12 WC group tables. */
export async function GET() {
  try {
    const groups = await getStandings();
    return NextResponse.json({ groups: toGroupStandings(groups) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
