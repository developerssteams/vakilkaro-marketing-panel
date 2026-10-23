import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { panelDbConfigured, ensurePanelTable, upsertRows, deleteRows } from "../../../../lib/panel-db";

export const runtime = "nodejs";

/* POST { ds, upserts: [{ id, data, pos }], deletes: [id] } */
export async function POST(request) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!panelDbConfigured()) return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ds = String(d.ds || "");
  if (!/^[a-z0-9_-]{1,40}(__[a-z0-9_-]{1,60})?$/i.test(ds)) return NextResponse.json({ error: "Bad dataset" }, { status: 400 });
  const ups = Array.isArray(d.upserts) ? d.upserts.slice(0, 1000) : [];
  const dels = Array.isArray(d.deletes) ? d.deletes.slice(0, 5000) : [];
  const by = String(user.email || user.user_code || user.id || "");
  try {
    await ensurePanelTable();
    const u = await upsertRows(ds, ups, by);
    const x = await deleteRows(ds, dels, by);
    return NextResponse.json({ ok: true, upserted: u, deleted: x });
  } catch (e) {
    return NextResponse.json({ error: `Database: ${e?.message || "write failed"}` }, { status: 500 });
  }
}
