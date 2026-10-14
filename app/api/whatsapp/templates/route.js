import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { whatsappConfig } from "../../../../lib/platform-config";
import { listTemplates, checkNumber } from "../../../../lib/whatsapp-api";

/* Meta se approved templates ki list — panel ke dropdown me yahi aate hain.
   Sirf APPROVED wale bhej sakte ho, PENDING/REJECTED nahi. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = whatsappConfig();
  if (!cfg.ready) {
    return NextResponse.json({ needsSetup: true, templates: [],
      message: "WA_TOKEN and WA_PHONE_ID are not set in .env." });
  }

  try {
    const [templates, number] = await Promise.all([
      cfg.wabaId ? listTemplates() : Promise.resolve([]),
      checkNumber().catch(() => null),
    ]);
    return NextResponse.json({ ok: true, templates, number, throttle: cfg.throttlePerMinute });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Templates not found" }, { status: 502 });
  }
}
