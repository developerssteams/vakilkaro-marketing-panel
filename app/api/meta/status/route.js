import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { setStatus } from "../../../../lib/meta-write";

/* ON / OFF — campaign, ad set aur ad teeno par lagta hai, warna
   campaign ACTIVE dikhega par ad set paused rahega. */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "Meta token is not set", needsSetup: true }, { status: 503 });

  let d = {};
  try { d = await request.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }

  const status = String(d.status || "").toUpperCase();
  if (!["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json({ error: "status can only be ACTIVE or PAUSED" }, { status: 400 });
  }
  if (!d.campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  try {
    const ids = [d.campaignId, d.adSetId, d.adId].filter(Boolean);
    for (const id of ids) await setStatus(id, status);
    return NextResponse.json({ ok: true, status, updated: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Status change fail" }, { status: 502 });
  }
}
