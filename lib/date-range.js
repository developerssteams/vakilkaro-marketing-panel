/* ============================================================
   lib/date-range.js
   Ek hi jagah date range ka hisaab — Campaigns cards aur View Ads
   dono isi ko use karte hain, taaki numbers kabhi alag na aayein.
   ============================================================ */

export function iso(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export function todayISO() { return iso(new Date()); }

function shift(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return iso(d);
}

export const RANGES = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7",         label: "Last 7 days" },
  { key: "30",        label: "Last 30 days" },
  { key: "month",     label: "This Month" },
  { key: "custom",    label: "Custom" },
  { key: "all",       label: "All time" },
];

/* Range ko do dates me badlo. `all` par dono null. */
export function resolveRange(key, customFrom, customTo) {
  switch (key) {
    case "today":     return { from: todayISO(), to: todayISO() };
    case "yesterday": return { from: shift(1), to: shift(1) };
    case "7":         return { from: shift(6), to: todayISO() };
    case "30":        return { from: shift(29), to: todayISO() };
    case "month": {
      const d = new Date(); d.setDate(1);
      return { from: iso(d), to: todayISO() };
    }
    case "custom":    return { from: customFrom || null, to: customTo || null };
    default:          return { from: null, to: null };
  }
}

export function inRange(dateStr, from, to) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function rangeLabel(key, from, to) {
  const spec = RANGES.find((r) => r.key === key);
  if (key === "custom" && (from || to)) return `${from || "start"} → ${to || "today"}`;
  return spec ? spec.label : "All time";
}

/* Range ke har din ki list — jis din entry nahi hai us din 0 dikhana hai,
   isliye din pehle se bana lete hain. Bahut lambi range par cap laga hai. */
export function daysInRange(from, to, cap = 60) {
  if (!from && !to) return null;
  const start = new Date(from || to);
  const end = new Date(to || from);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const out = [];
  const cur = new Date(start);
  while (cur <= end && out.length < cap) {
    out.push(iso(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out.reverse();
}
