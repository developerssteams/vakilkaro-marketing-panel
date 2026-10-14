import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/session";
import { whatsappConfig } from "../../../../lib/platform-config";
import { queueStats, statsBySource, recentLog } from "../../../../lib/message-queue";

/* Queue ka haal — panel har 10 second me ye poochta hai jab
   broadcast chal raha ho. */
export async function GET(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const sourceId = p.get("sourceId");
  const cfg = whatsappConfig();

  return NextResponse.json({
    ok: true,
    ready: cfg.ready,
    hasWebhook: Boolean(cfg.verifyToken),
    throttle: cfg.throttlePerMinute,
    stats: queueStats(),
    ...(sourceId ? { source: statsBySource(sourceId) } : {}),
    ...(p.get("log") ? { log: recentLog(Number(p.get("log")) || 50) } : {}),
  });
}
