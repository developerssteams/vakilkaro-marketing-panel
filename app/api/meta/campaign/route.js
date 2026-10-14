import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { publishFullCampaign, updateCampaign, updateAdSet, archiveCampaign } from "../../../../lib/meta-write";

function guard(user) {
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) {
    return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });
  }
  return null;
}

/* POST — naya campaign Meta par banao (aur chaho to turant live karo) */
export async function POST(request) {
  const user = await currentUser();
  const bad = guard(user); if (bad) return bad;

  let d = {};
  try { d = await request.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }

  const miss = [];
  if (!d.accountId) miss.push("Ad Account");
  if (!d.name) miss.push("Campaign name");
  if (!d.budget || Number(d.budget) <= 0) miss.push("Budget");
  if (!d.service) miss.push("Service");
  if (d.destination === "Lead Form" && !d.pageId) miss.push("Facebook Page");
  if (miss.length) return NextResponse.json({ error: `${miss.join(", ")} is required` }, { status: 400 });

  /* Meta ka minimum daily budget ₹80 hai — pehle hi rok dete hain,
     warna 3 objects ban chuke honge tab error aayega. */
  if (d.budgetType !== "Lifetime" && Number(d.budget) < 80) {
    return NextResponse.json({ error: "Daily budget must be at least ₹80 (Meta rule)" }, { status: 400 });
  }

  try {
    const out = await publishFullCampaign(d.accountId, d);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({
      error: err?.message || "Campaign was not published",
      partial: err?.partial || null,
    }, { status: 502 });
  }
}

/* PATCH — naam, budget, dates update */
export async function PATCH(request) {
  const user = await currentUser();
  const bad = guard(user); if (bad) return bad;

  let d = {};
  try { d = await request.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  if (!d.campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  try {
    await updateCampaign(d.campaignId, { name: d.name });
    if (d.adSetId) await updateAdSet(d.adSetId, d);
    return NextResponse.json({ ok: true, updated: d.campaignId });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Update fail" }, { status: 502 });
  }
}

/* DELETE — archive (Meta se poora delete nahi karte, history bachani hai) */
export async function DELETE(request) {
  const user = await currentUser();
  const bad = guard(user); if (bad) return bad;

  const id = new URL(request.url).searchParams.get("campaignId");
  if (!id) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  try {
    await archiveCampaign(id);
    return NextResponse.json({ ok: true, archived: id });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Archive fail" }, { status: 502 });
  }
}
