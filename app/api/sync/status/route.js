import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { platformStatus } from "../../../../lib/platform-config";

/* Kaunsa platform connect hai — sirf haan/naa. Token ki value
   kabhi browser tak nahi jaati. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ ok: true, platforms: platformStatus() });
}
