"use client";

/* ============================================================
   components/CampaignAds.js — ek Active campaign ke andar ke ads

   Campaigns → Active campaign → "Ads" button → ye drawer.
   Kholte hi Meta se taaza data aata hai (store nahi hota), wahi
   date range jo Campaigns ke filter me chuni hai.

   Sirf dekhna — yahan se kuch badalta nahi.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import LeadFormDetails from "./LeadFormDetails";
import { money, money2, count } from "./ModuleParts";
import AdPreview from "./AdPreview";

const STATUS_TONE = {
  Live: "pill-active", Paused: "pill-default", "Ad set off": "pill-default", "Campaign off": "pill-default",
  "In review": "pill-default", Rejected: "pill-off", Issue: "pill-off", Deleted: "pill-off", Archived: "pill-off", "Billing pending": "pill-off",
};
const FILTERS = ["All", "Live", "Paused", "In review", "Rejected"];
const isPaused = (s) => s === "Paused" || s === "Ad set off" || s === "Campaign off";

export default function CampaignAds({ campaign, from, to, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [flt, setFlt] = useState("All");
  const [sort, setSort] = useState("spend");
  const [at, setAt] = useState(null);
  const [view, setView] = useState(null);
  /* "View form details" — campaign ke ads ke lead forms, pehli baar
     click karne par Meta se (phir yaad rehte hain) */
  const [forms, setForms] = useState({ loading: false, data: null, error: "" });
  const [formFor, setFormFor] = useState(null);
  async function toggleForm(adId) {
    if (formFor === adId) { setFormFor(null); return; }
    setFormFor(adId);
    if (forms.data || forms.loading) return;
    setForms({ loading: true, data: null, error: "" });
    try {
      const r = await fetch("/api/meta/lead-forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: campaign.extId }) });
      const j = await r.json().catch(() => ({}));
      setForms(r.ok ? { loading: false, data: j, error: "" } : { loading: false, data: null, error: j.error || "Could not load the form from Meta" });
    } catch { setForms({ loading: false, data: null, error: "Could not reach the server" }); }
  }

  async function load() {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const q = new URLSearchParams({ campaignId: campaign.extId, since: from, until: to });
      const r = await fetch(`/api/meta/ads?${q}`);
      const j = await r.json();
      if (!r.ok) setState({ loading: false, error: j.error || "Could not load ads" });
      else { setState({ loading: false, ads: j.ads || [] }); setAt(new Date()); }
    } catch {
      setState({ loading: false, error: "Could not reach the server" });
    }
  }
  useEffect(() => { load(); }, [campaign.extId, from, to]);

  /* Campaign ke naam / "View lead form" se khula — pehle ad ka form apne aap khol do */
  useEffect(() => {
    if (!campaign.openForm || formFor || !state.ads?.length) return;
    const first = state.ads.find((a) => a.status !== "Deleted") || state.ads[0];
    if (first) toggleForm(first.id);
  }, [state.ads]);

  /* Esc se band */
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !view) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, view]);

  const ads = state.ads || [];
  const counts = useMemo(() => ({
    All: ads.length,
    Live: ads.filter((a) => a.status === "Live").length,
    Paused: ads.filter((a) => isPaused(a.status)).length,
    "In review": ads.filter((a) => a.status === "In review").length,
    Rejected: ads.filter((a) => a.status === "Rejected" || a.status === "Issue").length,
  }), [ads]);

  const total = useMemo(() => {
    const t = { spend: 0, results: 0, impressions: 0, linkClicks: 0, formLeads: 0, chats: 0 };
    ads.forEach((a) => { Object.keys(t).forEach((k) => { t[k] += a.all[k] || 0; }); });
    t.spend = Math.round(t.spend * 100) / 100;
    return t;
  }, [ads]);

  const shown = useMemo(() => {
    let l = ads;
    if (flt === "Live") l = l.filter((a) => a.status === "Live");
    else if (flt === "Paused") l = l.filter((a) => isPaused(a.status));
    else if (flt === "In review") l = l.filter((a) => a.status === "In review");
    else if (flt === "Rejected") l = l.filter((a) => a.status === "Rejected" || a.status === "Issue");
    const cpr = (a) => (a.all.results ? a.all.spend / a.all.results : Infinity);
    const by = {
      spend: (a, b) => b.all.spend - a.all.spend,
      results: (a, b) => b.all.results - a.all.results,
      cheap: (a, b) => cpr(a) - cpr(b),
      costly: (a, b) => (b.all.results ? cpr(b) : -1) - (a.all.results ? cpr(a) : -1),
    }[sort];
    return [...l].sort(by);
  }, [ads, flt, sort]);

  /* Sasta / mehnga pehchaan — campaign ke average cost per result se */
  const avgCpr = total.results ? total.spend / total.results : 0;

  return (
    <div className="ca-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ca-drawer" role="dialog" aria-label="Campaign ads">
        <div className="ca-head">
          <div>
            <div className="ca-kicker"><i className="fa-brands fa-meta" /> Campaign ads · {fmtD(from)} – {fmtD(to)}</div>
            <h3>{campaign.name}</h3>
            <div className="ca-sub">{campaign.account || ""}{at ? `· Loaded from Meta at ${at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
          </div>
          <div className="ca-head-r">
            <button type="button" className="btn btn-ghost" disabled={state.loading} onClick={load}>
              <i className={`fa-solid ${state.loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
            </button>
            <button type="button" className="ca-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>

        {state.error ? (
          <div className="ca-err"><i className="fa-solid fa-triangle-exclamation" /> {state.error}</div>
        ) : state.loading && !state.ads ? (
          <div className="ca-loading"><i className="fa-solid fa-spinner fa-spin" /> Loading ads from Meta...</div>
        ) : (
          <>
            <div className="ca-counts">
              <div className="ca-count live"><b>{count(counts.Live)}</b><span>Live ads</span></div>
              <div className="ca-count"><b>{count(counts.Paused)}</b><span>Paused</span></div>
              <div className="ca-count"><b>{count(counts["In review"])}</b><span>In review</span></div>
              <div className="ca-count bad"><b>{count(counts.Rejected)}</b><span>Rejected / Issue</span></div>
              <div className="ca-count"><b>{money2(total.spend)}</b><span>Amount spent (all ads)</span></div>
              <div className="ca-count"><b>{count(total.results)}</b><span>Results · {avgCpr ? money2(avgCpr) : "—"} / result</span></div>
            </div>

            <div className="ca-tools">
              <div className="sq-seg">
                {FILTERS.map((f) => (
                  <button key={f} type="button" className={flt === f ? "on" : ""} onClick={() => setFlt(f)}>{f} <em>{counts[f]}</em></button>
                ))}
              </div>
              <select className="form-control mini-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="spend">Highest spend first</option>
                <option value="results">Most results first</option>
                <option value="cheap">Lowest cost/result first</option>
                <option value="costly">Highest cost/result first</option>
              </select>
            </div>

            {shown.length ? (
              <div className="ca-list">
                {shown.map((a) => {
                  const t = a.all;
                  const cpr = t.results ? t.spend / t.results : 0;
                  const noLead = t.spend > 0 && t.results === 0;
                  const costly = cpr && avgCpr && cpr > avgCpr * 1.5;
                  const cheap = cpr && avgCpr && cpr < avgCpr * 0.7;
                  const fbPct = t.spend ? Math.round((a.fb.spend / t.spend) * 100) : 0;
                  return (
                    <div className={`ca-ad${noLead ? " warn" : ""}${formFor === a.id ? " open" : ""}`} key={a.id}>
                      <button type="button" className="ca-thumb ca-thumb-btn" onClick={() => setView(a)} title="Preview this ad" disabled={a.status === "Deleted"}>
                        {a.thumb ? <img src={a.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
                        <i className={`fa-solid ${a.kind === "VIDEO" ? "fa-film" : "fa-image"}`} />
                        {a.status !== "Deleted" ? <span className="ca-play"><i className={`fa-solid ${a.kind === "VIDEO" ? "fa-play" : "fa-eye"}`} /></span> : null}
                      </button>
                      <div className="ca-main">
                        <div className="ca-name">{a.name}</div>
                        <div className="ca-meta">
                          <span className={`pill ${STATUS_TONE[a.status] || "pill-default"}`}><span className="dot">●</span>{a.status}</span>
                          {a.adset ? <span>Ad set: {a.adset}</span> : null}
                          {a.created ? <span>Bana: {fmtD(a.created)}</span> : null}
                        </div>
                        {a.headline || a.text ? <div className="ca-copy">{a.headline ? <b>{a.headline} · </b> : null}{a.text}</div> : null}
                        {a.issue ? <div className="ms-issue"><i className="fa-solid fa-circle-exclamation" /> {a.issue}</div> : null}
                        <div className="ca-btns">
                          {a.status !== "Deleted" ? (
                            <button type="button" className="ca-prev" onClick={() => setView(a)}>
                              <i className={`fa-solid ${a.kind === "VIDEO" ? "fa-circle-play" : "fa-eye"}`} /> {a.kind === "VIDEO" ? "Play / Preview" : "Preview"}
                            </button>
                          ) : null}
                          <button type="button" className={`ca-prev ca-formbtn${formFor === a.id ? " on" : ""}`} onClick={() => toggleForm(a.id)}>
                            <i className={`fa-solid ${formFor === a.id ? "fa-chevron-up" : "fa-rectangle-list"}`} /> {formFor === a.id ? "Hide form details" : "View form details"}
                          </button>
                        </div>
                        <div className="ca-tags">
                          {noLead ? <span className="ca-tag bad">Spending, 0 results</span> : null}
                          {costly ? <span className="ca-tag bad">vs average: {Math.round((cpr / avgCpr - 1) * 100)}% more expensive</span> : null}
                          {cheap ? <span className="ca-tag good">vs average: {Math.round((1 - cpr / avgCpr) * 100)}% cheaper</span> : null}
                        </div>
                      </div>
                      <div className="ca-nums">
                        <div><span>Amount spent</span><b>{money2(t.spend)}</b></div>
                        <div><span>Results</span><b>{count(t.results)}</b><em>{t.resultLabel}</em></div>
                        <div><span>Cost / result</span><b>{cpr ? money2(cpr) : "—"}</b></div>
                        <div><span>Impressions</span><b>{count(t.impressions)}</b></div>
                        <div><span>Link clicks</span><b>{count(t.linkClicks)}</b><em>CTR {t.impressions ? ((t.linkClicks / t.impressions) * 100).toFixed(2) : "0.00"}%</em></div>
                        <div><span>Form / WhatsApp</span><b>{count(t.formLeads)} / {count(t.chats)}</b></div>
                      </div>
                      <div className="ca-split">
                        <div className="ca-split-bar"><i style={{ width: `${fbPct}%`, background: "#1877F2" }} /><i style={{ width: `${t.spend ? 100 - fbPct : 0}%`, background: "#D62976" }} /></div>
                        <div className="ca-split-l">
                          <span><i style={{ background: "#1877F2" }} />FB {money(a.fb.spend)} · {count(a.fb.results)}</span>
                          <span><i style={{ background: "#D62976" }} />IG {money(a.ig.spend)} · {count(a.ig.results)}</span>
                        </div>
                      </div>
                      {formFor === a.id ? (
                        <div className="ca-form">
                          {forms.loading ? <div className="ca-form-msg"><i className="fa-solid fa-spinner fa-spin" /> Loading the lead form from Meta...</div>
                            : forms.error ? <div className="lf-err"><i className="fa-solid fa-triangle-exclamation" /> {forms.error}</div>
                            : (() => {
                              const ad = (forms.data?.ads || []).find((x) => String(x.id) === String(a.id));
                              if (!ad) return <div className="ca-form-msg"><i className="fa-solid fa-circle-info" /> Meta did not return this ad — it may be deleted.</div>;
                              if (!ad.formIds.length) {
                                const where = ad.destination === "WHATSAPP" ? "WhatsApp" : ad.destination === "MESSENGER" ? "Messenger" : ad.destination === "INSTAGRAM_DIRECT" ? "Instagram DM" : ad.destination === "WEBSITE" ? "a website" : (ad.cta || "").replace(/_/g, " ").toLowerCase() || "a non-form destination";
                                return <div className="lf-noform" style={{ borderRadius: 12, border: "1px solid #F3E1B0" }}><i className="fa-solid fa-circle-info" /><span>This ad has no lead form — it sends people to {where}.</span></div>;
                              }
                              return ad.formIds.map((fid) => <LeadFormDetails key={fid} fid={fid} f={forms.data.forms?.[fid]} usedBy={(forms.data.ads || []).filter((x) => x.formIds.includes(fid))} />);
                            })()}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ca-loading">{ads.length ? "No ads in this filter." : "No ads found in this campaign."}</div>
            )}

            <div className="ca-foot">
              Sum of all ads = campaign total (same as Ads Manager). Thumbnails come from Meta — sometimes small or blurry. For Dynamic / Advantage+ creative ads, Meta does not split data by individual photo/text.
            </div>
          </>
        )}
      </aside>
      {view ? <AdPreview ad={view} onClose={() => setView(null)} /> : null}
    </div>
  );
}

function fmtD(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${String(y).slice(2)}`;
}
