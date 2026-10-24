/* ============================================================
   lib/filters.js — filter ka pure logic.
   UI se alag rakha hai taaki test ho sake aur doosre modules
   bhi isi shape ko reuse kar sakein.
   ============================================================ */
import { rangeLabel, resolveRange } from "./date-range";

/* Campaigns khulte hi aaj ka data (pehle 30 din) */
export const DEFAULT_FILTERS = { range: "today", from: "", to: "", fromTime: "", toTime: "", platform: "", status: "", objective: "" };

export const FILTER_PLATFORMS = ["Facebook", "Instagram", "YouTube", "Website"];
export const FILTER_STATUSES = ["Active", "Paused", "Draft", "Completed"];

/* Kitne filter default se hate hue hain — badge isi se banta hai. */
export function activeCount(f) {
  let n = 0;
  if (f.range !== DEFAULT_FILTERS.range) n += 1;
  if (f.platform) n += 1;
  if (f.status) n += 1;
  if (f.objective) n += 1;
  return n;
}

export function filterSummary(f) {
  const { from, to } = resolveRange(f.range, f.from, f.to);
  const bits = [filterRangeLabel(f, from, to)];
  if (f.platform) bits.push(f.platform);
  if (f.status) bits.push(f.status);
  if (f.objective) bits.push(f.objective);
  return bits.join(" · ");
}

/* Custom chuna par date nahi bhari — chup-chaap galat data dikhane se
   behtar hai ki range default par wapas chala jaaye. */
export function normalizeFilters(f) {
  const x = { ...DEFAULT_FILTERS, ...f };
  if (x.range !== "custom") return { ...x, fromTime: "", toTime: "" };
  const okT = (t) => (/^\d{2}:\d{2}$/.test(String(t || "")) ? t : "");
  x.fromTime = okT(x.fromTime); x.toTime = okT(x.toTime);
  /* Time bhara par date nahi — to aaj ki date maan lo */
  if (!x.from && !x.to && !x.fromTime && !x.toTime) return { ...x, range: DEFAULT_FILTERS.range };
  if (x.fromTime && !x.from) x.from = x.to || localISO(new Date());
  /* To date khaali = aaj tak (abhi tak) */
  if ((x.fromTime || x.toTime) && !x.to) x.to = localISO(new Date());
  return x;
}

/* ============================================================
   TIME FILTER — Custom me date ke saath time bhi
   (jaise kal 06:00 → aaj abhi). Time bhara ho tabhi ye chalta hai,
   warna pehle jaisa poore din ka hisaab.

   Browser ka local time (IST) → { fromMs, toMs }
   - From time khaali = us din 00:00
   - To time khaali   = us din ka end (aaj ho to "abhi tak")
   ============================================================ */
function localISO(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function hasTime(f) {
  return Boolean(f && f.range === "custom" && (f.fromTime || f.toTime) && (f.from || f.to));
}

export function timeWindow(f) {
  if (!hasTime(f)) return null;
  const fd = f.from || f.to; const td = f.to || f.from;
  const fromMs = new Date(`${fd}T${f.fromTime || "00:00"}:00`).getTime();
  const toMs = f.toTime ? new Date(`${td}T${f.toTime}:00`).getTime() : new Date(`${td}T23:59:59.999`).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return { fromMs, toMs: Math.min(toMs, Date.now()), tillNow: toMs >= Date.now() };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return y ? `${d} ${MON[m - 1]}` : "";
}
function hm(t) {
  const [h, m] = String(t).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

/* "20 Oct, 6:00 AM → 21 Oct, now" — time na ho to purana label */
export function filterRangeLabel(f, from, to) {
  if (!hasTime(f)) return rangeLabel(f.range, from, to);
  const w = timeWindow(f);
  const fd = f.from || f.to; const td = f.to || f.from;
  const left = `${shortDay(fd)}, ${hm(f.fromTime || "00:00")}`;
  const right = w && w.tillNow ? (td === fd ? "now" : `${shortDay(td)}, now`) : `${td === fd ? "" : `${shortDay(td)}, `}${f.toTime ? hm(f.toTime) : "11:59 PM"}`;
  return `${left} → ${right}`;
}

/* Status filter ad list par lagta hai. Campaigns page daily data ko
   bhi isi list se chhaant-ta hai (CampaignCards → statusKeys), taaki
   "Active" chunne pe spend aur leads bhi sirf Active campaigns ke hon. */
export function applyStatus(rows, status) {
  return status ? rows.filter((r) => String(r.status || "") === status) : rows;
}