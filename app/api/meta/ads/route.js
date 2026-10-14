import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchCampaignAds, resetUsage, getUsage } from "../../../../lib/meta-api";

/* GET /api/meta/ads?campaignId=123&since=2026-09-01&until=2026-09-30
   Ek campaign ke saare ads + unka data. Sirf padhta hai, kuch badalta nahi. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });

  const u = new URL(request.url);
  const campaignId = String(u.searchParams.get("campaignId") || "");
  const since = String(u.searchParams.get("since") || "");
  const until = String(u.searchParams.get("until") || "");
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!/^\d{5,25}$/.test(campaignId)) return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
  if (!day.test(since) || !day.test(until) || since > until) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  try {
    resetUsage();
    const ads = await fetchCampaignAds(campaignId, since, until);
    return NextResponse.json({ ok: true, ads, usage: getUsage() });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not load ads" }, { status: 502 });
  }
}
