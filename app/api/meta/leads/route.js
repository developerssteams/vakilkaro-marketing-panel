import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { fetchFormLeads } from "../../../../lib/meta-write";

/* Lead form se actual leads — naam, number, city, service.
   Meta batata hai lead Facebook se aayi ya Instagram se, isliye
   panel me dono cards alag-alag bhar jaate hain. */
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "Meta token is not set", needsSetup: true }, { status: 503 });

  let d = {};
  try { d = await request.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }

  const forms = (d.formIds || []).filter(Boolean);
  if (!forms.length) return NextResponse.json({ error: "formIds required — create a Lead Form ad first" }, { status: 400 });

  const leads = [];
  const errors = [];
  /* Ek form fail ho to baaki rukne nahi chahiye. */
  for (const id of forms) {
    try { leads.push(...await fetchFormLeads(id, d.since)); }
    catch (e) { errors.push({ form: id, message: e?.message || "unknown" }); }
  }

  return NextResponse.json({ ok: errors.length < forms.length, leads, errors, count: leads.length });
}
