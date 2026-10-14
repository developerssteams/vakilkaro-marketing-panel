import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchAccountPayments, fetchPrepaidBalance } from "../../../../lib/meta-api";

/* POST { accountIds: ["act_1"], since: "2025-10-01" } → Meta billing history */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  let d = {}; try { d = await request.json(); } catch { /* */ }
  const ids = [...new Set((d.accountIds || []).map(String).filter((x) => /^act_\d{6,20}$/.test(x)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(d.since || "")) ? d.since : "";

  const payments = []; const errors = []; const sources = {}; const balances = {};
  for (const id of ids) {
    balances[id] = await fetchPrepaidBalance(id);
    try {
      const r = await fetchAccountPayments(id, since);
      sources[id] = r.source;
      payments.push(...r.payments.map((p) => ({ ...p, account: id })));
    } catch (e) { errors.push({ account: id, message: e?.message || "failed" }); }
  }
  return NextResponse.json({ ok: true, payments, errors, sources, balances });
}
