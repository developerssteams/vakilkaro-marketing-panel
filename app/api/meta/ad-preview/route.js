import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchAdPreview, PREVIEW_FORMATS, resetUsage } from "../../../../lib/meta-api";

/* GET /api/meta/ad-preview?adId=123&format=INSTAGRAM_REELS
   Ek ad ka Meta preview (iframe) + video file. Sirf padhta hai. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });

  const u = new URL(request.url);
  const adId = String(u.searchParams.get("adId") || "");
  const format = String(u.searchParams.get("format") || "MOBILE_FEED_STANDARD");
  if (!/^\d{5,25}$/.test(adId)) return NextResponse.json({ error: "Invalid ad ID" }, { status: 400 });
  if (!PREVIEW_FORMATS[format]) return NextResponse.json({ error: "Invalid placement" }, { status: 400 });

  try {
    resetUsage();
    return NextResponse.json({ ok: true, ...(await fetchAdPreview(adId, format)) });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not load preview" }, { status: 502 });
  }
}
