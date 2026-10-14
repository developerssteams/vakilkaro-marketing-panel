"use client";

/* ============================================================
   components/ModuleParts.js
   Sab tabs me common cheezein — formatters, form modal, aur
   chhote UI blocks. Ek jagah rakhe hain taaki har tab ka look
   bilkul same rahe.
   ============================================================ */

import { useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { validateForm } from "../lib/marketing-validate";

/* ---------- formatters ---------- */
export function num(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
export function money(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num(v));
}
/* Ads Manager jaisa — paise ke saath (₹1,202.89) */
export function money2(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v));
}
export function count(v) { return new Intl.NumberFormat("en-IN").format(num(v)); }
export function digits(v) { return String(v || "").replace(/\D/g, "").slice(-10); }
export function dayLabel(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
export function todayISO() { return new Date().toISOString().slice(0, 10); }

const MONEY_KEYS = ["monthlyLimit","dailyBudget","spend","amount","balance","dailyBurn","lowThreshold","revenue","quoted","orderValue","recoveryCost","minOrder","approvalLimit","gstAmount","monthlyCost","cplCap","cpl","cost","autoAmount","amountSpent","balance","spendCap"];
const NUM_KEYS = ["leads","size","sent","replies","delivered","read","failed","won","impressions","clicks","rows","received","attempts","leadCount","recovered","enrolled","used","maxUses","days","version","stepNo","dayOffset","throttle","cooldownDays","maxAttempts","qualified","overlap"];
const PCT_KEYS = ["ctr","replyRate"];
const DATE_KEYS = ["receivedAt","runAt","lastLeadAt","startDate","endDate","invoiceDate","date","lostAt","dueDate","lastContact","validFrom","validTo","tokenExpiry","scheduledAt","snoozeTo","nextEligible","lastRecharge","lastSync"];
const PILL_KEYS = ["status","flag","approval","metaPush","itcStatus","priority","disposition","metaSync","autoRecharge","isDefault","tokenState","metaStatus"];

export function pretty(value, key) {
  if (value === undefined || value === null || value === "") return "—";
  if (MONEY_KEYS.includes(key)) return money(value);
  if (PCT_KEYS.includes(key)) return `${num(value).toFixed(1)}%`;
  if (NUM_KEYS.includes(key)) return count(value);
  if (DATE_KEYS.includes(key)) return dayLabel(value);
  return String(value);
}

export function isPillKey(key) { return PILL_KEYS.includes(key); }

export function statusClass(value) {
  const v = String(value || "").toLowerCase();
  if (["active","approved","live","ready","posted","won","recovered","completed","running","open","success","healthy","synced","clean","pushed","claimable","sent","yes","high","on"].some((x) => v === x)) return "pill-active";
  if (["disabled","cancelled","lost","closed","archived","failed","empty","error","rejected","junk","duplicate","disconnected","expired","final no","wrong number","inactive"].some((x) => v.includes(x))) return "pill-off";
  return "pill-default";
}

/* ---------- metric engine ---------- */
export function metricValue(m, rows) {
  switch (m.kind) {
    case "count": return count(rows.length);
    /* trim zaroori hai — CRM se aaye khaali fields me aksar space hota
       hai, aur "  " ko khaali na maane to metric aur filter ka number
       alag-alag dikhta hai. */
    case "countWhere": return count(rows.filter((r) => String(r[m.field] ?? "").trim().toLowerCase() === String(m.value).trim().toLowerCase()).length);
    case "money": return money(rows.reduce((a, r) => a + num(r[m.field]), 0));
    case "moneyWhere": return money(rows.filter((r) => String(r[m.on] || "").toLowerCase() === String(m.value).toLowerCase()).reduce((a, r) => a + num(r[m.field]), 0));
    case "num": return count(rows.reduce((a, r) => a + num(r[m.field]), 0));
    case "avg": { const v = rows.map((r) => num(r[m.field])).filter((x) => x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; }
    case "avgPct": { const v = rows.map((r) => num(r[m.field])).filter((x) => x > 0); return `${(v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0).toFixed(1)}%`; }
    case "ratioMoney": { const a = rows.reduce((x, r) => x + num(r[m.num]), 0); const b = rows.reduce((x, r) => x + num(r[m.den]), 0); return money(b > 0 ? a / b : 0); }
    case "ratioPct": { const a = rows.reduce((x, r) => x + num(r[m.num]), 0); const b = rows.reduce((x, r) => x + num(r[m.den]), 0); return `${(b > 0 ? (a / b) * 100 : 0).toFixed(1)}%`; }
    case "latest": { const d = rows.map((r) => r[m.field]).filter(Boolean).sort(); return d.length ? dayLabel(d[d.length - 1]) : "—"; }
    case "tokenLive": return count(rows.filter((r) => String(r.status || "") !== "Disabled" && r.tokenExpiry && new Date(r.tokenExpiry) - new Date() > 10 * 86400000).length);
    case "tokenBad": return count(rows.filter((r) => String(r.status || "") === "Disabled" || (r.tokenExpiry && new Date(r.tokenExpiry) - new Date() <= 10 * 86400000)).length);
    default: return "—";
  }
}

export function rowComputed(spec, row) {
  const a = num(row[spec.num]); const b = num(row[spec.den]);
  if (spec.kind === "ratioMoney") return money(b > 0 ? a / b : 0);
  if (spec.kind === "ratioPct") return `${(b > 0 ? (a / b) * 100 : 0).toFixed(1)}%`;
  if (spec.kind === "ratioNum") return b > 0 ? `${Math.floor(a / b)}d` : "—";
  return "—";
}

export function blankForm(fields) {
  const out = {};
  for (const f of fields) out[f.key] = f.default || "";
  return out;
}

export function labelOf(tab, key) {
  return tab.fields?.find((f) => f.key === key)?.label || key;
}

/* Dropdown ke options doosre dataset se — jaise Ad Account ka naam. */
export function optionsForField(field) {
  if (!field.optionsFrom) return field.options || [];
  const rows = readRows(field.optionsFrom);
  const label = field.optionLabel || "name";
  return rows.map((r) => r[label]).filter(Boolean);
}

/* ============================================================
   FORM MODAL — har tab isi ko use karta hai
   ============================================================ */
export function FormModal({ tab, title, icon, initial, rows, editingId, onSave, onClose, submitLabel = "Save" }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  const visible = useMemo(() => tab.fields.filter((f) => !(f.hideWhen && f.hideWhen(form))), [tab.fields, form]);

  function submit(e) {
    e.preventDefault();
    const errs = validateForm(visible, form, rows, editingId);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave(form);
  }

  function set(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal marketing-modal">
        <div className="modal-head">
          <div className="mt"><i className={`fa-solid ${icon}`} /> {title}</div>
          <button className="modal-x" type="button" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="modal-body marketing-form-grid">
            {visible.map((field) => (
              <FieldInput key={field.key} field={field} value={form[field.key]} error={errors[field.key]} onChange={(v) => set(field.key, v)} />
            ))}
          </div>
          <div className="marketing-modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" type="submit"><i className="fa-solid fa-check" /> {submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FieldInput({ field, value, error, onChange }) {
  const opts = field.type === "select" ? optionsForField(field) : [];

  /* readOnly fields — jaise bucket ka lead count. Ye Lost Pool se
     apne aap gine jaate hain, isliye edit karne ka option nahi
     dena chahiye — warna user badal dega aur number jhootha ho jayega. */
  if (field.readOnly) {
    return (
      <label className="fg">
        <span className="form-label">{field.label}</span>
        <input className="form-control" value={value ?? ""} readOnly disabled />
        {field.hint ? <span className="fg-note">{field.hint}</span> : null}
      </label>
    );
  }

  return (
    <label className="fg" style={field.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
      <span className="form-label">{field.label}{field.required ? " *" : ""}</span>
      {field.type === "select" ? (
        <select className={`form-control${error ? " has-err" : ""}`} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea className={`form-control${error ? " has-err" : ""}`} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={`form-control${error ? " has-err" : ""}`} type={field.type || "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {error ? <span className="fg-err"><i className="fa-solid fa-circle-exclamation" /> {error}</span>
             : field.hint ? <span className="fg-note">{field.hint}</span> : null}
    </label>
  );
}

/* ---------- chhote blocks ---------- */
export function MetricStrip({ metrics, rows }) {
  if (!metrics?.length) return null;
  return (
    <div className="stats marketing-mini-stats">
      {metrics.map((m) => {
        const v = String(metricValue(m, rows));
        return <div className="stat" key={m.label}><div className="k">{m.label}</div><div className={`v${v.length > 9 ? " ho-name" : ""}`}>{v}</div></div>;
      })}
    </div>
  );
}

export function Empty({ icon, text }) {
  return <div className="mod-empty"><i className={`fa-solid ${icon}`} /><p>{text}</p></div>;
}

export function Bar({ value, max, color = "var(--gold)" }) {
  return (
    <div className="vk-bar"><span style={{ width: `${Math.max(2, (num(value) / Math.max(1, max)) * 100)}%`, background: color }} /></div>
  );
}
