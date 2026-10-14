import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { metaConfig } from "../../../../lib/platform-config";
import { listAllAccounts, fetchAccountDetails, fetchPromotePage, tokenInfo } from "../../../../lib/meta-api";

/* GET  → token ki health + saare ad accounts jo token dekh sakta hai
   POST → ek account ki poori detail (ID haath se daali ho to verify) */

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = metaConfig();
  if (!cfg.ready) {
    return NextResponse.json({ needsSetup: true, missing: ["META_TOKEN"] }, { status: 200 });
  }

  let token;
  try { token = await tokenInfo(); }
  catch (err) { return NextResponse.json({ tokenError: err?.message || "Token check fail" }, { status: 200 }); }
  if (!token.ok) return NextResponse.json({ tokenError: token.error, token }, { status: 200 });

  const { accounts, errors } = await listAllAccounts();
  return NextResponse.json({
    ok: true, token, accounts, accountErrors: errors,
    accountsError: !accounts.length && errors.length ? errors[0].message : "",
  });
}

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!metaConfig().ready) return NextResponse.json({ error: "META_TOKEN is not set in .env", needsSetup: true }, { status: 503 });

  let d = {};
  try { d = await request.json(); } catch { d = {}; }
  const raw = String(d.accountId || "").trim();
  const id = raw.startsWith("act_") ? raw : `act_${raw}`;
  if (!/^act_\d{6,20}$/.test(id)) return NextResponse.json({ error: "Account ID must look like act_123456789" }, { status: 400 });

  try {
    const [acc, page] = await Promise.all([fetchAccountDetails(id), fetchPromotePage(id)]);
    return NextResponse.json({ ok: true, account: { ...acc, ...page } });
  } catch (err) {
    return NextResponse.json({
      error: err?.message || "Account not found",
      hint: "In Business Settings → System Users → Add Assets, assign this ad account to the System User.",
    }, { status: 502 });
  }
}
