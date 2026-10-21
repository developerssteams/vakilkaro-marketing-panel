import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchHourlyWindow } from "../../../../lib/meta-api";

/* POST { accountIds, fromMs, toMs } → Campaigns ke time filter ke liye
   us waqt (jaise kal 06:00 → aaj abhi) ka spend / results, campaign +
   platform wise. Zyada se zyada 31 din. */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  const fromMs = Number(d.fromMs); const toMs = Math.min(Number(d.toMs), Date.now());
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return NextResponse.json({ error: "Bad time range" }, { status: 400 });
  if (toMs - fromMs > 31 * 86400000) return NextResponse.json({ error: "Time filter works for up to 31 days — pick a shorter range." }, { status: 400 });
  if (Date.now() - fromMs > 395 * 86400000) return NextResponse.json({ error: "Meta keeps hour-wise data only for the last 13 months." }, { status: 400 });
  try {
    const r = await fetchHourlyWindow(ids, fromMs, toMs);
    return NextResponse.json({ ok: true, ...r, fromMs, toMs, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Could not load hour-wise data" }, { status: 502 });
  }
}