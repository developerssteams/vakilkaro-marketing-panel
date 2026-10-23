import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { panelDbConfigured, ensurePanelTable, maxSeq } from "../../../../lib/panel-db";

export const runtime = "nodejs";

/* Shared data chalu hai? (DATABASE_URL hai aur DB se baat ho rahi hai) */
export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!panelDbConfigured()) return NextResponse.json({ enabled: false, reason: "DATABASE_URL is not set" });
  try {
    await ensurePanelTable();
    return NextResponse.json({ enabled: true, seq: await maxSeq() });
  } catch (e) {
    return NextResponse.json({ enabled: false, error: `Database: ${e?.message || "not reachable"}` }, { status: 503 });
  }
}
