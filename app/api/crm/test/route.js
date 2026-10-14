import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { crmConfig, testConnection, describeTable } from "../../../../lib/crm-db";

/* Connect hua ya nahi, aur table me kya hai — setup ke waqt yahi
   sabse pehle chalta hai. Columns ki list isliye di jaati hai taaki
   user CRM_COL_* mapping sahi bhar sake. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const cfg = crmConfig();
  if (!cfg.ready) {
    return NextResponse.json({
      needsSetup: true,
      missing: [
        !process.env.CRM_DB_HOST && "CRM_DB_HOST",
        !process.env.CRM_DB_NAME && "CRM_DB_NAME",
        !process.env.CRM_DB_USER && "CRM_DB_USER",
      ].filter(Boolean),
      message: "CRM database details are not set in .env.local.",
    });
  }

  const wantColumns = new URL(request.url).searchParams.get("columns");

  try {
    const test = await testConnection();
    const out = {
      ok: true,
      ...test,
      config: {
        host: cfg.host,
        database: cfg.database,
        table: cfg.table,
        lostValues: cfg.lostValues,
        stageTable: cfg.useStageTable ? cfg.stage.table : "",
        staffTable: cfg.useStaffTable ? cfg.staff.table : "",
        /* Kaunsi mapping set hai — user ko dikhana zaroori hai */
        mapped: Object.entries(cfg.col).filter(([, v]) => v).map(([k]) => k),
        unmapped: Object.entries(cfg.col).filter(([, v]) => !v).map(([k]) => k),
      },
    };
    if (wantColumns) {
      const d = await describeTable();
      out.columns = d.columns;
    }
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Could not connect to CRM", code: err?.code }, { status: 502 });
  }
}
