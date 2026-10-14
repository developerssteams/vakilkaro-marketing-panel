import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { waDbReady, listContacts, messagesOf, listClients, waDbError } from "../../../../lib/wa-db";
import { botEnabled } from "../../../../lib/wa-bot";

export const dynamic = "force-dynamic";

/* GET /api/whatsapp/chats            → saare WhatsApp contacts (naye pehle)
   GET /api/whatsapp/chats?wa_id=91…  → us contact ki poori chat
   Login zaroori — ye customers ke naam/number hain. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!waDbReady()) return NextResponse.json({ ok: true, configured: false, contacts: [], messages: [], bot: botEnabled() });
  const waId = new URL(request.url).searchParams.get("wa_id");
  try {
    if (waId) {
      if (!/^\d{6,20}$/.test(waId)) return NextResponse.json({ error: "Invalid number" }, { status: 400 });
      return NextResponse.json({ ok: true, configured: true, messages: await messagesOf(waId) });
    }
    return NextResponse.json({ ok: true, configured: true, contacts: await listContacts(), clients: (await listClients()).length, bot: botEnabled() });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, error: `WhatsApp database: ${waDbError(e)}`, contacts: [], messages: [], bot: botEnabled() });
  }
}
