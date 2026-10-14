"use client";

/* ============================================================
   components/LeadDaywise.js
   Lead Capture → Inbox Log. Din ke hisaab se leads:
   kis din kitni aayi, kis source se, kis service ke liye.
   ============================================================ */

import { usePaged } from "./Pager";
import { useEffect, useMemo, useState } from "react";
import { pullMetaLeads, lastLeadPull, lastLeadDiagnosis, leadDiagnosisText } from "../lib/meta-pull";
import { datasetKey } from "../lib/marketing-config";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import LeadImport from "./LeadImport";
import { leadState } from "../lib/india-states";
import {
  num, count, digits, dayLabel, statusClass, blankForm, todayISO,
  FormModal, Empty,
} from "./ModuleParts";

const SOURCES = ["Meta", "Google", "Website", "WhatsApp", "Referral", "Marketplace", "Other"];
const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

/* Local (IST) date — toISOString UTC deta hai, jisse raat 12 se 5:30
   tak ki leads pichhle din me chali jaati thi */
function iso(d) { const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function startOf(days) {
  if (days === null) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export default function LeadDaywise({ moduleKey, tab, show }) {
  const ds = datasetKey(moduleKey, tab.key);
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState("all");   /* jitni leads aayi — sab dikhein */
  const [source, setSource] = useState("");
  const [service, setService] = useState("");
  const [flag, setFlag] = useState("");
  const [staff, setStaff] = useState("");
  const [stateF, setStateF] = useState("");   /* state filter */
  const [campF, setCampF] = useState("");     /* campaign filter */
  const [openDay, setOpenDay] = useState(null);
  const [modal, setModal] = useState(null);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState("all");      /* pehle saari leads */
  const [q, setQ] = useState("");
  const [lp, setLp] = useState(1);
  const [pulling, setPulling] = useState(false);
  const [diag, setDiag] = useState(null);
  useEffect(() => {
    const load = () => setDiag(lastLeadDiagnosis());
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  useEffect(() => {
    const load = () => setRows(readRows(ds));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [ds]);

  const dateOf = (r) => String(r[tab.dateField] || r.createdAt || "").slice(0, 10);

  /* Filters lagane ke baad ka data — saare views isi par bante hain. */
  const filtered = useMemo(() => {
    const spec = RANGES.find((r) => r.key === range);
    const from = spec.key === "today" ? iso(new Date()) : (startOf(spec.days) ? iso(startOf(spec.days)) : null);
    return rows.filter((r) => {
      const d = dateOf(r);
      if (spec.key === "today" && d !== iso(new Date())) return false;
      if (from && spec.key !== "today" && d < from) return false;
      if (source && String(r.source || "") !== source) return false;
      if (service && String(r.service || "") !== service) return false;
      if (flag && String(r.flag || "") !== flag) return false;
      if (staff && String(r.assignedTo || "") !== staff) return false;
      if (campF && String(r.campaign || "") !== campF) return false;
      if (stateF && (stateF === "__none" ? leadState(r).state : leadState(r).state !== stateF)) return false;
      return true;
    });
  }, [rows, range, source, service, flag, staff, campF, stateF]);

  const services = useMemo(() => [...new Set(rows.map((r) => r.service).filter(Boolean))].sort(), [rows]);
  const staffList = useMemo(() => [...new Set(rows.map((r) => r.assignedTo).filter(Boolean))].sort(), [rows]);
  const campList = useMemo(() => [...new Set(rows.map((r) => r.campaign).filter(Boolean))].sort(), [rows]);
  const stateList = useMemo(() => [...new Set(rows.map((r) => leadState(r).state).filter(Boolean))].sort(), [rows]);

  /* State-wise — kis state se kitni leads, aur wahan ka top campaign */
  const byState = useMemo(() => {
    const m = {};
    filtered.forEach((r) => {
      const st = leadState(r).state || "Not known";
      const x = m[st] = m[st] || { state: st, total: 0, form: 0, city: 0, camps: {} };
      x.total += 1;
      if (leadState(r).via === "form") x.form += 1; else if (leadState(r).via === "city") x.city += 1;
      const c = r.campaign || "No campaign"; x.camps[c] = (x.camps[c] || 0) + 1;
    });
    return Object.values(m).sort((a, b) => (a.state === "Not known") - (b.state === "Not known") || b.total - a.total);
  }, [filtered]);

  /* KPI strip — sab rows par, filters se independent. */
  const kpi = useMemo(() => {
    const t = iso(new Date());
    const y = iso(new Date(Date.now() - 86400000));
    /* Calendar hafta (Somvar se) aur calendar mahina — pehle "week"
       pichhle 8 din tha, isliye kabhi Week > Month dikh jaata tha */
    const wk = new Date(); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
    const w = iso(wk);
    const m = new Date(); m.setDate(1);
    const mIso = iso(m);
    return {
      today: rows.filter((r) => dateOf(r) === t).length,
      yesterday: rows.filter((r) => dateOf(r) === y).length,
      week: rows.filter((r) => dateOf(r) >= w).length,
      month: rows.filter((r) => dateOf(r) >= mIso).length,
      total: rows.length,
      weekFrom: w, monthName: m.toLocaleString("en-IN", { month: "long" }),
    };
  }, [rows]);

  /* Day-wise rollup with per-source split */
  const days = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const d = dateOf(r) || "—";
      map[d] = map[d] || { date: d, total: 0, sources: {}, services: {}, clean: 0, dup: 0, junk: 0 };
      map[d].total += 1;
      const s = r.source || "Other";
      map[d].sources[s] = (map[d].sources[s] || 0) + 1;
      const sv = r.service || "Unmapped";
      map[d].services[sv] = (map[d].services[sv] || 0) + 1;
      const f = String(r.flag || "Clean");
      if (f === "Duplicate") map[d].dup += 1; else if (f === "Junk") map[d].junk += 1; else map[d].clean += 1;
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered]);

  const chart = useMemo(() => [...days].slice(0, 30).reverse(), [days]);
  const chartMax = Math.max(1, ...chart.map((d) => d.total));

  /* Ads Manager se milaan — campaign-wise. Campaigns ka daily data
     (Meta Sync) wahi range, wahi campaign naam. "Results" me chats bhi
     hote hain; Lead Capture me sirf form leads aati hain — isliye
     asli milaan form leads se. */
  const match = useMemo(() => {
    const spec = RANGES.find((r) => r.key === range);
    const today = iso(new Date());
    const from = spec.key === "today" ? today : (startOf(spec.days) ? iso(startOf(spec.days)) : "");
    const key = (n) => String(n || "").trim().toLowerCase();
    const map = {};
    const row = (name) => {
      const k = key(name) || "__none";
      map[k] = map[k] || { name: name || "", here: 0, fb: 0, ig: 0, results: 0, form: 0, chats: 0, spend: 0, pages: new Set() };
      return map[k];
    };
    filtered.forEach((r) => {
      if (!r.extId) return; /* sirf Meta se aayi leads */
      const m = row(r.campaign);
      m.here += 1;
      if (r.source === "Instagram") m.ig += 1; else m.fb += 1;
      if (r.account) m.pages.add(r.account);
    });
    readRows("campaigns__daily-stats").forEach((d) => {
      if (d.source !== "Meta Sync") return;
      const dt = String(d.date || "").slice(0, 10);
      if (from && dt < from) return;
      if (dt > today) return;
      const m = row(d.campaign);
      m.results += Number(d.results ?? d.leads ?? 0) || 0;
      m.form += Number(d.formLeads || 0) || 0;
      m.chats += Number(d.chats || 0) || 0;
      m.spend += Number(d.spend || 0) || 0;
    });
    const list = Object.values(map).map((m) => ({ ...m, pages: [...m.pages], gap: m.here - m.form }));
    list.sort((a, b) => (b.results + b.here) - (a.results + a.here));
    const t = list.reduce((a, m) => ({ here: a.here + m.here, form: a.form + m.form, chats: a.chats + m.chats, results: a.results + m.results }), { here: 0, form: 0, chats: 0, results: 0 });
    const noCamp = list.find((m) => !m.name);
    return { list, t, noCamp: noCamp ? noCamp.here : 0 };
  }, [filtered, range, rows]);

  const bySource = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const s = r.source || "Other";
      map[s] = map[s] || { source: s, total: 0, clean: 0, dup: 0, junk: 0 };
      map[s].total += 1;
      const f = String(r.flag || "Clean");
      if (f === "Duplicate") map[s].dup += 1; else if (f === "Junk") map[s].junk += 1; else map[s].clean += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byService = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const s = r.service || "Unmapped";
      map[s] = map[s] || { service: s, total: 0, sources: {} };
      map[s].total += 1;
      const src = r.source || "Other";
      map[s].sources[src] = (map[s].sources[src] || 0) + 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  /* Sirf edit — number kabhi nahi badalta (purana hi rehta hai) */
  function save(form) {
    if (!modal?.editingId) return;
    const now = new Date().toISOString();
    const next = rows.map((r) => (r.id === modal.editingId ? { ...r, ...form, phone: r.phone, updatedAt: now } : r));
    logActivity({ dataset: ds, action: "Updated", target: form.name, detail: "Lead edited" });
    show("Lead updated.", "success");
    setRows(next); writeRows(ds, next); setModal(null);
  }

  /* Import — nayi leads sabse upar. Leads delete nahi hoti. */
  function addImported(list) {
    const next = [...list, ...readRows(ds)];
    setRows(next); writeRows(ds, next); setImporting(false);
  }

  /* Edit form me Phone sirf dikhta hai, badalta nahi */
  const editTab = useMemo(() => ({
    ...tab,
    fields: tab.fields.map((f) => (f.key === "phone" ? { ...f, readOnly: true, rules: [], hint: "Phone number can't be changed" } : f)),
  }), [tab]);

  function exportCsv() {
    const cols = ["receivedAt", "name", "phone", "email", "source", "campaign", "service", "assignedTo", "flag", "stage", "status"];
    const head = cols.join(",");
    const body = filtered.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${range}-${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    show(`${filtered.length} leads exported.`, "success");
  }

  const dayRows = openDay ? filtered.filter((r) => dateOf(r) === openDay) : [];
  /* Pagination — har table me 10 ke baad agla page */
  const pgDays = usePaged(days);
  const pgSrc = usePaged(bySource);
  const pgMatch = usePaged(match.list);
  const pgSvc = usePaged(byService);
  const pgState = usePaged(byState);
  const pgDay = usePaged(dayRows, openDay || "");

  /* All leads — naya sabse upar, search, 10 per page */
  const LPP = 10;
  const allRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? filtered.filter((r) => [r.name, r.phone, r.email, r.city, leadState(r).state, r.service, r.campaign, r.adName].some((v) => String(v || "").toLowerCase().includes(t))) : filtered;
    /* Meta ka asli waqt (receivedTime) pehle — ek din ki leads bhi sahi kram me */
    const key = (r) => `${dateOf(r)}|${r.receivedTime || r.createdAt || ""}`;
    return [...list].sort((a, b) => key(b).localeCompare(key(a)));
  }, [filtered, q]);
  const lPages = Math.max(1, Math.ceil(allRows.length / LPP));
  useEffect(() => { setLp(1); }, [q, range, source, service, flag, staff, campF, stateF]);
  const lRows = allRows.slice((lp - 1) * LPP, lp * LPP);

  async function pullNow() {
    setPulling(true);
    try {
      const r = await pullMetaLeads({});
      setDiag(lastLeadDiagnosis());
      if (!r.ok) show(r.error, "error");
      else if (r.added) show(`${r.added} new leads — Facebook ${r.fb}, Instagram ${r.ig}.`, "success");
      else if (r.diagnosis && r.diagnosis.reason !== "none-found") show(leadDiagnosisText(r.diagnosis).title, "error");
      else show(r.checked ? "All leads from Meta are already here." : `No new leads. ${r.adsChecked} lead ads checked.`, "success");
    } finally { setPulling(false); }
  }

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" type="button" disabled={pulling} onClick={pullNow}
            title="Also runs automatically every 15 minutes while the panel is open">
            <i className={`fa-${pulling ? "solid fa-spinner fa-spin" : "brands fa-meta"}`} /> {pulling ? "Pulling leads..." : "Pull leads from Meta"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={exportCsv}><i className="fa-solid fa-file-csv" /> Export CSV</button>
          <button className="btn btn-gold" type="button" onClick={() => setImporting(true)}>
            <i className="fa-solid fa-file-import" /> Import Leads
          </button>
        </div>
      </div>

      {diag && diag.reason !== "none-found" ? (() => {
        const t = leadDiagnosisText(diag);
        return (
          <div className="lc-diag" role="alert">
            <i className="fa-solid fa-triangle-exclamation" />
            <div>
              <b>{t.title}</b>
              <p>{t.body}</p>
              <span className="lc-diag-facts">
                {diag.adsChecked} lead ads checked · {diag.pagesWithToken ?? diag.pages} page{(diag.pagesWithToken ?? diag.pages) === 1 ? "" : "s"} readable · {diag.forms} lead form{diag.forms === 1 ? "" : "s"}{diag.formLeadTotal ? ` · Meta counts ${diag.formLeadTotal.toLocaleString("en-IN")} leads` : ""}
              </span>
              {diag.scopesKnown ? (
                <span className="lc-diag-scopes">
                  {diag.tokenVar || "Token"} permissions:{" "}
                  {["ads_read", "leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads"].map((sc) => (
                    <em key={sc} className={(diag.scopes || []).includes(sc) ? "ok" : "no"}>
                      <i className={`fa-solid ${(diag.scopes || []).includes(sc) ? "fa-check" : "fa-xmark"}`} /> {sc}
                    </em>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      <div className="stats marketing-mini-stats lc-kpis">
        <div className="stat"><div className="k">Today</div><div className="v">{count(kpi.today)}</div></div>
        <div className="stat"><div className="k">Yesterday</div><div className="v">{count(kpi.yesterday)}</div></div>
        <div className="stat" title="Monday to today"><div className="k">This Week <small className="lc-k-sub">since Mon</small></div><div className="v">{count(kpi.week)}</div></div>
        <div className="stat" title="1st of this month to today"><div className="k">This Month <small className="lc-k-sub">{kpi.monthName}</small></div><div className="v">{count(kpi.month)}</div></div>
        <div className="stat"><div className="k">All Time</div><div className="v">{count(kpi.total)}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-filter" /> &nbsp;Filters</div>
          <div className="card-tools"><span className="cnt">{filtered.length} lead{filtered.length === 1 ? "" : "s"}</span></div>
        </div>
        <div className="lc-filters">
          <select className="form-control" value={range} onChange={(e) => { setRange(e.target.value); setOpenDay(null); }}>
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select className="form-control" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-control" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">All services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-control" value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="">All leads</option>
            <option value="Clean">Clean only</option>
            <option value="Duplicate">Duplicates</option>
            <option value="Junk">Junk</option>
          </select>
          <select className="form-control" value={staff} onChange={(e) => setStaff(e.target.value)}>
            <option value="">All staff</option>
            {staffList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-control" value={campF} onChange={(e) => setCampF(e.target.value)} title="Filter by campaign">
            <option value="">All campaigns</option>
            {campList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-control" value={stateF} onChange={(e) => setStateF(e.target.value)} title="Filter by state">
            <option value="">All states</option>
            {stateList.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="__none">State not known</option>
          </select>
        </div>
      </div>

      <div className="hl-tabs" style={{ marginTop: 2 }}>
        {[["all", "All leads", "fa-list"], ["days", "Day-wise", "fa-calendar-days"], ["source", "By Source", "fa-diagram-project"], ["service", "By Service", "fa-briefcase"], ["state", "By State", "fa-map-location-dot"], ["match", "Match with Ads Manager", "fa-scale-balanced"]].map(([k, l, i]) => (
          <button key={k} type="button" className={`hl-tab${view === k ? " on" : ""}`} onClick={() => { setView(k); setOpenDay(null); }}>
            <i className={`fa-solid ${i}`} /> &nbsp;{l}
          </button>
        ))}
      </div>

      {view === "all" ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-solid fa-list" /> &nbsp;All leads</div>
            <div className="card-tools">
              <label className="mini-search"><i className="fa-solid fa-magnifying-glass" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, city, campaign" aria-label="Search leads" />
              </label>
              <span className="cnt">{allRows.length} lead{allRows.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          {allRows.length ? (
            <>
              <div className="tbl-scroll">
                <table className="mod-table lc-all">
                  <thead><tr><th>Received</th><th>Lead</th><th>Source</th><th>Service</th><th>City / State</th><th>Campaign / ad</th><th>Flag</th><th>Stage</th><th className="ta-r">Actions</th></tr></thead>
                  <tbody>{lRows.map((r) => (
                    <tr key={r.id}>
                      <td><span className="tc-date">{dayLabel(dateOf(r))}</span></td>
                      <td><b>{r.name || "—"}</b><div className="lc-sub">{r.phone ? `+91 ${r.phone}` : "No phone"}{r.email ? ` · ${r.email}` : ""}</div></td>
                      <td><span className="tc-ch" style={{ "--c": r.source === "Instagram" ? "#D62976" : r.source === "Facebook" ? "#1877F2" : r.source === "Website" ? "#0F766E" : "#9A9EAA" }}><i />{r.source || "—"}</span></td>
                      <td>{r.service || <span className="mut">—</span>}</td>
                      <td>{(() => { const ls = leadState(r); return <>{r.city ? <div>{r.city}</div> : null}{ls.state ? <div className={r.city ? "lc-sub" : ""}><i className="fa-solid fa-location-dot" style={{ fontSize: 10, marginRight: 4, color: "#9A9EAA" }} />{ls.state}{ls.via === "city" ? <span className="lc-via" title="Worked out from the city"> · from city</span> : null}</div> : (!r.city ? <span className="mut">—</span> : null)}</>; })()}</td>
                      <td><div className="lc-camp">{r.campaign || "—"}</div>{r.adName ? <div className="lc-sub">{r.adName}</div> : null}</td>
                      <td><span className={`pill ${statusClass(r.flag)}`}>{r.flag || "Clean"}</span></td>
                      <td><span className={`pill ${statusClass(r.stage)}`}>{r.stage || "New"}</span></td>
                      <td>
                        <div className="row-actions">
                          {digits(r.phone) ? <a className="icon-btn" title="Call" href={`tel:+91${digits(r.phone)}`}><i className="fa-solid fa-phone" /></a> : null}
                          {digits(r.phone) ? <a className="icon-btn" title="WhatsApp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/91${digits(r.phone)}`}><i className="fa-brands fa-whatsapp" /></a> : null}
                          <button className="icon-btn" type="button" title="Edit" onClick={() => setModal({ editingId: r.id, initial: { ...blankForm(tab.fields), ...r } })}><i className="fa-solid fa-pen" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {lPages > 1 ? (
                <nav className="pgr" aria-label="Pages">
                  <span className="pgr-info">Showing <b>{(lp - 1) * LPP + 1}–{Math.min(lp * LPP, allRows.length)}</b> of <b>{allRows.length}</b></span>
                  <div className="pgr-btns">
                    <button type="button" className="pgr-btn" disabled={lp === 1} onClick={() => setLp(lp - 1)}><i className="fa-solid fa-chevron-left" /><span>Prev</span></button>
                    {Array.from({ length: lPages }, (_, i) => i + 1).filter((n) => n === 1 || n === lPages || Math.abs(n - lp) <= 1).map((n, i, arr) => (
                      <span key={n} style={{ display: "contents" }}>
                        {i > 0 && n - arr[i - 1] > 1 ? <span className="pgr-dots">…</span> : null}
                        <button type="button" className={`pgr-num${n === lp ? " on" : ""}`} onClick={() => setLp(n)}>{n}</button>
                      </span>
                    ))}
                    <button type="button" className="pgr-btn" disabled={lp === lPages} onClick={() => setLp(lp + 1)}><span>Next</span><i className="fa-solid fa-chevron-right" /></button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : <Empty icon="fa-inbox" text={rows.length ? "No leads match these filters." : "No leads yet. Press \"Pull leads from Meta\" — it also runs automatically every 15 minutes."} />}
        </div>
      ) : null}

      {view === "days" ? (
        <>
          <div className="card">
            <div className="card-head"><div className="ttl"><i className="fa-solid fa-chart-column" /> &nbsp;Daily lead flow</div>
              <div className="card-tools"><span className="cnt">{chart.length} days</span></div></div>
            <div className="settings-body">
              {chart.length ? (
                <div className="lc-chart">
                  {chart.map((d) => (
                    <button type="button" className={`lc-bar${openDay === d.date ? " on" : ""}`} key={d.date}
                      title={`${dayLabel(d.date)} · ${d.total} leads`} onClick={() => setOpenDay(openDay === d.date ? null : d.date)}>
                      <span className="lc-bar-fill" style={{ height: `${Math.max(4, (d.total / chartMax) * 100)}%` }} />
                      <span className="lc-bar-n">{d.total}</span>
                      <span className="lc-bar-d">{dayLabel(d.date)}</span>
                    </button>
                  ))}
                </div>
              ) : <Empty icon="fa-chart-column" text="No leads found in this range." />}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="ttl"><i className="fa-solid fa-calendar-days" /> &nbsp;Day-wise breakdown</div>
              <div className="card-tools"><span className="cnt">Click a row — that day's leads will open</span></div></div>
            {days.length ? (
              <div className="tbl-scroll">
                <table className="mod-table">
                  <thead>
                    <tr><th>Date</th><th>Total</th>{SOURCES.slice(0, 6).map((s) => <th key={s}>{s}</th>)}<th>Top Service</th><th>Quality</th></tr>
                  </thead>
                  <tbody>
                    {pgDays.rows.map((d) => {
                      const top = Object.entries(d.services).sort((a, b) => b[1] - a[1])[0];
                      return (
                        <tr key={d.date} className={`lc-row${openDay === d.date ? " on" : ""}`} onClick={() => setOpenDay(openDay === d.date ? null : d.date)} style={{ cursor: "pointer" }}>
                          <td><b>{dayLabel(d.date)}</b>{d.date === iso(new Date()) ? <span className="pill pill-active" style={{ marginLeft: 6 }}>Today</span> : null}</td>
                          <td><b>{d.total}</b></td>
                          {SOURCES.slice(0, 6).map((s) => <td key={s}>{d.sources[s] ? count(d.sources[s]) : <span className="mut">—</span>}</td>)}
                          <td>{top ? `${top[0]} (${top[1]})` : "—"}</td>
                          <td>
                            {d.dup ? <span className="pill pill-default" style={{ marginRight: 4 }}>{d.dup} dup</span> : null}
                            {d.junk ? <span className="pill pill-off">{d.junk} junk</span> : null}
                            {!d.dup && !d.junk ? <span className="pill pill-active">Clean</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon="fa-calendar-days" text="No leads found for this filter." />}
          {pgDays.pager}
          </div>
        </>
      ) : null}

      {view === "source" ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-diagram-project" /> &nbsp;Source-wise summary</div></div>
          {bySource.length ? (
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>Source</th><th>Leads</th><th>Clean</th><th>Duplicate</th><th>Junk</th><th>Share</th></tr></thead>
                <tbody>{pgSrc.rows.map((s) => (
                  <tr key={s.source}>
                    <td><b>{s.source}</b></td>
                    <td><b>{count(s.total)}</b></td>
                    <td>{count(s.clean)}</td>
                    <td>{s.dup ? count(s.dup) : <span className="mut">—</span>}</td>
                    <td>{s.junk ? count(s.junk) : <span className="mut">—</span>}</td>
                    <td>
                      <div className="vk-bar" style={{ marginBottom: 4 }}><span style={{ width: `${(s.total / filtered.length) * 100}%`, background: "var(--gold)" }} /></div>
                      {((s.total / filtered.length) * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty icon="fa-diagram-project" text="No data for this filter." />}
          {pgSrc.pager}
        </div>
      ) : null}

      {view === "state" ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-solid fa-map-location-dot" /> &nbsp;State-wise summary</div>
            <div className="card-tools"><span className="cnt">{campF ? campF : "All campaigns"} · click a state to see its leads</span></div>
          </div>
          {byState.length ? (
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>State</th><th>Leads</th><th>Share</th><th>Top campaign</th><th>From form / from city</th></tr></thead>
                <tbody>{pgState.rows.map((x) => {
                  const top = Object.entries(x.camps).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <tr key={x.state} style={{ cursor: x.state === "Not known" ? "default" : "pointer" }} onClick={() => { if (x.state !== "Not known") { setStateF(x.state); setView("all"); } else { setStateF("__none"); setView("all"); } }}>
                      <td><b>{x.state === "Not known" ? <span className="mut">State not known</span> : x.state}</b></td>
                      <td><b>{count(x.total)}</b></td>
                      <td>
                        <div className="vk-bar" style={{ marginBottom: 4 }}><span style={{ width: `${(x.total / Math.max(1, filtered.length)) * 100}%`, background: "var(--gold)" }} /></div>
                        {((x.total / Math.max(1, filtered.length)) * 100).toFixed(0)}%
                      </td>
                      <td>{top ? `${top[0]} (${top[1]})` : "—"}</td>
                      <td className="mut">{x.state === "Not known" ? "form has no state / city" : `${count(x.form)} / ${count(x.city)}`}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <Empty icon="fa-map-location-dot" text="No data for this filter." />}
          {pgState.pager}
          <p className="lc-state-note"><i className="fa-solid fa-circle-info" /> State comes from the lead form when it asks for it; otherwise it is worked out from the city. For Meta's own state-wise numbers of every campaign, open Campaigns → States.</p>
        </div>
      ) : null}

      {view === "match" ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-scale-balanced" /> &nbsp;Lead Capture vs Ads Manager — {RANGES.find((r) => r.key === range)?.label}</div></div>
          <div className="lm-sum">
            <div><span>Ads Manager results</span><b>{count(match.t.results)}</b><em>everything Meta counts</em></div>
            <div className="lm-eq">=</div>
            <div><span>Form leads</span><b>{count(match.t.form)}</b><em>come to Lead Capture</em></div>
            <div className="lm-eq">+</div>
            <div><span>Chats</span><b>{count(match.t.chats)}</b><em>WhatsApp / Messenger — never here</em></div>
            <div className="lm-eq">vs</div>
            <div className="lm-here"><span>In Lead Capture</span><b>{count(match.t.here)}</b><em>from Meta, this range</em></div>
          </div>
          <p className="lm-note">
            Compare <b>Form leads</b> with <b>In Lead Capture</b> — not Results. Small gaps are normal: Ads Manager can count a lead on the day the ad was seen, Lead Capture on the day the form was filled.
            {match.noCamp ? <> {count(match.noCamp)} leads have no campaign (organic form, or a Page/ad account not connected in Ad Accounts).</> : null}
          </p>
          {match.list.length ? (
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>Campaign</th><th>Results (Ads Mgr)</th><th>Form leads</th><th>Chats</th><th>In Lead Capture</th><th>Gap</th></tr></thead>
                <tbody>{pgMatch.rows.map((m) => (
                  <tr key={m.name || "__none"}>
                    <td><b>{m.name || "No campaign (organic / other Page)"}</b>{m.pages.length ? <div className="mut" style={{ fontSize: 11.5 }}>{m.pages.join(", ")}</div> : null}</td>
                    <td>{m.results ? count(m.results) : <span className="mut">—</span>}</td>
                    <td>{m.form ? count(m.form) : <span className="mut">—</span>}</td>
                    <td>{m.chats ? count(m.chats) : <span className="mut">—</span>}</td>
                    <td><b>{count(m.here)}</b>{m.here ? <div className="mut" style={{ fontSize: 11.5 }}>FB {m.fb} · IG {m.ig}</div> : null}</td>
                    <td>{!m.name || (!m.form && !m.here) ? <span className="mut">—</span>
                      : Math.abs(m.gap) <= Math.max(1, m.form * 0.05) ? <span className="pill pill-active">Matches</span>
                      : <span className={`pill ${m.gap < 0 ? "pill-off" : "pill-default"}`}>{m.gap > 0 ? "+" : ""}{m.gap}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty icon="fa-scale-balanced" text="No Meta data for this range yet — run Sync Meta in Campaigns." />}
          {pgMatch.pager}
        </div>
      ) : null}

      {view === "service" ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-briefcase" /> &nbsp;Service-wise summary</div></div>
          {byService.length ? (
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>Service</th><th>Leads</th><th>Top Source</th><th>Share</th></tr></thead>
                <tbody>{pgSvc.rows.map((s) => {
                  const top = Object.entries(s.sources).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <tr key={s.service}>
                      <td><b>{s.service}</b></td>
                      <td><b>{count(s.total)}</b></td>
                      <td>{top ? `${top[0]} (${top[1]})` : "—"}</td>
                      <td>
                        <div className="vk-bar" style={{ marginBottom: 4 }}><span style={{ width: `${(s.total / filtered.length) * 100}%`, background: "var(--gold)" }} /></div>
                        {((s.total / filtered.length) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <Empty icon="fa-briefcase" text="No data for this filter." />}
          {pgSvc.pager}
        </div>
      ) : null}

      {openDay ? (
        <div className="card">
          <div className="card-head">
            <div className="ttl"><i className="fa-solid fa-list" /> &nbsp;{dayLabel(openDay)} · {dayRows.length} lead{dayRows.length === 1 ? "" : "s"}</div>
            <div className="card-tools"><button className="btn btn-ghost" type="button" onClick={() => setOpenDay(null)}><i className="fa-solid fa-xmark" /> Close</button></div>
          </div>
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Campaign</th><th>Service</th><th>Assigned</th><th>Flag</th><th>Stage</th><th className="ta-r">Actions</th></tr></thead>
              <tbody>{pgDay.rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b></td>
                  <td>{r.phone || "—"}</td>
                  <td>{r.source || "—"}</td>
                  <td>{r.campaign || "—"}</td>
                  <td>{r.service || "—"}</td>
                  <td>{r.assignedTo || <span className="mut">Unassigned</span>}</td>
                  <td><span className={`pill ${statusClass(r.flag)}`}>{r.flag || "Clean"}</span></td>
                  <td><span className={`pill ${statusClass(r.stage)}`}>{r.stage || "New"}</span></td>
                  <td>
                    <div className="row-actions">
                      {digits(r.phone) ? <a className="icon-btn" title="Call" href={`tel:+91${digits(r.phone)}`}><i className="fa-solid fa-phone" /></a> : null}
                      {digits(r.phone) ? <a className="icon-btn" title="WhatsApp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/91${digits(r.phone)}`}><i className="fa-brands fa-whatsapp" /></a> : null}
                      <button className="icon-btn" type="button" title="Edit" onClick={() => setModal({ editingId: r.id, initial: { ...blankForm(tab.fields), ...r } })}><i className="fa-solid fa-pen" /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pgDay.pager}
        </div>
      ) : null}

      {importing ? <LeadImport rows={rows} fields={tab.fields} show={show} onDone={addImported} onClose={() => setImporting(false)} /> : null}
      {modal ? (
        <FormModal tab={editTab} rows={rows} editingId={modal.editingId} initial={modal.initial}
          icon="fa-pen" title="Edit Lead"
          onSave={save} onClose={() => setModal(null)} />
      ) : null}
    </>
  );
}
