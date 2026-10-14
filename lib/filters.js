/* ============================================================
   lib/filters.js — filter ka pure logic.
   UI se alag rakha hai taaki test ho sake aur doosre modules
   bhi isi shape ko reuse kar sakein.
   ============================================================ */
import { rangeLabel, resolveRange } from "./date-range";

export const DEFAULT_FILTERS = { range: "30", from: "", to: "", platform: "", status: "", objective: "" };

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
  const bits = [rangeLabel(f.range, from, to)];
  if (f.platform) bits.push(f.platform);
  if (f.status) bits.push(f.status);
  if (f.objective) bits.push(f.objective);
  return bits.join(" · ");
}

/* Custom chuna par date nahi bhari — chup-chaap galat data dikhane se
   behtar hai ki range default par wapas chala jaaye. */
export function normalizeFilters(f) {
  if (f.range === "custom" && !f.from && !f.to) return { ...f, range: DEFAULT_FILTERS.range };
  return f;
}

/* Status filter ad list par lagta hai. Campaigns page daily data ko
   bhi isi list se chhaant-ta hai (CampaignCards → statusKeys), taaki
   "Active" chunne pe spend aur leads bhi sirf Active campaigns ke hon. */
export function applyStatus(rows, status) {
  return status ? rows.filter((r) => String(r.status || "") === status) : rows;
}
