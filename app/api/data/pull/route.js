import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { panelDbConfigured, ensurePanelTable, changesSince } from "../../../../lib/panel-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 1500;

/* GET ?since=123 → us seq ke baad ke badlav */
export async function GET(request) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!panelDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 503 });
  const since = Number(new URL(request.url).searchParams.get("since") || 0);
  try {
    await ensurePanelTable();
    const rows = await changesSince(since, LIMIT);
    return NextResponse.json({ ok: true, rows, last: rows.length ? rows[rows.length - 1].seq : since, more: rows.length === LIMIT });
  } catch (e) {
    return NextResponse.json({ error: `Database: ${e?.message || "read failed"}` }, { status: 500 });
  }
}
