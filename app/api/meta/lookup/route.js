import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { listPages, searchLocations } from "../../../../lib/meta-write";

/* Pages list aur location search — Create Ad form ko chahiye.
   Meta location ka naam nahi, apni key leta hai. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ pages: [], locations: [], needsSetup: true });

  const p = new URL(request.url).searchParams;
  const what = p.get("what") || "pages";

  try {
    if (what === "pages") return NextResponse.json({ ok: true, pages: await listPages() });
    if (what === "locations") {
      const q = p.get("q") || "";
      if (q.length < 2) return NextResponse.json({ ok: true, locations: [] });
      return NextResponse.json({ ok: true, locations: await searchLocations(q) });
    }
    return NextResponse.json({ error: "what=pages ya locations" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Lookup fail" }, { status: 502 });
  }
}
