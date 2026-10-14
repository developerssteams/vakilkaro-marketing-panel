"use client";

/* ============================================================
   components/CreateAdWizard.js

   5 step me Meta par actual campaign banata hai. Publish dabate hi
   Campaign + Ad Set + Ad teeno ban jaate hain aur live ho jaate hain.

   Publish se pehle ek confirm screen aata hai — paise ka mamla hai,
   aur galti se ₹20,000 daily daal dena aasan hai.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";
import { money, count } from "./ModuleParts";

const ADS = "campaigns__live-ads";
const FORMS = "lead-capture__forms";

const SERVICES = [
  "Trademark Registration", "Company Registration", "Section 8 / NGO",
  "Section 8 Microfinance", "NBFC Registration", "GST Registration",
  "FSSAI License", "LLP Registration", "ODR / Mediation", "Other",
];

const STEPS = [
  { key: 1, label: "Basics", icon: "fa-circle-info" },
  { key: 2, label: "Budget", icon: "fa-indian-rupee-sign" },
  { key: 3, label: "Audience", icon: "fa-users" },
  { key: 4, label: "Placement", icon: "fa-mobile-screen" },
  { key: 5, label: "Creative", icon: "fa-image" },
];

/* Har step ek line me — kya karna hai aur kyun */
const STEP_HELP = {
  1: { t: "Who is running this ad and what is it for", d: "Pick the ad account, give the ad a name you will recognise later, and choose the service it promotes." },
  2: { t: "How much to spend", d: "Set a daily or total budget. Meta never spends more than this. Start small — you can raise it once leads come in." },
  3: { t: "Who should see it", d: "Choose cities, age and gender. Leave cities empty to show it across India — wider reach, but usually costlier leads." },
  4: { t: "Where it will appear", d: "Automatic is best for most ads — Meta shows it where leads are cheapest, on both Facebook and Instagram." },
  5: { t: "What people will see", d: "Choose the page, where leads should go, and write the headline and text. The preview on the right updates as you type." },
};

const BLANK = {
  accountId: "", name: "", objective: "Leads", service: "",
  budgetType: "Daily", budget: "500", cplCap: "", startDate: "", endDate: "",
  cities: [], ageMin: "25", ageMax: "55", gender: "All",
  placement: "Automatic",
  pageId: "", destination: "Lead Form", landingUrl: "",
  creative: "", headline: "", primaryText: "", description: "", cta: "Get Quote",
};

