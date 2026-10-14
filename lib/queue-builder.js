/* ============================================================
   lib/queue-builder.js

   Roz ki calling list apne aap banata hai.

   Pehle staff ko khud Lost Pool dekh ke queue bharni padti thi —
   800 leads me se kisko call karna hai ye roz decide karna
   practically hota hi nahi tha. Isliye ye rules se banata hai:

     1. Cooldown khatam ho chuka ho
     2. Attempts bucket ki limit se kam
     3. DND nahi
     4. Pehle se queue me nahi
     5. Recovered / Archived nahi

   Phir score ke hisaab se sort, aur staff me baant deta hai.
   ============================================================ */

const POOL = "audience__lost-pool";
const BUCKETS = "audience__buckets";
const QUEUE = "win-back-queue__my-queue";

/* Kaunsi leads aaj call ho sakti hain */
export function eligibleLeads(pool, buckets, opts = {}) {
  const today = new Date().toISOString().slice(0, 10);

  /* Bucket ki limits — naam case-insensitive match hota hai kyunki
     panel me "price high" aur "Price High" dono ho sakte hain. */
  const limits = {};
  buckets.forEach((b) => {
    limits[String(b.name || "").trim().toLowerCase()] = {
      maxAttempts: Number(b.maxAttempts || 3),
      cooldown: Number(b.cooldownDays || 30),
      paused: String(b.status || "Active") === "Paused",
    };
  });

  const skipped = { dnd: 0, cooldown: 0, attempts: 0, noPhone: 0, alreadyQueued: 0, done: 0, pausedBucket: 0 };
  const queuedPhones = new Set(
    (opts.existingQueue || [])
      .filter((q) => String(q.status || "Queued") === "Queued")
      .map((q) => String(q.contact || "").replace(/\D/g, "").slice(-10)),
  );

  const out = [];

  for (const l of pool) {
    const phone = String(l.phone || "").replace(/\D/g, "").slice(-10);
    const bucketKey = String(l.bucket || "").trim().toLowerCase();
    const lim = limits[bucketKey];

    if (phone.length < 10) { skipped.noPhone += 1; continue; }
    if (["Recovered", "Archived"].includes(String(l.status))) { skipped.done += 1; continue; }
    if (String(l.dnd) === "Yes") { skipped.dnd += 1; continue; }
    if (queuedPhones.has(phone)) { skipped.alreadyQueued += 1; continue; }

    /* Bucket paused ho to us bucket ki leads aaj nahi nikalni —
       jaise Junk bucket jispe kaam hi nahi karna. */
    if (lim?.paused) { skipped.pausedBucket += 1; continue; }

    if (l.nextEligible && String(l.nextEligible).slice(0, 10) > today) { skipped.cooldown += 1; continue; }

    const maxA = lim?.maxAttempts ?? Number(opts.defaultMaxAttempts || 3);
    if (maxA > 0 && Number(l.attempts || 0) >= maxA) { skipped.attempts += 1; continue; }

    out.push(l);
  }

  /* Score sabse upar — quote diya tha aur haal ki lead pehle aani chahiye */
  out.sort((a, b) => {
    const sa = Number(a.score || 0);
    const sb = Number(b.score || 0);
    if (sb !== sa) return sb - sa;
    /* Score barabar ho to bada quote pehle */
    return Number(b.quoted || 0) - Number(a.quoted || 0);
  });

  return { leads: out, skipped };
}

/* Staff me baantna.

   Do tareeke:
     keepOwner — jisne pehle baat ki thi wahi dobara call kare.
                 Recovery rate behtar hota hai, kyunki context
                 dono taraf yaad rehta hai.
     roundRobin — barabar baant do (jab staff list di ho). */
export function assignStaff(leads, { staffList = [], mode = "keepOwner" } = {}) {
  if (mode === "keepOwner" || !staffList.length) {
    return leads.map((l) => ({ ...l, _owner: String(l.lastStaff || "").trim() }));
  }

  let i = 0;
  return leads.map((l) => {
    const owner = String(l.lastStaff || "").trim();
    /* Jiska owner pehle se hai usko mat badlo — sirf unassigned baanto */
    if (owner && staffList.includes(owner)) return { ...l, _owner: owner };
    const pick = staffList[i % staffList.length];
    i += 1;
    return { ...l, _owner: pick };
  });
}

/* Queue row banao */
export function toQueueRows(leads, { uid, dueDate }) {
  const due = dueDate || new Date().toISOString().slice(0, 10);
  return leads.map((l) => ({
    id: uid(),
    leadId: l.id || "",
    name: l.name || "",
    contact: String(l.phone || "").replace(/\D/g, "").slice(-10),
    service: l.service || "",
    reason: l.bucket || "",
    quoted: l.quoted || "",
    dueDate: due,
    lastContact: l.lostAt || "",
    priority: l.priority || "Medium",
    owner: l._owner || "",
    remark: "",
    disposition: "",
    status: "Queued",
    createdAt: new Date().toISOString(),
  }));
}

/* Poora flow — panel isko ek call me use karta hai */
export function buildQueue({ pool, buckets, existingQueue, staffList, mode, limit, uid, dueDate }) {
  const { leads, skipped } = eligibleLeads(pool, buckets, { existingQueue });
  const capped = limit > 0 ? leads.slice(0, limit) : leads;
  const assigned = assignStaff(capped, { staffList, mode });
  const rows = toQueueRows(assigned, { uid, dueDate });

  /* Staff-wise count — panel me dikhane ke liye */
  const byStaff = {};
  rows.forEach((r) => {
    const k = r.owner || "(unassigned)";
    byStaff[k] = (byStaff[k] || 0) + 1;
  });

  return {
    rows,
    eligible: leads.length,
    added: rows.length,
    skipped,
    byStaff,
  };
}

export const QUEUE_KEYS = { POOL, BUCKETS, QUEUE };
