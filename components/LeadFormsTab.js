"use client";

/* ============================================================
   components/LeadFormsTab.js — Campaigns → "Lead Forms"

   Abhi jo campaigns chal rahe hain, unke ads kaunsa lead form use kar
   rahe hain, aur us form me kaun-kaun se sawaal (columns) hain — naam,
   type (Full name / Phone / Email / Custom), aur options. Data seedha
   Meta se aata hai. Aakhri baar ka result browser me rakha rehta hai,
   taaki page khulte hi dikh jaaye; "Refresh from Meta" se naya.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { usePaged } from "./Pager";
import LeadFormDetails, { TYPE_LABEL, TYPE_ICON } from "./LeadFormDetails";

const CACHE = "vk_meta_lead_forms";

const OBJ = { OUTCOME_LEADS: "Leads", OUTCOME_ENGAGEMENT: "Engagement", OUTCOME_AWARENESS: "Awareness", OUTCOME_TRAFFIC: "Traffic", OUTCOME_SALES: "Sales", OUTCOME_APP_PROMOTION: "App promotion", LEAD_GENERATION: "Leads", MESSAGES: "Messages" };

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* */ } };

export default function LeadFormsTab({ tab }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");   /* all · with form · without form */

  async function load() {
    const ids = [...new Set(readRows("ad-accounts__accounts").filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setErr("Connect a Meta account in Ad Accounts first."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/meta/lead-forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds: ids }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || "Could not load lead forms from Meta");
      else { setData(j); writeCache(j); }
    } catch { setErr("Could not reach the server"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const c = readCache();
    if (c) setData(c);
    /* Aakhri baar 1 ghante se purana ho (ya kabhi nahi laaya) to apne aap */
    if (!c || Date.now() - Date.parse(c.at || 0) > 3600000) load();
  }, []);

  const names = useMemo(() => {
    const m = {}; readRows("ad-accounts__accounts").forEach((a) => { m[String(a.accountId || "").trim()] = a.name; }); return m;
  }, [data]);

  const view = useMemo(() => {
    if (!data) return null;
    const forms = data.forms || {};
    const t = q.trim().toLowerCase();
    const list = (data.campaigns || []).map((c) => {
      const fids = [...new Set(c.ads.flatMap((a) => a.formIds))];
      return { ...c, fids, noForm: c.ads.filter((a) => !a.formIds.length) };
    }).filter((c) => {
      if (only === "with" && !c.fids.length) return false;
      if (only === "without" && c.fids.length) return false;
      if (!t) return true;
      const hay = [c.name, ...c.ads.map((a) => a.name), ...c.fids.flatMap((f) => [forms[f]?.name, ...(forms[f]?.questions || []).map((x) => x.label)])].join(" ").toLowerCase();
      return hay.includes(t);
    });
    /* Saare forms me kaun-se columns kitni baar */
    const used = new Set((data.campaigns || []).flatMap((c) => c.ads.flatMap((a) => a.formIds)));
    const cols = {};
    used.forEach((f) => (forms[f]?.questions || []).forEach((x) => {
      const k = x.type === "CUSTOM" ? `C:${x.label}` : x.type;
      cols[k] = cols[k] || { label: x.type === "CUSTOM" ? x.label : (TYPE_LABEL[x.type] || x.label), icon: TYPE_ICON[x.type] || "fa-circle-question", n: 0, custom: x.type === "CUSTOM" };
      cols[k].n += 1;
    }));
    return {
      list, forms,
      stats: { camps: (data.campaigns || []).length, forms: used.size, without: (data.campaigns || []).filter((c) => !c.ads.some((a) => a.formIds.length)).length, ads: (data.campaigns || []).reduce((x, c) => x + c.ads.length, 0) },
      cols: Object.values(cols).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    };
  }, [data, q, only]);

  const pg = usePaged(view?.list || [], `${q}|${only}`);

  return (
    <div className="lf">
      <div className="lf-head">
        <div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div>
        <div className="lf-acts">
          {data?.at ? <span className="lf-at"><i className="fa-solid fa-rotate" /> Loaded {new Date(data.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={load}>
            <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {busy ? "Loading from Meta..." : "Refresh from Meta"}
          </button>
        </div>
      </div>

      {err ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
      {data?.errors?.length ? <div className="lf-err warn"><i className="fa-solid fa-circle-info" /> {data.errors.map((e) => `${names[e.where] || e.where}: ${e.message}`).join(" · ")}</div> : null}

      {!view ? (
        <div className="card"><div className="lf-empty"><i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rectangle-list"}`} /><b>{busy ? "Reading running ads and their lead forms from Meta..." : "No data yet"}</b><span>Press "Refresh from Meta" to load.</span></div></div>
      ) : (
        <>
          <div className="lf-stats">
            <div><span>Running campaigns</span><b>{view.stats.camps}</b></div>
            <div><span>Running ads</span><b>{view.stats.ads}</b></div>
            <div><span>Lead forms in use</span><b>{view.stats.forms}</b></div>
            <div><span>Campaigns without a form</span><b>{view.stats.without}</b><em>WhatsApp / website / messages ads</em></div>
          </div>

          {view.cols.length ? (
            <div className="card lf-cols">
              <div className="lf-cols-h"><i className="fa-solid fa-table-columns" /> <b>Columns asked across all running forms</b><span>number = how many forms ask it</span></div>
              <div className="lf-chips">
                {view.cols.map((c) => (
                  <span key={c.label} className={`lf-chip${c.custom ? " custom" : ""}`}><i className={`fa-solid ${c.icon}`} /> {c.label} <em>{c.n}</em></span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="lf-tools">
            <label className="mini-search lf-search"><i className="fa-solid fa-magnifying-glass" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign, form or question..." /></label>
            <div className="sq-seg" role="group" aria-label="Show">
              {[["all", "All"], ["with", "With form"], ["without", "Without form"]].map(([k, l]) => (
                <button key={k} type="button" className={only === k ? "on" : ""} onClick={() => setOnly(k)}>{l}</button>
              ))}
            </div>
          </div>

          {view.list.length ? pg.rows.map((c) => (
            <section className="card lf-camp" key={c.id || c.name}>
              <div className="lf-camp-h">
                <span className="lf-camp-ic"><i className="fa-solid fa-bullhorn" /></span>
                <div className="lf-camp-tt">
                  <b>{c.name}</b>
                  <div className="lf-sub">
                    <span className="pill pill-active"><span className="dot">●</span>Running</span>
                    {c.objective ? <span className="ad-obj">{OBJ[c.objective] || c.objective}</span> : null}
                    <span>{names[c.account] || c.account}</span>
                    <span>{c.ads.length} ad{c.ads.length === 1 ? "" : "s"} running</span>
                  </div>
                </div>
              </div>

              {c.fids.length ? c.fids.map((fid) => {
                const f = view.forms[fid];
                const usedBy = c.ads.filter((a) => a.formIds.includes(fid));
                return (
                  <LeadFormDetails key={fid} fid={fid} f={f} usedBy={usedBy} />
                );
              }) : null}

              {c.noForm.length ? (
                <div className="lf-noform">
                  <i className="fa-solid fa-circle-info" />
                  <span>{c.fids.length ? `${c.noForm.length} other ad${c.noForm.length === 1 ? "" : "s"} in this campaign have` : "This campaign's ads have"} no lead form — they send people to {[...new Set(c.noForm.map((a) => (a.destination === "WHATSAPP" ? "WhatsApp" : a.destination === "MESSENGER" ? "Messenger" : a.destination === "INSTAGRAM_DIRECT" ? "Instagram DM" : a.destination === "WEBSITE" ? "a website" : a.cta ? a.cta.replace(/_/g, " ").toLowerCase() : "a non-form destination")))].join(" / ")}.</span>
                </div>
              ) : null}
            </section>
          )) : <div className="card"><div className="lf-empty"><i className="fa-solid fa-magnifying-glass" /><b>Nothing found</b><span>No running campaign matches this search.</span></div></div>}
          {pg.pager}
        </>
      )}
    </div>
  );
}