export default function CreateAdWizard({ onPublished }) {
  const { show } = useToast();
  const [step, setStep] = useState(1);
  const [d, setD] = useState(BLANK);
  const [pages, setPages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setAccounts(readRows("ad-accounts__accounts").filter((a) => String(a.platform) === "Meta"));
    fetch("/api/meta/lookup?what=pages")
      .then((r) => r.json())
      .then((j) => { setPages(j.pages || []); setReady(!j.needsSetup); })
      .catch(() => setReady(false));
  }, []);

  /* Meta location ka naam nahi, apni key leta hai — isliye search. */
  useEffect(() => {
    if (locQuery.trim().length < 2) { setLocResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/meta/lookup?what=locations&q=${encodeURIComponent(locQuery)}`)
        .then((r) => r.json()).then((j) => setLocResults(j.locations || [])).catch(() => setLocResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [locQuery]);

  function set(patch) {
    setD((p) => ({ ...p, ...patch }));
    setErrors((p) => {
      const n = { ...p };
      Object.keys(patch).forEach((k) => delete n[k]);
      return n;
    });
  }

  function validateStep(s) {
    const e = {};
    if (s === 1) {
      if (!d.accountId) e.accountId = "Select an ad account";
      if (!d.name || d.name.length < 3) e.name = "Campaign name must be at least 3 characters";
      if (!d.service) e.service = "Service is required — CPL cannot be calculated without it";
    }
    if (s === 2) {
      const b = Number(d.budget);
      if (!b || b <= 0) e.budget = "Enter a budget";
      else if (d.budgetType === "Daily" && b < 80) e.budget = "Meta's minimum daily budget is ₹80";
      if (d.startDate && d.endDate && d.endDate < d.startDate) e.endDate = "End date cannot be before start date";
    }
    if (s === 3) {
      if (Number(d.ageMin) > Number(d.ageMax)) e.ageMin = "Min age cannot be more than max age";
    }
    if (s === 5) {
      if (!d.pageId) e.pageId = "Select a Facebook page";
      if (!d.headline) e.headline = "Enter a headline";
      if (d.destination === "Website" && !d.landingUrl) e.landingUrl = "Enter a website URL";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() { if (validateStep(step)) setStep((s) => Math.min(5, s + 1)); }
  function back() { setStep((s) => Math.max(1, s - 1)); }

  async function publish(live) {
    setBusy(true);
    try {
      const res = await fetch("/api/meta/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, publishLive: live, services: SERVICES, privacyUrl: "https://vakilkaro.in/privacy-policy" }),
      });
      const j = await res.json();

      if (!res.ok) {
        /* Adhoora bana ho to jo bana hai wo paused hai — user ko bata
           dete hain taaki Ads Manager me confusion na ho. */
        const extra = j.partial?.campaignId ? `(Campaign was created and is paused — ID ${j.partial.campaignId})` : "";
        show((j.error || "Publish fail") + extra, "error");
        return;
      }

      saveLocal(j, live);
      show(live ? `${d.name} is live on Meta.` : `${d.name} created as a draft (paused).`, "success");
      setD(BLANK); setStep(1); setConfirm(false);
      if (onPublished) onPublished();
    } catch {
      show("Could not reach the server — check the network.", "error");
    } finally {
      setBusy(false);
    }
  }

  function saveLocal(j, live) {
    const acc = accounts.find((a) => a.accountId === d.accountId);
    const rows = readRows(ADS);
    writeRows(ADS, [{
      id: uid(), name: d.name, level: "Campaign",
      channel: d.placement === "Instagram Feed" ? "Instagram" : "Facebook",
      account: acc?.name || d.accountId, extId: j.campaignId,
      adSetId: j.adSetId, adId: j.adId, leadFormId: j.leadFormId || "",
      objective: d.objective, service: d.service,
      dailyBudget: d.budgetType === "Daily" ? String(d.budget) : "0",
      totalBudget: d.budgetType === "Lifetime" ? String(d.budget) : "0",
      cplCap: d.cplCap || "0", startDate: d.startDate, endDate: d.endDate,
      status: live ? "Active" : "Paused", metaSync: "Synced",
      spend: "0", leads: "0", won: "0", impressions: "0", clicks: "0",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }, ...rows]);

    /* Lead form bana hai to Lead Capture me register kar do, taaki
       leads pull karte waqt form ID mil jaye. */
    if (j.leadFormId) {
      const fr = readRows(FORMS);
      writeRows(FORMS, [{
        id: uid(), formName: `${d.name} · Lead Form`, formId: j.leadFormId,
        account: acc?.name || d.accountId, service: d.service,
        assignRule: "Round Robin", received: "0", status: "Live",
        createdAt: new Date().toISOString(),
      }, ...fr]);
    }

    logActivity({
      dataset: ADS, action: "Created", target: d.name,
      detail: `Publish to Meta · ${live ? "LIVE" : "paused"} · ${money(d.budget)}/${d.budgetType.toLowerCase()} · ${d.service}`,
    });
  }

  if (ready === false) {
    return (
      <div className="card">
        <div className="mod-empty">
          <i className="fa-solid fa-plug-circle-xmark" />
          <p><b>Meta token is not set.</b><br />
            <code>META_TOKEN</code> and <code>META_APP_ID</code> <code>.env.local</code> — add them there and restart the server. Until then you can add ads manually.</p>
        </div>
      </div>
    );
  }

  const acc = accounts.find((a) => a.accountId === d.accountId);
  const page = pages.find((p) => p.id === d.pageId);

  /* Preview ke liye image link (Creatives module hat gaya) */
  const img = /^https?:\/\//i.test(String(d.creative || "")) ? d.creative : "";
  const perDay = d.budgetType === "Daily" ? Number(d.budget) || 0 : 0;
  const checks = [
    { ok: Boolean(d.accountId), t: "Ad account" },
    { ok: String(d.name).trim().length >= 3, t: "Ad name" },
    { ok: Boolean(d.service), t: "Service" },
    { ok: Number(d.budget) >= 80, t: "Budget" },
    { ok: Boolean(d.pageId), t: "Facebook page" },
    { ok: Boolean(d.headline), t: "Headline" },
  ];
  const doneCount = checks.filter((c) => c.ok).length;

  return (
    <div className="cs-layout">
    <div className="cs-main">
      <div className="wz-steps">
        {STEPS.map((s) => (
          <button key={s.key} type="button"
            className={`wz-step${step === s.key ? " on" : ""}${step > s.key ? " done" : ""}`}
            onClick={() => { if (s.key < step) setStep(s.key); }}>
            <span className="wz-num">{step > s.key ? <i className="fa-solid fa-check" /> : s.key}</span>
            <span className="wz-lbl"><i className={`fa-solid ${s.icon}`} /> {s.label}</span>
          </button>
        ))}
      </div>

      <div className="card cs-card">
        <div className="cs-help">
          <span className="cs-help-n">Step {step} of 5</span>
          <b>{STEP_HELP[step].t}</b>
          <p>{STEP_HELP[step].d}</p>
        </div>
        <div className="card-body wz-body">

          {step === 1 ? (
            <>
              <F label="Ad Account" err={errors.accountId} hint="Multi-account: every connected account appears here">
                <select className="form-control" value={d.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                  <option value="">— select —</option>
                  {accounts.map((a) => <option key={a.id} value={a.accountId}>{a.name} · {a.accountId}</option>)}
                </select>
              </F>
              <F label="Campaign Name" err={errors.name}>
                <input className="form-control" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="NGO-Aug-Leads-01" />
              </F>
              <div className="wz-grid">
                <F label="Objective">
                  <select className="form-control" value={d.objective} onChange={(e) => set({ objective: e.target.value })}>
                    {["Leads", "Traffic", "Messages", "Sales", "Awareness"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </F>
                <F label="Service" err={errors.service} hint="Service-wise CPL cannot be calculated without this">
                  <select className="form-control" value={d.service} onChange={(e) => set({ service: e.target.value })}>
                    <option value="">— select —</option>
                    {SERVICES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </F>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="wz-grid">
                <F label="Budget Type">
                  <select className="form-control" value={d.budgetType} onChange={(e) => set({ budgetType: e.target.value })}>
                    <option>Daily</option><option>Lifetime</option>
                  </select>
                </F>
                <F label={`${d.budgetType} Budget (₹)`} err={errors.budget} hint={d.budgetType === "Daily" ? "Meta minimum ₹80/day" : "Total for the whole campaign"}>
                  <input className="form-control" type="number" min="80" value={d.budget} onChange={(e) => set({ budget: e.target.value })} />
                </F>
              </div>
              <div className="wz-grid">
                <F label="Start Date"><input className="form-control" type="date" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} /></F>
                <F label="End Date" err={errors.endDate}><input className="form-control" type="date" value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} /></F>
              </div>
              <F label="CPL Cap (₹)" hint="The panel will alert if CPL goes above this. You can leave it empty.">
                <input className="form-control" type="number" value={d.cplCap} onChange={(e) => set({ cplCap: e.target.value })} placeholder="450" />
              </F>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <F label="Location" hint="If nothing is selected it will run across India — CPL gets expensive">
                <input className="form-control" value={locQuery} onChange={(e) => setLocQuery(e.target.value)} placeholder="Jaipur, Rajasthan, Delhi..." />
                {locResults.length ? (
                  <div className="wz-loc-list">
                    {locResults.map((l) => (
                      <button key={l.key} type="button" className="wz-loc"
                        onClick={() => { if (!d.cities.some((c) => c.key === l.key)) set({ cities: [...d.cities, l] }); setLocQuery(""); setLocResults([]); }}>
                        <i className="fa-solid fa-location-dot" /> {l.label} <span>{l.type}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </F>

              {d.cities.length ? (
                <div className="wz-chips">
                  {d.cities.map((c) => (
                    <span className="wz-chip" key={c.key}>
                      {c.label}
                      <button type="button" onClick={() => set({ cities: d.cities.filter((x) => x.key !== c.key) })}><i className="fa-solid fa-xmark" /></button>
                    </span>
                  ))}
                </div>
              ) : <div className="wz-note"><i className="fa-solid fa-globe" /> Currently targeting all of India</div>}

              <div className="wz-grid3">
                <F label="Age From" err={errors.ageMin}>
                  <select className="form-control" value={d.ageMin} onChange={(e) => set({ ageMin: e.target.value })}>
                    {Array.from({ length: 48 }, (_, i) => 18 + i).map((a) => <option key={a}>{a}</option>)}
                  </select>
                </F>
                <F label="Age To">
                  <select className="form-control" value={d.ageMax} onChange={(e) => set({ ageMax: e.target.value })}>
                    {Array.from({ length: 48 }, (_, i) => 18 + i).map((a) => <option key={a}>{a}</option>)}
                  </select>
                </F>
                <F label="Gender">
                  <select className="form-control" value={d.gender} onChange={(e) => set({ gender: e.target.value })}>
                    <option>All</option><option>Male</option><option>Female</option>
                  </select>
                </F>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <F label="Placement" hint="On Automatic, Meta runs both Facebook and Instagram — both cards get filled">
                <div className="wz-radios">
                  {["Automatic", "Facebook Feed", "Instagram Feed", "Stories", "Reels"].map((p) => (
                    <button key={p} type="button" className={`wz-radio${d.placement === p ? " on" : ""}`} onClick={() => set({ placement: p })}>
                      {d.placement === p ? <i className="fa-solid fa-circle-check" /> : <i className="fa-regular fa-circle" />}
                      {p}
                      {p === "Automatic" ? <em>Recommended</em> : null}
                    </button>
                  ))}
                </div>
              </F>
              <div className="wz-note">
                <i className="fa-solid fa-lightbulb" />
                Automatic works best — Meta finds where leads are cheapest, and the panel still shows Facebook/Instagram separately.
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <F label="Facebook Page" err={errors.pageId} hint="The ad will show under this page's name">
                <select className="form-control" value={d.pageId} onChange={(e) => set({ pageId: e.target.value })}>
                  <option value="">— select —</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasInstagram ? " · IG linked" : ""}</option>)}
                </select>
              </F>

              <F label="Where should leads go">
                <div className="wz-radios">
                  {[
                    ["Lead Form", "Form on Facebook itself — leads come straight into the panel"],
                    ["Website", "Send to a website landing page"],
                    ["WhatsApp", "Click to WhatsApp"],
                  ].map(([k, sub]) => (
                    <button key={k} type="button" className={`wz-radio${d.destination === k ? " on" : ""}`} onClick={() => set({ destination: k })}>
                      {d.destination === k ? <i className="fa-solid fa-circle-check" /> : <i className="fa-regular fa-circle" />}
                      <span>{k}<em className="wz-sub">{sub}</em></span>
                    </button>
                  ))}
                </div>
              </F>

              {d.destination === "Lead Form" ? (
                <div className="wz-note ok">
                  <i className="fa-solid fa-clipboard-list" />
                  The form will ask: <b>Name · Mobile · Email · City · Service</b> — Facebook pre-fills the first three.
                </div>
              ) : null}

              {d.destination === "Website" ? (
                <F label="Landing URL" err={errors.landingUrl}>
                  <input className="form-control" value={d.landingUrl} onChange={(e) => set({ landingUrl: e.target.value })} placeholder="https://vakilkaro.in/trademark" />
                </F>
              ) : null}

              <F label="Image link (preview only)" hint="Paste an image URL to see it in the preview">
                <input className="form-control" value={d.creative} onChange={(e) => set({ creative: e.target.value.trim() })} placeholder="https://…/ad-image.jpg" />
              </F>

              <F label="Headline" err={errors.headline} hint="Best up to 40 characters">
                <input className="form-control" value={d.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Trademark registered in 7 days" />
              </F>
              <F label="Primary Text">
                <textarea className="form-control" rows={3} value={d.primaryText} onChange={(e) => set({ primaryText: e.target.value })} placeholder="Give your brand legal protection..." />
              </F>
              <div className="wz-grid">
                <F label="Description"><input className="form-control" value={d.description} onChange={(e) => set({ description: e.target.value })} /></F>
                <F label="CTA Button">
                  <select className="form-control" value={d.cta} onChange={(e) => set({ cta: e.target.value })}>
                    {["Get Quote", "Learn More", "Sign Up", "Contact Us", "Apply Now", "Send Message"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </F>
              </div>
            </>
          ) : null}
        </div>

        <div className="wz-foot">
          <button className="btn btn-ghost" type="button" onClick={back} disabled={step === 1}>
            <i className="fa-solid fa-arrow-left" /> Back
          </button>
          {step < 5 ? (
            <button className="btn btn-gold" type="button" onClick={next}>Next <i className="fa-solid fa-arrow-right" /></button>
          ) : (
            <div className="wz-actions">
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => validateStep(5) && publish(false)}>
                <i className="fa-solid fa-floppy-disk" /> Save as Draft
              </button>
              <button className="btn btn-gold" type="button" disabled={busy} onClick={() => validateStep(5) && setConfirm(true)}>
                <i className="fa-solid fa-rocket" /> Publish &amp; Run
              </button>
            </div>
          )}
        </div>
      </div>

    </div>

    {/* ---- bagal me: live preview + summary ---- */}
    <aside className="cs-side">
      <div className="cs-panel">
        <div className="cs-panel-h"><b>Live preview</b><span>Facebook feed</span></div>
        <div className="cs-fb">
          <div className="cs-fb-h">
            <span className="cs-fb-av">{(page?.name || "V").slice(0, 1)}</span>
            <div><b>{page?.name || "Your Facebook page"}</b><span>Sponsored</span></div>
          </div>
          <p className={`cs-fb-text${d.primaryText ? "" : " ph"}`}>{d.primaryText || "Your main ad text appears here. Say what you offer and why it matters in one or two lines."}</p>
          <div className="cs-fb-media">
            {img ? <img src={img} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
            <span><i className="fa-regular fa-image" /> {img ? "" : "Image or video"}</span>
          </div>
          <div className="cs-fb-foot">
            <div>
              <span className="cs-fb-dom">{d.destination === "Lead Form" ? "Instant form" : (d.landingUrl || "yourwebsite.com").replace(/^https?:\/\//, "").split("/")[0]}</span>
              <b className={d.headline ? "" : "ph"}>{d.headline || "Your headline"}</b>
            </div>
            <span className="cs-fb-cta">{d.cta || "Learn more"}</span>
          </div>
        </div>
      </div>

      <div className="cs-panel">
        <div className="cs-panel-h"><b>Summary</b><span>{doneCount} of {checks.length} ready</span></div>
        <div className="cs-prog"><i style={{ width: `${(doneCount / checks.length) * 100}%` }} /></div>
        <dl className="cs-sum">
          <div><dt>Account</dt><dd>{acc?.name || "—"}</dd></div>
          <div><dt>Service</dt><dd>{d.service || "—"}</dd></div>
          <div><dt>Budget</dt><dd>{d.budget ? `${money(d.budget)} ${d.budgetType === "Daily" ? "per day" : "total"}` : "—"}</dd></div>
          {perDay ? <div><dt>About 30 days</dt><dd>{money(perDay * 30)}</dd></div> : null}
          <div><dt>Audience</dt><dd>{d.cities.length ? `${d.cities.length} cit${d.cities.length === 1 ? "y" : "ies"}` : "All of India"}, {d.ageMin}–{d.ageMax}, {d.gender}</dd></div>
          <div><dt>Placement</dt><dd>{d.placement}</dd></div>
          <div><dt>Leads go to</dt><dd>{d.destination}</dd></div>
        </dl>
        <ul className="cs-checks">
          {checks.map((c) => <li key={c.t} className={c.ok ? "ok" : ""}><i className={`fa-solid ${c.ok ? "fa-circle-check" : "fa-circle"}`} />{c.t}</li>)}
        </ul>
      </div>
    </aside>

      {confirm ? (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(false); }}>
          <div className="modal marketing-modal">
            <div className="modal-head">
              <div className="mt"><i className="fa-solid fa-rocket" /> Publish confirm</div>
              <button className="modal-x" type="button" onClick={() => setConfirm(false)}><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className="modal-body">
              <div className="cf-warn">
                <i className="fa-solid fa-triangle-exclamation" />
                <span>As soon as you publish, the ad goes <b>live on Meta</b> and money will start being spent.</span>
              </div>
              <div className="cf-list">
                <Row k="Campaign" v={d.name} />
                <Row k="Ad Account" v={acc ? `${acc.name} · ${d.accountId}` : d.accountId} />
                <Row k="Page" v={page?.name || "—"} />
                <Row k="Service" v={d.service} />
                <Row k="Budget" v={`${money(d.budget)} / ${d.budgetType === "Daily" ? "day" : "whole campaign"}`} strong />
                <Row k="Location" v={d.cities.length ? d.cities.map((c) => c.name).join(", ") : "All of India"} />
                <Row k="Age" v={`${d.ageMin} – ${d.ageMax} · ${d.gender}`} />
                <Row k="Placement" v={d.placement} />
                <Row k="Leads go to" v={d.destination} />
                {d.budgetType === "Daily" ? (
                  <Row k="Approx. in 30 days" v={money(Number(d.budget) * 30)} strong />
                ) : null}
              </div>
            </div>
            <div className="marketing-modal-footer">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-gold" type="button" disabled={busy} onClick={() => publish(true)}>
                <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-rocket"}`} /> {busy ? "Publishing..." : "Yes, go live"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function F({ label, hint, err, children }) {
  return (
    <label className="fg wz-fg">
      <span className="form-label">{label}</span>
      {children}
      {err ? <span className="fg-err"><i className="fa-solid fa-circle-exclamation" /> {err}</span>
           : hint ? <span className="fg-note">{hint}</span> : null}
    </label>
  );
}

function Row({ k, v, strong }) {
  return <div className={`cf-row${strong ? " strong" : ""}`}><span>{k}</span><b>{v}</b></div>;
}
