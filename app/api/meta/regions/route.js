import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchRegionInsights } from "../../../../lib/meta-api";

/* POST { accountIds, since, until } → har campaign ka state-wise spend / leads */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(String(d.since || "")) || !day.test(String(d.until || ""))) return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  try {
    const r = await fetchRegionInsights(ids, d.since, d.until);
    return NextResponse.json({ ok: true, ...r, since: d.since, until: d.until, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Could not load state-wise data" }, { status: 502 });
  }
}
