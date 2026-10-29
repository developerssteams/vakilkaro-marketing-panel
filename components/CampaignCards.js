"use client";

/* ============================================================
   components/CampaignCards.js
   Campaigns → Live Ads.

   4 platform cards: Facebook · Instagram · YouTube · Website.
   Spend aur leads daily-stats se aate hain, isliye date filter
   lagate hi numbers us range ke ho jaate hain. Jis din entry
   nahi hai wo din 0 count hota hai — number kabhi khaali nahi.

   Live/Paused hamesha aaj ka current state hai — status ka
   history kahin store nahi hota, isliye use filter nahi karte.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TablePager, PAGE_SIZE } from "./Pager";
import CampaignStates from "./CampaignStates";
import { datasetKey } from "../lib/marketing-config";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { tokenState } from "../lib/marketing-validate";
import { resolveRange, inRange, daysInRange, rangeLabel, todayISO, iso } from "../lib/date-range";
import FilterPanel from "./FilterPanel";
import { OBJECTIVES, objectiveOf, objectiveFromResult } from "../lib/objectives";
import MetaSplitView, { ViewSwitch, ProblemBanner } from "./MetaSplitView";
import CampaignAds from "./CampaignAds";
import DailyChart from "./DailyChart";
import { accountProblems } from "../lib/sync-merge";
import { sumMetrics, sameCampaign, costPerResult, ctrAll, ctrLink, cpm, budgetInfo } from "../lib/meta-metrics";
import { DEFAULT_FILTERS, applyStatus, timeWindow, filterRangeLabel } from "../lib/filters";
import {
  num, money, money2, count, pretty, isPillKey, statusClass, blankForm,
  labelOf, dayLabel, FormModal, Empty,
} from "./ModuleParts";

const DAILY = "campaigns__daily-stats";

/* Website ke teen form (Hostinger DB ki tables) */
const WEB_FORMS = [
  { key: "enquiries", label: "Enquiry form", short: "Enquiry", icon: "fa-file-pen", color: "#2F6FED" },
  { key: "contact_messages", label: "Contact form", short: "Contact", icon: "fa-envelope", color: "#0F766E" },
  { key: "odr_disputes", label: "ODR dispute", short: "ODR", icon: "fa-scale-balanced", color: "#B45309" },
];

const PLATFORM_CARDS = [
  { key: "Facebook",  icon: "fa-brands fa-facebook-f", accent: "#1877F2", tint: "#E7F0FE", via: "Meta",       note: "Feed, Reels and Marketplace placements" },
  { key: "Instagram", icon: "fa-brands fa-instagram",  accent: "#C13584", tint: "#FBE9F4", via: "Meta",       note: "Feed, Stories and Explore placements" },
  { key: "YouTube",   icon: "fa-brands fa-youtube",    accent: "#FF0000", tint: "#FDE8E8", via: "Google Ads", note: "In-stream, Shorts and Discovery" },
  { key: "Website",   icon: "fa-solid fa-globe",       accent: "#0F766E", tint: "#E1F5F2", via: null,         note: "Organic, SEO landing and direct traffic" },
];

export default function CampaignCards({ moduleKey, tab, show }) {
  const ds = datasetKey(moduleKey, tab.key);
  const [rows, setRows] = useState([]);
  const [daily, setDaily] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [problems, setProblems] = useState([]);
  const [adsFor, setAdsFor] = useState(null);       // jis Active campaign ke ads dekh rahe hain
  const [openCard, setOpenCard] = useState(null);
  const [modal, setModal] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dayModal, setDayModal] = useState(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [flt, setFlt] = useState(DEFAULT_FILTERS);
  const [adPage, setAdPage] = useState(1);   /* ads list — 10 per page */
  const [acct, setAcct] = useState("");       /* ads list — account filter */
  const [statesFor, setStatesFor] = useState(null);   /* "Leads by state" popup */
  const [webLeads, setWebLeads] = useState([]);       /* Website forms ki leads (Hostinger DB) */
  const [webForm, setWebForm] = useState("");         /* "" · enquiries · contact_messages · odr_disputes */
  const [webPage, setWebPage] = useState(1);
  const plat = flt.platform;
  const rf = flt;
  const setPlat = (v) => setFlt((p) => ({ ...p, platform: v }));

  useEffect(() => {
    const load = () => {
      setRows(readRows(ds));
      setDaily(readRows(DAILY));
      setAccounts(readRows("ad-accounts__accounts"));
      setProblems(accountProblems());
      setWebLeads(readRows("lead-capture__inbox-log").filter((l) => l.source === "Website" && String(l.extId || "").startsWith("web-")));
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [ds]);

  const { from, to } = useMemo(() => resolveRange(flt.range, flt.from, flt.to), [flt]);
  const rl = filterRangeLabel(flt, from, to);

  /* TIME FILTER — Custom me time bhara ho (jaise kal 06:00 → aaj abhi)
     to Meta ka data ghante-wise seedha Meta se aata hai. Manual /
     YouTube / Website ki entries din-wise hi rehti hain. */
  const win = useMemo(() => timeWindow(flt), [flt]);
  const winKey = win ? `${win.fromMs}|${flt.to}|${flt.toTime}` : "";
  const [hourly, setHourly] = useState({ key: "", rows: [], loading: false, error: "", estimated: false, at: "" });
  const [hourlyTick, setHourlyTick] = useState(0);
  useEffect(() => {
    if (!win) return undefined;
    const ids = [...new Set(accounts.filter((a) => a.platform === "Meta").map((a) => String(a.accountId || "").trim()).filter((x) => /^act_\d+$/.test(x)))];
    if (!ids.length) { setHourly({ key: winKey, rows: [], loading: false, error: "Connect a Meta account in Ad Accounts first.", estimated: false, at: "" }); return undefined; }
    let alive = true;
    setHourly((h) => ({ ...h, key: winKey, loading: true, error: "" }));
    fetch("/api/meta/hourly", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds: ids, fromMs: win.fromMs, toMs: win.tillNow ? Date.now() : win.toMs }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j, status: r.status })).catch(() => ({ ok: false, j: {}, status: r.status })))
      .then(({ ok, j, status }) => {
        if (!alive) return;
        const names = {}; accounts.forEach((a) => { names[String(a.accountId || "").trim()] = a.name; });
        const errs = (j.errors || []).map((e) => `${names[e.account] || e.account}: ${e.message}`).join(" · ");
        setHourly({ key: winKey, rows: ok ? (j.rows || []) : [], loading: false, error: ok ? errs : (j.error || (status === 404
          ? "Hour-wise data route not found (HTTP 404) — app/api/meta/hourly/route.js is missing. Put the file there and restart the server."
          : `Could not load hour-wise data from Meta (HTTP ${status}) — check the server terminal / Vercel logs for the error.`)), estimated: Boolean(j.estimated), at: j.at || "" });
      })
      .catch(() => { if (alive) setHourly({ key: winKey, rows: [], loading: false, error: "Could not reach the server", estimated: false, at: "" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey, hourlyTick, accounts.length]);

  /* Website leads — chuni hui date (ya time) range ki, naye pehle */
  const webInRange = useMemo(() => webLeads.filter((l) => {
    if (win) { const t = Date.parse(l.receivedTime || ""); return Number.isFinite(t) && t >= win.fromMs && t <= win.toMs; }
    return inRange(l.receivedAt, from, to);
  }).sort((a, b) => String(b.receivedTime || b.receivedAt).localeCompare(String(a.receivedTime || a.receivedAt))), [webLeads, win, from, to]);
  const webCount = (t) => webInRange.filter((l) => (l.formId || "") === t).length;
  useEffect(() => { setWebPage(1); }, [webForm, from, to, winKey]);

  /* Time filter ki patti — filter ke neeche: kaunsa waqt, load ho raha
     hai ya nahi, Refresh, aur FB/IG andaaza wali baat */
  const timeBar = win ? (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", margin: "-4px 0 14px", padding: "9px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--bg2)", fontSize: 12 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
        <i className="fa-regular fa-clock" style={{ color: "#B7791F" }} /> {rl}
      </span>
      <span style={{ color: "var(--muted)" }}>
        {hourly.loading ? <><i className="fa-solid fa-spinner fa-spin" /> Loading hour-wise data from Meta...</>
          : hourly.at ? `Hour-wise from Meta · updated ${new Date(hourly.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Hour-wise from Meta"}
      </span>
      {hourly.estimated && !hourly.loading ? <span style={{ color: "var(--muted)" }}>· Facebook / Instagram split is estimated (Meta gives hourly data only as one total)</span> : null}
      <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 12 }} disabled={hourly.loading} onClick={() => setHourlyTick((t) => t + 1)}>
        <i className={`fa-solid fa-rotate${hourly.loading ? " fa-spin" : ""}`} /> Refresh
      </button>
      {hourly.error ? <span style={{ flexBasis: "100%", color: "#B42318" }}><i className="fa-solid fa-triangle-exclamation" /> {hourly.error}</span> : null}
    </div>
  ) : null;

  /* Time filter chalu ho to Meta ki din-wali rows ki jagah ghante-wali */
  const sourceDaily = useMemo(
    () => (win ? [...daily.filter((d) => d.source !== "Meta Sync"), ...(hourly.key === winKey ? hourly.rows : [])] : daily),
    [win, daily, hourly, winKey],
  );
  useEffect(() => { setAdPage(1); }, [openCard, search, flt, acct]);

  /* Platform filter — "kaunsi Facebook / Instagram / YouTube / Website
     ki leads aur spend dekhni hai". Khaali = saare platforms.
     Campaign aur daily entry dono par channel likha hota hai, isliye
     dono jagah seedha match ho jaata hai. */
  const visibleCards = useMemo(
    () => (plat ? PLATFORM_CARDS.filter((c) => c.key === plat) : PLATFORM_CARDS),
    [plat],
  );

  /* Status filter sirf ad list par lagta hai — spend aur leads daily
     entries se aate hain, jinme status hota hi nahi. */
  const statusRows = useMemo(
    () => {
      const st = applyStatus(rows, flt.status);
      /* Objective filter — Ads Manager wala objective (Leads, Engagement, Awareness…) */
      return flt.objective ? st.filter((r) => objectiveOf(r) === flt.objective) : st;
    },
    [rows, flt.status, flt.objective],
  );

  /* Har campaign ka objective — daily rows isi se pehchaani jaati hain */
  const knownKeys = useMemo(() => {
    const k = new Set();
    rows.forEach((r) => { if (r.extId) k.add(`id:${r.extId}`); k.add(`nm:${String(r.name || "").toLowerCase()}|${r.accountId || ""}`); k.add(`nm:${String(r.name || "").toLowerCase()}|`); });
    return k;
  }, [rows]);

  /* Range ke andar ki daily entries. Card-wise split neeche hota hai,
     isliye yahan platform filter nahi lagta — card khud apna channel
     chunta hai. */
  /* Status filter (Active / Paused) ab DATA par bhi lagta hai — sirf
     unhi campaigns ki daily entries jinka status match kare. Pehle ye
     sirf list chhaant-ta tha, spend aur leads saare campaigns ke rehte the.
     Matching campaign ID se (naam badle to bhi), ID na ho to naam + account. */
  const statusKeys = useMemo(() => {
    if (!flt.status && !flt.objective) return null;
    const k = new Set();
    statusRows.forEach((r) => {
      if (r.extId) k.add(`id:${r.extId}`);
      k.add(`nm:${String(r.name || "").toLowerCase()}|${r.accountId || ""}`);
      k.add(`nm:${String(r.name || "").toLowerCase()}|`);
    });
    return k;
  }, [statusRows, flt.status, flt.objective]);

  const dailyInRange = useMemo(
    () => sourceDaily.filter((d) => {
      if (!inRange(d.date, from, to)) return false;
      if (!statusKeys) return true;
      const hit = d.extId ? statusKeys.has(`id:${d.extId}`) : statusKeys.has(`nm:${String(d.campaign || "").toLowerCase()}|${d.account || ""}`);
      if (hit) return true;
      /* Campaign list me nahi mila (purana / delete hua) — sirf objective
         filter ho to result ke type se andaaza lagao */
      const known = d.extId ? knownKeys.has(`id:${d.extId}`) : knownKeys.has(`nm:${String(d.campaign || "").toLowerCase()}|${d.account || ""}`);
      return !known && !flt.status && Boolean(flt.objective) && objectiveFromResult(d.resultLabel) === flt.objective;
    }),
    [sourceDaily, from, to, statusKeys, knownKeys, flt.status, flt.objective],
  );

  /* Daily data hai hi nahi to campaign ka total dikhao, warna screen
     khaali lagegi aur lagega ki kuch toota hua hai. */
  const hasDaily = daily.length > 0;

  /* Ads Manager ke columns ka jod — lib/meta-metrics me */
  function sumRows(mine) { return sumMetrics(mine); }

  function statsFor(filterFn) {
    return sumRows(dailyInRange.filter(filterFn));
  }

  /* Meta ka ek campaign Facebook aur Instagram dono pe chalta hai.
     Campaign row me sirf ek channel likha hota hai, isliye card ki
     list daily data se banti hai — jis campaign ka us platform pe
     kabhi bhi kharcha hua, wo us card me dikhega. Paused campaign bhi
     dikhe, isliye ye poore daily data se (range se nahi) banta hai. */
  const campaignsOnChannel = useMemo(() => {
    const m = {};
    daily.forEach((d) => {
      const ch = String(d.channel || "");
      if (!m[ch]) m[ch] = new Set();
      m[ch].add(String(d.campaign || "").toLowerCase());
    });
    return m;
  }, [daily]);

  /* Payment error / disabled account ke campaigns Meta pe ACTIVE
     dikhte hain par chalte nahi — inhe "Live" me nahi ginte. */
  const blockedIds = useMemo(() => new Set(problems.map((p) => p.accountId)), [problems]);
  const isBlocked = (r) => Boolean(r.accountId) && blockedIds.has(r.accountId);

  const byCard = useMemo(() => {
    const map = {};
    PLATFORM_CARDS.forEach((c) => {
      const onCh = campaignsOnChannel[c.key] || new Set();
      const ads = statusRows.filter((r) => String(r.channel || "") === c.key
        || (r.metaSync === "Synced" && onCh.has(String(r.name || "").toLowerCase())));
      const s = hasDaily
        ? statsFor((d) => String(d.channel || "") === c.key)
        : { ...sumRows(ads), entries: 0 };
      map[c.key] = {
        ads,
        live: ads.filter((r) => String(r.status) === "Active" && !isBlocked(r)).length,
        blocked: ads.filter((r) => String(r.status) === "Active" && isBlocked(r)).length,
        paused: ads.filter((r) => String(r.status) === "Paused").length,
        ...s,
      };
    });
    return map;
  }, [statusRows, dailyInRange, hasDaily, campaignsOnChannel, blockedIds]);

  /* Card ki chhoti spend line — chuni hui range ke aakhri 21 din */
  const trendOf = (channel) => {
    const m = {};
    dailyInRange.forEach((d) => { if (String(d.channel || "") === channel) m[d.date] = (m[d.date] || 0) + num(d.spend); });
    return Object.keys(m).sort().slice(-21).map((k) => m[k]);
  };

  /* Meta ke saare campaigns — FB vs IG view ke liye */
  const metaRows = useMemo(() => statusRows.filter((r) => r.platform === "Meta" || r.metaSync === "Synced"
    || r.channel === "Facebook" || r.channel === "Instagram"), [statusRows]);

  function connection(card) {
    /* Website ki leads Hostinger DB se aa rahi hain to "Live" */
    if (card.key === "Website" && daily.some((d) => d.source === "Website DB")) return { label: "Live", cls: "pill-active" };
    if (!card.via) return { label: "Manual", cls: "pill-default" };
    const accs = accounts.filter((a) => String(a.platform || "") === card.via);
    if (!accs.length) return { label: "Not connected", cls: "pill-off" };
    const best = accs.map(tokenState).sort((a, b) => (b.days ?? 999) - (a.days ?? 999))[0];
    return { label: best.label, cls: best.cls };
  }

  function titleOf(r) { return r.name || tab.singular; }

  function save(form) {
    const now = new Date().toISOString();
    let next;
    if (modal.editingId) {
      next = rows.map((r) => (r.id === modal.editingId ? { ...r, ...form, updatedAt: now } : r));
      logActivity({ dataset: ds, action: "Updated", target: titleOf(form), detail: `${form.channel} · budget ${money(form.dailyBudget)} · ${form.status}` });
      show("Campaign updated.", "success");
    } else {
      next = [{ id: uid(), ...form, createdAt: now, updatedAt: now }, ...rows];
      logActivity({ dataset: ds, action: "Created", target: titleOf(form), detail: `${form.channel} · ${form.service}` });
      show("Campaign added.", "success");
    }
    setRows(next); writeRows(ds, next); setModal(null);
  }

  /* Archive — Meta se poora delete nahi karte. Delete hua to history bhi
     chali jaati hai, aur purane campaign ka CPL comparison ke liye chahiye. */
  async function archiveRow(row) {
    if (!window.confirm(`Archive "${row.name}"? The ad will stop but its data will be kept.`)) return;

    if (row.extId) {
      setBusyId(row.id);
      try {
        const res = await fetch(`/api/meta/campaign?campaignId=${encodeURIComponent(row.extId)}`, { method: "DELETE" });
        const j = await res.json();
        if (!res.ok) { show(j.error || "Could not archive on Meta", "error"); setBusyId(""); return; }
      } catch {
        show("Could not reach the server.", "error"); setBusyId(""); return;
      }
      setBusyId("");
    }

    const next = rows.map((r) => (r.id === row.id
      ? { ...r, status: "Archived", metaSync: row.extId ? "Synced" : "Local Only", updatedAt: new Date().toISOString() } : r));
    setRows(next); writeRows(ds, next);
    logActivity({ dataset: ds, action: "Status", target: titleOf(row), detail: "Archived" + (row.extId ? "(on Meta too)" : "") });
    show(`${row.name} archived.`, "success");
  }

  /* ON/OFF — linked campaign ho to Meta par asli pause/resume. Meta par
     teeno level (campaign, ad set, ad) par lagana padta hai, warna
     campaign ACTIVE dikhega par ad chalega nahi. */
  /* ⋯ menu ke saare kaam — table aur mobile card dono me same */
  function rowActions(row) {
    const on = String(row.status) === "Active";
    return [
      on && row.extId && (row.platform === "Meta" || row.metaSync === "Synced" || row.channel === "Facebook" || row.channel === "Instagram")
        ? { icon: "fa-layer-group", label: "View ads", hint: "Preview and play this campaign's ads", onClick: () => setAdsFor(row) } : null,
      row.extId && (row.platform === "Meta" || row.metaSync === "Synced")
        ? { icon: "fa-rectangle-list", label: "View lead form", hint: "Questions (columns) this campaign's form asks", onClick: () => setAdsFor({ ...row, openForm: true }) } : null,
      row.extId && (row.platform === "Meta" || row.metaSync === "Synced")
        ? { icon: "fa-map-location-dot", label: "Leads by state", hint: "Which state this campaign's leads come from", onClick: () => setStatesFor(row) } : null,
      { icon: "fa-calendar-plus", label: "Add daily entry", hint: "Today's spend and leads", onClick: () => setDayModal({ campaign: row.name, channel: row.channel }) },
      { icon: on ? "fa-toggle-off" : "fa-toggle-on", label: on ? "Turn OFF" : "Turn ON", hint: row.extId ? "Also changes it on Meta" : "Only in the panel", onClick: () => toggleOnOff(row) },
      { icon: "fa-pen", label: "Edit", hint: "Name, service, budget", onClick: () => setModal({ editingId: row.id, initial: { ...blankForm(tab.fields), ...row } }) },
      { icon: "fa-box-archive", label: "Archive", danger: true, onClick: () => archiveRow(row) },
    ].filter(Boolean);
  }

  async function toggleOnOff(row) {
    const nextStatus = String(row.status) === "Active" ? "Paused" : "Active";

    if (row.extId) {
      setBusyId(row.id);
      try {
        const res = await fetch("/api/meta/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: row.extId, adSetId: row.adSetId || "", adId: row.adId || "",
            status: nextStatus === "Active" ? "ACTIVE" : "PAUSED",
          }),
        });
        const j = await res.json();
        if (!res.ok) { show(j.error || "Status was not changed on Meta", "error"); setBusyId(""); return; }
      } catch {
        show("Could not reach the server.", "error"); setBusyId(""); return;
      }
      setBusyId("");
      applyStatusLocal(row, nextStatus, "Synced");
      logActivity({ dataset: ds, action: "Status", target: titleOf(row), detail: `${row.status || "—"} → ${nextStatus} (pushed to Meta)` });
      show(`${nextStatus} — done on Meta too.`, "success");
      return;
    }

    applyStatusLocal(row, nextStatus, "Local Only");
    logActivity({ dataset: ds, action: "Status", target: titleOf(row), detail: `${row.status || "—"} → ${nextStatus} (local only)` });
    show(`${nextStatus} — local only for now, not linked to Meta.`, "error");
  }

  function applyStatusLocal(row, nextStatus, sync) {
    const next = rows.map((r) => (r.id === row.id
      ? { ...r, status: nextStatus, metaSync: sync, updatedAt: new Date().toISOString() } : r));
    setRows(next); writeRows(ds, next);
  }

  function linkExisting(form) {
    const acc = accounts.find((a) => a.name === form.account);
    const t = acc ? tokenState(acc) : null;
    const now = new Date().toISOString();
    const record = {
      id: uid(), name: form.name, channel: form.channel, account: form.account, extId: form.extId,
      service: form.service, objective: "Leads", level: "Campaign",
      metaSync: t && t.cls === "pill-active" ? "Synced" : "Pending",
      status: "Active", spend: "0", leads: "0", won: "0", impressions: "0", clicks: "0",
      createdAt: now, updatedAt: now,
    };
    writeRows(ds, [record, ...rows]);
    logActivity({ dataset: ds, action: "Created", target: form.name, detail: `Linked from ${form.channel} · ID ${form.extId}` });
    setLinkOpen(false);
    show(record.metaSync === "Synced"
      ? "Ad linked — spend and leads will now update automatically."
      : "Ad linked, but the token is not active — add the token in Ad Accounts.", record.metaSync === "Synced" ? "success" : "error");
  }

  /* Ek ad ka ek din ka data — list se seedha. Same date + campaign
     dobara aaye to purani entry replace hoti hai, jodti nahi. */
  function saveDaily(form) {
    const all = readRows(DAILY);
    const dup = all.find((d) => d.date === form.date && d.campaign === form.campaign);
    const now = new Date().toISOString();
    const next = dup
      ? all.map((d) => (d.id === dup.id ? { ...d, ...form, updatedAt: now } : d))
      : [{ id: uid(), ...form, source: "Manual", createdAt: now, updatedAt: now }, ...all];
    writeRows(DAILY, next);
    logActivity({ dataset: DAILY, action: dup ? "Updated" : "Created", target: form.campaign, detail: `${form.date} · ${money(form.spend)} · ${num(form.leads)} leads` });
    setDayModal(null);
    show(dup ? "That day's entry was updated." : "Daily entry added.", "success");
  }

  const card = PLATFORM_CARDS.find((c) => c.key === openCard);

  /* "Poora data" me from/to khaali hote hain — Meta ko date chahiye */
  const adsFrom = from || (() => { const d = new Date(); d.setMonth(d.getMonth() - 36); return d.toISOString().slice(0, 10); })();
  const adsTo = to || new Date().toISOString().slice(0, 10);
  const adsDrawer = (
    <>
      {adsFor ? <CampaignAds campaign={adsFor} from={adsFrom} to={adsTo} onClose={() => setAdsFor(null)} /> : null}
      {statesFor ? <CampaignStates campaign={statesFor} onClose={() => setStatesFor(null)} /> : null}
    </>
  );

  /* Meta / Facebook / Instagram ke beech switch — platform filter bhi
     saath badalta hai taaki numbers usi platform ke rahein */
  function openView(key) {
    setSearch("");
    if (key === "Meta") { setFlt((p) => ({ ...p, platform: "" })); setOpenCard("Meta"); return; }
    setFlt((p) => ({ ...p, platform: key })); setOpenCard(key);
  }

  if (openCard === "Meta") {
    return (
      <>
      {adsDrawer}
      <MetaSplitView
        rows={metaRows} dailyInRange={dailyInRange} range={flt.range} from={from} to={to} rangeText={rl}
        problems={problems} busyId={busyId}
        onBack={() => { setOpenCard(null); setSearch(""); }}
        onOpenCard={openView} onToggle={toggleOnOff} onAds={setAdsFor}
        filterPanel={<><div className="sq-row"><FilterPanel value={flt} onApply={(f) => setFlt({ ...f, platform: "" })} /><StatusQuick value={flt.status} onChange={(st) => setFlt((p) => ({ ...p, status: st }))} /><ObjectiveQuick value={flt.objective} rows={rows} onChange={(o) => setFlt((p) => ({ ...p, objective: o }))} /></div>{timeBar}</>}
      />
      </>
    );
  }

  /* ================= DRILL-DOWN ================= */
  if (card) {
    const conn = connection(card);
    const d = byCard[card.key];
    const q = search.trim().toLowerCase();
    /* Account dropdown — sirf us account ke campaigns */
    const acctOpts = [...new Map(d.ads.filter((r) => r.account || r.accountId).map((r) => [r.accountId || r.account, r.account || r.accountId])).entries()]
      .sort((x, y) => String(x[1]).localeCompare(String(y[1])));
    const byAcct = acct ? d.ads.filter((r) => (r.accountId || r.account) === acct) : d.ads;
    const listAll = q
      ? byAcct.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)))
      : byAcct;
    const adPages = Math.max(1, Math.ceil(listAll.length / PAGE_SIZE));
    const adCur = Math.min(adPage, adPages);
    const listRows = listAll.slice((adCur - 1) * PAGE_SIZE, adCur * PAGE_SIZE);

    /* Har ad ka is range ka spend/leads. */
    /* Sirf isi card ke platform ka — warna Facebook card me Instagram
       ka kharcha bhi jud jaata tha. Account bhi match karte hain taaki
       do accounts ke same naam wale campaign mix na hon. */
    const perAd = {};
    d.ads.forEach((a) => {
      const mine = dailyInRange.filter((x) => String(x.channel || "") === card.key && sameCampaign(a, x));
      perAd[a.id] = hasDaily ? sumRows(mine) : sumRows([a]);
    });
    const isMeta = card.via === "Meta";
    const M = isMeta ? money2 : money;

    /* Din-by-din table — jis din entry nahi, us din 0. */
    const dayList = daysInRange(from, to);
    const dayRows = (dayList || [...new Set(dailyInRange.map((x) => x.date))].sort().reverse()).map((day) => {
      const mine = dailyInRange.filter((x) => x.date === day && String(x.channel || "") === card.key);
      const spend = mine.reduce((a, x) => a + num(x.spend), 0);
      const leads = mine.reduce((a, x) => a + num(x.leads), 0);
      return { day, spend, leads, ads: mine.length };
    });
    const maxSpend = Math.max(1, ...dayRows.map((r) => r.spend));

    return (
      <>
        {adsDrawer}
        <div className="pg-head" style={{ marginTop: 0 }}>
          <div className="pg-head-left">
            <button className="back-btn" type="button" aria-label="Back to platforms"
              onClick={() => { setOpenCard(null); setSearch(""); }}   /* filter bana rehta hai */>
              <i className="fa-solid fa-arrow-left" />
            </button>
            <div>
              <h2 className="pg-title cc-title">
                <span className="pc-ic-sm" style={{ background: card.tint, color: card.accent }}><i className={card.icon} /></span>
                {card.key} Ads
              </h2>
              <div className="pg-desc">{card.note} · <span className={`pill ${conn.cls}`}>{conn.label}</span></div>
            </div>
          </div>
          <div className="cc-head-actions">
            {card.via === "Meta" ? <ViewSwitch current={card.key} onOpen={openView} /> : null}
            {card.via ? <button className="btn btn-ghost" type="button" onClick={() => setLinkOpen(true)}><i className="fa-solid fa-link" /> Link from {card.via}</button> : null}
            <button className="btn btn-gold" type="button" onClick={() => setModal({ editingId: null, initial: { ...blankForm(tab.fields), channel: card.key } })}>
              <i className="fa-solid fa-plus" /> Add Manually
            </button>
          </div>
        </div>

        <div className="sq-row">
          <FilterPanel value={flt} onApply={(f) => { setFlt(f); if (f.platform !== plat) { setOpenCard(f.platform || null); setSearch(""); } }} />
          <StatusQuick value={flt.status} onChange={(st) => setFlt((p) => ({ ...p, status: st }))} /><ObjectiveQuick value={flt.objective} rows={rows} onChange={(o) => setFlt((p) => ({ ...p, objective: o }))} />
        </div>
        {timeBar}
        {card.via === "Meta" ? <ProblemBanner problems={problems} /> : null}

        <div className="cc-stats">
          <StatBox label={isMeta ? "Amount spent" : "Spend"} value={M(d.spend)} sub={win ? "hour-wise from Meta" : hasDaily ? `${d.entries} daily entr${d.entries === 1 ? "y" : "ies"}` : "campaign totals"} icon="fa-indian-rupee-sign" />
          <StatBox label={isMeta ? "Results" : "Leads"} value={count(d.leads)}
            sub={d.leads > 0 ? `${isMeta ? "Cost per result" : "CPL"} ${M(d.spend / d.leads)}` : "0 in this range"} icon="fa-inbox" />
          <StatBox label="Live" value={count(d.live)} sub={d.blocked ? `${d.blocked} stopped by payment error` : "running now"} icon="fa-circle-play" tone="green" />
          <StatBox label="Paused" value={count(d.paused)} sub="turned off" icon="fa-circle-pause" tone="amber" />
        </div>

        {isMeta && (d.impressions > 0 || d.formLeads > 0 || d.chats > 0) ? (
          <div className="cc-stats">
            <StatBox label="Impressions" value={count(d.impressions)} sub={d.impressions ? `CPM ${M(cpm(d))}` : "—"} icon="fa-eye" />
            <StatBox label="Link clicks" value={count(d.linkClicks)}
              sub={d.impressions ? `CTR ${ctrLink(d).toFixed(2)}% · Clicks (all) ${count(d.clicks)} · ${ctrAll(d).toFixed(2)}%` : "—"} icon="fa-arrow-pointer" />
            <StatBox label="Leads (Form)" value={count(d.formLeads)} sub={d.formLeads ? `Per form lead ${M(d.spend / d.formLeads)}` : "from lead forms"} icon="fa-file-lines" />
            <StatBox label="Messaging conversations" value={count(d.chats)}
              sub="WhatsApp / Messenger — counted in Results only when the campaign goal is messaging" icon="fa-brands fa-whatsapp" tone="green" />
          </div>
        ) : null}

        {card.key === "Website" ? (() => {
          /* Website ki har lead — kis form se aayi aur poori detail */
          const list = webForm ? webInRange.filter((l) => (l.formId || "") === webForm) : webInRange;
          const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
          const cur = Math.min(webPage, pages);
          const shown = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
          const when = (l) => {
            const t = Date.parse(l.receivedTime || "");
            return Number.isFinite(t) ? new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : (l.receivedAt || "—");
          };
          return (
            <div className="card">
              <div className="card-head">
                <div className="ttl">
                  <i className="fa-solid fa-globe" />
                  <div className="ttl-txt">
                    <b>Website leads</b>
                    <span>Every lead from the website forms — which form it came from and full details</span>
                  </div>
                </div>
                <div className="card-tools"><span className="cnt">{list.length} lead{list.length === 1 ? "" : "s"}</span></div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 18px 4px" }}>
                {[{ key: "", label: "All forms", icon: "fa-layer-group", color: "#1B2333", n: webInRange.length }, ...WEB_FORMS.map((f) => ({ ...f, n: webCount(f.key) }))].map((f) => (
                  <button type="button" key={f.key || "all"} onClick={() => setWebForm(f.key)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, cursor: "pointer", font: "700 12.5px var(--font)", border: `1px solid ${webForm === f.key ? f.color : "#E3E6EF"}`, background: webForm === f.key ? `color-mix(in srgb, ${f.color} 10%, #fff)` : "#fff", color: webForm === f.key ? f.color : "#3A4254" }}>
                    <i className={`fa-solid ${f.icon}`} style={{ color: f.color }} /> {f.label}
                    <em style={{ fontStyle: "normal", fontSize: 11, padding: "1px 7px", borderRadius: 999, background: "#F1F3F8", color: "#1B2333" }}>{f.n}</em>
                  </button>
                ))}
              </div>
              {shown.length ? (
                <div className="tbl-scroll">
                  <table className="mod-table">
                    <thead><tr><th>Received</th><th>Form</th><th>Name</th><th>Phone</th><th>Email</th><th>Service</th><th>City</th><th>Message</th><th>Page</th></tr></thead>
                    <tbody>
                      {shown.map((l) => {
                        const f = WEB_FORMS.find((x) => x.key === l.formId) || { short: "Website", icon: "fa-globe", color: "#0F766E" };
                        return (
                          <tr key={l.id}>
                            <td style={{ whiteSpace: "nowrap" }}>{when(l)}</td>
                            <td style={{ whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: `color-mix(in srgb, ${f.color} 10%, #fff)`, color: f.color }}><i className={`fa-solid ${f.icon}`} /> {f.short}</span></td>
                            <td><b>{l.name || "—"}</b></td>
                            <td style={{ whiteSpace: "nowrap" }}>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : "—"}</td>
                            <td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : <span className="mut">—</span>}</td>
                            <td>{l.service || <span className="mut">—</span>}</td>
                            <td>{l.city || <span className="mut">—</span>}</td>
                            <td style={{ minWidth: 200, maxWidth: 320, whiteSpace: "normal", fontSize: 12.5, color: "#3A4254" }}>{l.message || <span className="mut">—</span>}</td>
                            <td>{l.pageUrl ? <a href={l.pageUrl} target="_blank" rel="noreferrer" title={l.pageUrl}><i className="fa-solid fa-arrow-up-right-from-square" /> Open</a> : <span className="mut">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <Empty icon="fa-globe" text={webLeads.length ? "No website leads in this range — pick another date range or form." : "No website leads yet. They come from the website database every 5 minutes."} />}
              <TablePager page={cur} pages={pages} total={list.length} onPage={setWebPage} />
            </div>
          );
        })() : null}

        <div className="card">
          <div className="card-head">
            <div className="ttl">
              <i className="fa-solid fa-calendar-days" />
              <div className="ttl-txt">
                <b>Daily breakdown</b>
                <span>How much was spent and how many leads came each day</span>
              </div>
            </div>
            <div className="card-tools"><span className="cnt">{dayRows.length} day{dayRows.length === 1 ? "" : "s"}</span></div>
          </div>
          {dayRows.length ? (
            <DailyChart rows={dayRows} color={card.accent} money={M} count={count} isMeta={isMeta} today={todayISO()} />
          ) : <Empty icon="fa-calendar-days" text="No day-wise breakdown for the All time range. Choose a fixed range." />}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="ttl">
              <i className="fa-solid fa-tower-broadcast" />
              <div className="ttl-txt">
                <b>Ads on {card.key}</b>
                <span>Spend and leads are for the selected period, not all-time</span>
              </div>
            </div>
            <div className="card-tools">
              <label className={`acct-sel${acct ? " on" : ""}`} title="Filter by ad account">
                <i className="fa-solid fa-building" />
                <select value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Ad account">
                  <option value="">All accounts ({d.ads.length})</option>
                  {acctOpts.map(([id, name]) => <option key={id} value={id}>{name} ({d.ads.filter((r) => (r.accountId || r.account) === id).length})</option>)}
                </select>
                <i className="fa-solid fa-chevron-down acct-cv" />
              </label>
              <label className="mini-search"><i className="fa-solid fa-magnifying-glass" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></label>
              <span className="cnt">{listAll.length} ad{listAll.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          {listRows.length ? (
            <>
              <div className="tbl-scroll desktop-module-table">
                <table className="mod-table ad-table ac-table">
                  <thead>
                    <tr>
                      <th className="ac-name">Campaign</th>
                      <th>Budget</th>
                      <th className="ta-r">{isMeta ? "Amount spent" : "Spend"} <span className="th-sub">{rl}</span></th>
                      <th className="ta-r">{isMeta ? "Results" : "Leads"} <span className="th-sub">{rl}</span></th>
                      <th className="ta-r">{isMeta ? "Cost / result" : "CPL"}</th>
                      {isMeta ? <th className="ta-r ac-del">Delivery <span className="th-sub">Impr. · clicks</span></th> : null}
                      <th className="ac-stc">Status</th><th className="ta-r ac-act"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const ps = perAd[row.id]?.spend || 0;
                      const pl = perAd[row.id]?.leads || 0;
                      return (
                      <tr key={row.id}>
                        <td className="ac-name">
                          {row.extId && (row.platform === "Meta" || row.metaSync === "Synced")
                            ? <button type="button" className="ad-name ad-name-btn" title="Open ads and lead form" onClick={() => setAdsFor({ ...row, openForm: true })}>{row.name}</button>
                            : <div className="ad-name" title={row.name}>{row.name}</div>}
                          <div className="ad-sub">
                            <span className={`pill ac-st-inline ${isBlocked(row) && String(row.status) === "Active" ? "pill-off" : statusClass(row.status)}`}><span className="dot">●</span>{isBlocked(row) && String(row.status) === "Active" ? "Payment error" : row.status}</span>
                            <span className="ad-lvl">{row.level || "Campaign"}</span>
                            {objectiveOf(row) ? <span className="ad-obj"><i className={`fa-solid ${(OBJECTIVES.find((o) => o.key === objectiveOf(row)) || {}).icon || "fa-bullseye"}`} /> {objectiveOf(row)}</span> : null}
                          </div>
                        </td>
                        <td>{isMeta ? (() => { const b = budgetInfo(row, money); return <>{b.main}{b.sub ? <div className="ad-sync">{b.sub}</div> : null}</>; })() : pretty(row.dailyBudget, "dailyBudget")}</td>
                        <td className="ta-r"><b>{M(ps)}</b></td>
                        <td className="ta-r">
                          <b>{pl > 0 || ps > 0 ? count(pl) : "—"}</b>
                          {isMeta ? <div className="ad-sync ac-rl">{perAd[row.id]?.label || row.resultLabel || ""}</div> : null}
                        </td>
                        <td className="ta-r">{pl > 0 ? M(ps / pl) : <span className="mut">—</span>}
                          {isMeta && pl > 0 ? <div className="ad-sync">{(perAd[row.id]?.label || row.resultLabel || "").startsWith("Leads") ? "Per lead (form)" : "Per result"}</div> : null}
                        </td>
                        {isMeta ? (
                          <td className="ta-r ac-del">
                            <b>{count(perAd[row.id]?.impressions || 0)}</b>
                            <div className="ad-sync"><i className="fa-solid fa-arrow-pointer" /> {count(perAd[row.id]?.linkClicks || 0)} clicks</div>
                          </td>
                        ) : null}
                        <td className="ac-stc">
                          {isBlocked(row) && String(row.status) === "Active"
                            ? <span className="pill pill-off"><span className="dot">●</span>Payment error</span>
                            : <span className={`pill ${statusClass(row.status)}`}><span className="dot">●</span>{row.status}</span>}
                          {row.issue ? <div className="ms-issue">{row.issue}</div> : null}
                          <div className="ad-sync">{row.metaStatus && row.metaStatus !== row.status ? `Meta: ${row.metaStatus}` : (row.metaSync || "Local Only")}</div>
                        </td>
                        <td className="ta-r ac-act">
                          <RowMenu items={rowActions(row)} busy={busyId === row.id} />
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>

              <div className="ac-cards mobile-module-cards">
                {listRows.map((row) => {
                  const ps = perAd[row.id]?.spend || 0;
                  const pl = perAd[row.id]?.leads || 0;
                  const ob = objectiveOf(row);
                  const blocked = isBlocked(row) && String(row.status) === "Active";
                  return (
                    <div className="ac-card" key={row.id}>
                      <div className="ac-card-top">
                        <div className="ac-card-tt">
                          {row.extId && (row.platform === "Meta" || row.metaSync === "Synced")
                            ? <button type="button" className="ac-card-name ad-name-btn" onClick={() => setAdsFor({ ...row, openForm: true })}>{row.name}</button>
                            : <div className="ac-card-name">{row.name}</div>}
                          <div className="ad-sub">
                            {blocked ? <span className="pill pill-off"><span className="dot">●</span>Payment error</span>
                              : <span className={`pill ${statusClass(row.status)}`}><span className="dot">●</span>{row.status}</span>}
                            {ob ? <span className="ad-obj"><i className={`fa-solid ${(OBJECTIVES.find((o) => o.key === ob) || {}).icon || "fa-bullseye"}`} /> {ob}</span> : null}
                          </div>
                        </div>
                        <RowMenu items={rowActions(row)} busy={busyId === row.id} />
                      </div>
                      <div className="ac-card-grid">
                        <div><span>{isMeta ? "Amount spent" : "Spend"}</span><b>{M(ps)}</b></div>
                        <div><span>{isMeta ? (perAd[row.id]?.label || row.resultLabel || "Results") : "Leads"}</span><b>{pl > 0 || ps > 0 ? count(pl) : "—"}</b></div>
                        <div><span>{isMeta ? "Cost per result" : "CPL"}</span><b>{pl > 0 ? M(ps / pl) : "—"}</b></div>
                        {isMeta ? <div><span>Impressions</span><b>{count(perAd[row.id]?.impressions || 0)}</b></div> : null}
                        {isMeta ? <div><span>Link clicks</span><b>{count(perAd[row.id]?.linkClicks || 0)}</b></div> : null}
                        <div><span>Budget</span><b>{isMeta ? budgetInfo(row, money).main : pretty(row.dailyBudget, "dailyBudget")}</b></div>
                      </div>
                      {row.issue ? <div className="ms-issue">{row.issue}</div> : null}
                      <div className="ac-card-foot">
                        <span>{row.service ? <><i className="fa-solid fa-briefcase" /> {row.service}</> : null}</span>
                        {String(row.status) === "Active" && row.extId && isMeta ? (
                          <button type="button" className="ac-ads" onClick={() => setAdsFor(row)}><i className="fa-solid fa-layer-group" /> View ads</button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <TablePager page={adCur} pages={adPages} total={listAll.length} onPage={setAdPage} />
            </>
          ) : <Empty icon="fa-tower-broadcast" text={`No ads on ${card.key} yet. Start with "Add Manually" or "Link from ${card.via || "platform"}".`} />}
        </div>

        {modal ? (
          <FormModal tab={tab} rows={rows} editingId={modal.editingId} initial={modal.initial} icon="fa-tower-broadcast"
            title={modal.editingId ? "Edit Campaign" : `Add ${card.key} Campaign`}
            onSave={save} onClose={() => setModal(null)} />
        ) : null}

        {linkOpen ? <LinkModal card={card} accounts={accounts} tab={tab} onSave={linkExisting} onClose={() => setLinkOpen(false)} /> : null}
        {dayModal ? <DailyModal preset={dayModal} onSave={saveDaily} onClose={() => setDayModal(null)} /> : null}
      </>
    );
  }

  /* ================= CARDS GRID =================
     Yahan alag stat row nahi hai — filter ka asar seedha card ke
     andar dikhta hai, kyunki har card apne platform ka spend aur
     leads usi range se leta hai. */
  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
        {/* Sync / Pull / Add Daily Entry buttons hata diye — Meta data apne aap sync hota hai */}
      </div>

      <div className="sq-row">
        <FilterPanel value={flt} onApply={setFlt} />
        <StatusQuick value={flt.status} onChange={(st) => setFlt((p) => ({ ...p, status: st }))} /><ObjectiveQuick value={flt.objective} rows={rows} onChange={(o) => setFlt((p) => ({ ...p, objective: o }))} />
      </div>
      {timeBar}

      {plat ? (() => {
        const d = byCard[plat];
        const c = PLATFORM_CARDS.find((x) => x.key === plat);
        return (
          <div className="pf-summary" style={{ borderLeftColor: c.accent }}>
            <span className="pf-ic" style={{ background: c.tint, color: c.accent }}><i className={c.icon} /></span>
            <b>{plat}</b>
            <span className="pf-sep">·</span><span><b>{d.live}</b> live</span>
            <span className="pf-sep">·</span><span><b>{d.paused}</b> paused</span>
            <span className="pf-sep">·</span><span><b>{money(d.spend)}</b> spend</span>
            <span className="pf-sep">·</span><span><b>{count(d.leads)}</b> leads</span>
            <span className="pf-rng">{rl}</span>
            <button type="button" className="pf-clear" onClick={() => setPlat("")}>
              <i className="fa-solid fa-xmark" /> Show all
            </button>
          </div>
        );
      })() : null}

      {!hasDaily ? (
        <div className="cc-hint">
          <i className="fa-solid fa-circle-info" />
          <span>Showing campaign <b>total</b> numbers for now. <b>Daily Stats</b> tab: add day-wise entries, or use the 📅 button in the list — then the date filter will work properly.</span>
        </div>
      ) : null}

      <ProblemBanner problems={problems} />

      {!plat && (byCard.Facebook.spend + byCard.Instagram.spend > 0 || metaRows.length) ? (() => {
        const f = byCard.Facebook; const i = byCard.Instagram;
        const sp = f.spend + i.spend; const ld = f.leads + i.leads;
        const share = sp ? Math.round((f.spend / sp) * 100) : 0;
        return (
          <section className="mx">
            <div className="mx-top">
              <span className="mt-badge"><i className="fa-brands fa-meta" /> Meta</span>
              <span className="mt-period">{rl}</span>
              <button type="button" className="mx-link" onClick={() => openView("Meta")}>Compare Facebook and Instagram <i className="fa-solid fa-arrow-right" /></button>
            </div>
            <div className="mx-body">
              <div className="mx-total">
                <span>Total spend</span>
                <b>{money2(sp)}</b>
                <div className="mx-total-row">
                  <div><em>{count(ld)}</em><small>results</small></div>
                  <div><em>{ld ? money2(sp / ld) : "—"}</em><small>per result</small></div>
                </div>
                {(f.formLeads || 0) + (i.formLeads || 0) + (f.chats || 0) + (i.chats || 0) > 0 ? (() => {
                  /* Form leads aur chats — sabse zaroori, isliye bade highlight tiles */
                  const fl = (f.formLeads || 0) + (i.formLeads || 0);
                  const ch = (f.chats || 0) + (i.chats || 0);
                  const tile = (bg, bd) => ({ display: "flex", flexDirection: "column", gap: 6, padding: "12px 12px", borderRadius: 14, background: bg, border: `1px solid ${bd}`, minWidth: 0 });
                  const ic = (bg, fg) => ({ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: bg, color: fg, fontSize: 13, flexShrink: 0 });
                  const big = { fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", color: "#101828" };
                  const lbl = { fontSize: 12.5, fontWeight: 700, color: "#1B2333", whiteSpace: "nowrap" };
                  const sub = { fontSize: 10, fontWeight: 600, color: "#5B6478", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
                  return (
                    <div title="Lead Capture me sirf form leads aati hain — chats WhatsApp/Messenger me hoti hain"
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px dashed #E3E6EF" }}>
                      <div style={tile("linear-gradient(160deg,#EEF4FF,#F8FAFF)", "#D6E4FF")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={ic("#2F6FED", "#fff")}><i className="fa-solid fa-file-lines" /></span>
                          <span style={lbl}>Form leads</span>
                        </div>
                        <b style={big}>{count(fl)}</b>
                        <span style={sub}><i className="fa-solid fa-inbox" /> Lead Capture</span>
                      </div>
                      <div style={tile("linear-gradient(160deg,#E9FBF0,#F6FEF9)", "#C6F0D6")}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={ic("#25D366", "#fff")}><i className="fa-brands fa-whatsapp" /></span>
                          <span style={lbl}>Chats</span>
                        </div>
                        <b style={big}>{count(ch)}</b>
                        <span style={sub}><i className="fa-solid fa-comments" /> WhatsApp / DM</span>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
              <div className="mx-vs">
                {[
                  { k: "Facebook", c: "#1877F2", icon: "fa-brands fa-facebook-f", t: f, pct: share },
                  { k: "Instagram", c: "#D62976", icon: "fa-brands fa-instagram", t: i, pct: sp ? 100 - share : 0 },
                ].map((x, idx, arr) => {
                  const cpr = x.t.leads ? x.t.spend / x.t.leads : 0;
                  const other = arr[1 - idx].t;
                  const ocpr = other.leads ? other.spend / other.leads : 0;
                  const cheaper = cpr && ocpr && cpr < ocpr;
                  return (
                    <button type="button" key={x.k} className="mx-side" style={{ "--pc": x.c }} onClick={() => { setPlat(x.k); setOpenCard(x.k); }}>
                      <Ring pct={x.pct} color={x.c} />
                      <div className="mx-side-body" style={{ flex: 1, minWidth: 0 }}>
                        <div className="mx-side-h"><i className={x.icon} /> {x.k}{cheaper ? <span className="mx-tag">Cheaper per result</span> : null}</div>
                        <b>{money(x.t.spend)}</b>
                        <div className="mx-side-row">
                          <span><em>{count(x.t.leads)}</em> results</span>
                          <span><em>{cpr ? money2(cpr) : "—"}</em> per result</span>
                        </div>
                        {/* Is platform ki form leads, chats, impressions, clicks — khaali jagah bhi bharti hai */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 8, marginTop: 12 }}>
                          {[
                            { ic: "fa-solid fa-file-lines", l: "Form leads", v: count(x.t.formLeads || 0) },
                            { ic: "fa-brands fa-whatsapp", l: "Chats", v: count(x.t.chats || 0) },
                            { ic: "fa-solid fa-eye", l: "Impressions", v: count(x.t.impressions || 0) },
                            { ic: "fa-solid fa-arrow-pointer", l: "Link clicks", v: count(x.t.linkClicks || 0) },
                          ].map((m) => (
                            <span key={m.l} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", borderRadius: 10, background: `color-mix(in srgb, ${x.c} 7%, #fff)`, border: `1px solid color-mix(in srgb, ${x.c} 18%, #fff)`, textAlign: "left", minWidth: 0 }}>
                              <small style={{ fontSize: 10.5, fontWeight: 700, color: "#5B6478", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><i className={m.ic} style={{ color: x.c, marginRight: 4 }} />{m.l}</small>
                              <strong style={{ fontSize: 16, fontWeight: 800, color: "#101828", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{m.v}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
                <span className="mx-vs-badge" aria-hidden="true">vs</span>
              </div>
            </div>
          </section>
        );
      })() : null}

      <div className={`pc-grid lg-grid${plat ? " single" : ""}`}>
        {visibleCards.map((c) => {
          const d = byCard[c.key];
          const conn = connection(c);
          const trend = trendOf(c.key);
          const total = d.live + d.paused;
          const isMeta = c.via === "Meta";
          return (
            <button type="button" className="lg-card" key={c.key} style={{ "--pc": c.accent }}
              onClick={() => { setPlat(c.key); setOpenCard(c.key); }}>
              <div className="lg-head">
                <span className="lg-ic"><i className={c.icon} /></span>
                <b className="lg-name">{c.key}</b>
                <span className={`pill ${conn.cls}`}>{conn.label}</span>
              </div>
              <div className="lg-desc">{c.note}</div>
              <div className="lg-amt">{money(d.spend)}</div>
              <div className="lg-amt-sub">Spent, {win ? rl : rl.toLowerCase()}</div>
              <Spark points={trend} color={c.accent} />
              <div className="lg-pair">
                <div><b>{count(d.leads)}</b><span>{isMeta ? "results" : "leads"}</span></div>
                <div><b>{d.spend > 0 && d.leads ? money(d.spend / d.leads) : "—"}</b><span>{isMeta ? "per result" : "per lead"}</span></div>
              </div>
              {c.key === "Website" ? (
                /* Website — kis form se kitni leads */
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  {WEB_FORMS.map((f) => (
                    <span key={f.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: `color-mix(in srgb, ${f.color} 10%, #fff)`, color: f.color, border: `1px solid color-mix(in srgb, ${f.color} 22%, #fff)` }}>
                      <i className={`fa-solid ${f.icon}`} /> {f.short} {webCount(f.key)}
                    </span>
                  ))}
                </div>
              ) : (
              <div className="lg-status">
                <div className="lg-status-bar" aria-hidden="true">
                  <i className="on" style={{ flex: d.live || 0 }} />
                  <i className="off" style={{ flex: d.paused || 0 }} />
                  {!total ? <i className="none" style={{ flex: 1 }} /> : null}
                </div>
                <span>{d.live} live, {d.paused} paused{d.blocked ? `, ${d.blocked} blocked` : ""}</span>
              </div>
              )}
              <span className="lg-open">Open {c.key} campaigns</span>
            </button>
          );
        })}
      </div>

      <details className="lg-howto">
        <summary><i className="fa-solid fa-circle-info" /> How ads get connected</summary>
        <div className="lg-howto-body">
          <div className="lt-row">
            <div className="lt-ic" style={{ background: "var(--gold-bg)", color: "var(--gold-deep)" }}><i className="fa-solid fa-hand" /></div>
            <div className="lt-meta"><div className="lt-name">Add Manually</div><div className="lt-sub">Fill in the ad details yourself. No setup needed, but spend/leads must be updated daily.</div></div>
          </div>
          <div className="lt-row">
            <div className="lt-ic" style={{ background: "#E7F0FE", color: "#1877F2" }}><i className="fa-solid fa-link" /></div>
            <div className="lt-meta"><div className="lt-name">Link from Meta / Google</div><div className="lt-sub">Copy the Campaign ID from Ads Manager and paste it. If the token is active in Ad Accounts, spend and leads sync automatically.</div></div>
          </div>
          <div className="lt-row">
            <div className="lt-ic" style={{ background: "var(--green-bg)", color: "var(--green)" }}><i className="fa-solid fa-calendar-day" /></div>
            <div className="lt-meta"><div className="lt-name">Daily entry</div><div className="lt-sub">Each day's spend and leads go to Daily Stats. The date filter uses this — days with no entry count as 0.</div></div>
          </div>
        </div>
      </details>

      {dayModal ? <DailyModal preset={dayModal} onSave={saveDaily} onClose={() => setDayModal(null)} /> : null}
    </>
  );
}

/* ---------- chhote blocks ---------- */
function StatBox({ label, value, sub, icon, tone }) {
  return (
    <div className={`cc-stat${tone ? ` t-${tone}` : ""}`}>
      <div className="cc-stat-l"><i className={`fa-solid ${icon}`} /> {label}</div>
      <div className="cc-stat-v">{value}</div>
      <div className="cc-stat-s">{sub}</div>
    </div>
  );
}

function LinkModal({ card, accounts, tab, onSave, onClose }) {
  const accOpts = accounts.filter((a) => !card.via || String(a.platform) === card.via).map((a) => a.name);
  const linkTab = {
    fields: [
      { key: "name", label: "Campaign Name", type: "text", required: true, rules: [{ type: "length", min: 3, max: 120 }] },
      { key: "account", label: "Ad Account", type: "select", options: accOpts, required: true, hint: accOpts.length ? "" : "Connect an account in the Ad Accounts module first" },
      { key: "extId", label: `${card.via} Campaign ID`, type: "text", required: true, hint: "Copy from Ads Manager — e.g. 23851234567890123", rules: [{ type: "digits", min: 8, max: 25 }] },
      { key: "service", label: "Service (mandatory)", type: "select", options: (tab.fields.find((f) => f.key === "service")?.options) || [], required: true, hint: "The platform does not know VakilKaro services — this stays manual" },
    ],
  };
  return (
    <FormModal tab={linkTab} rows={[]} editingId={null}
      initial={{ name: "", account: accOpts[0] || "", extId: "", service: "" }}
      icon="fa-link" title={`Link existing ${card.key} ad`} submitLabel="Link Ad"
      onSave={(f) => onSave({ ...f, channel: card.key })} onClose={onClose} />
  );
}

function DailyModal({ preset, onSave, onClose }) {
  const ads = readRows("campaigns__live-ads");
  const dayTab = {
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "campaign", label: "Campaign", type: "select", options: ads.map((a) => a.name).filter(Boolean), required: true,
        hint: ads.length ? "" : "Add a campaign first" },
      { key: "channel", label: "Platform Card", type: "select", options: ["Facebook", "Instagram", "YouTube", "Website"], required: true },
      { key: "spend", label: "Spend", type: "number", rules: [{ type: "range", min: 0, max: 5000000 }], hint: "If nothing was spent that day, enter 0" },
      { key: "leads", label: "Leads", type: "number", rules: [{ type: "range", min: 0, max: 100000 }] },
      { key: "impressions", label: "Impressions", type: "number", rules: [{ type: "range", min: 0 }] },
      { key: "clicks", label: "Clicks", type: "number", rules: [{ type: "range", min: 0 }] },
    ],
  };
  return (
    <FormModal tab={dayTab} rows={[]} editingId={null}
      initial={{ date: todayISO(), campaign: preset.campaign || "", channel: preset.channel || "", spend: "0", leads: "0", impressions: "", clicks: "" }}
      icon="fa-calendar-plus" title="Daily spend & leads" submitLabel="Save Entry"
      onSave={onSave} onClose={onClose} />
  );
}

/* Filters ke bagal ka seedha switch — Filters panel ke Status se
   juda hua hai (dono ek hi value badalte hain). */
function StatusQuick({ value, onChange }) {
  const opts = [
    { key: "", label: "All" },
    { key: "Active", label: "Active", dot: "#2E9E6B" },
    { key: "Paused", label: "Paused", dot: "#D97706" },
  ];
  return (
    <div className="sq-seg" role="group" aria-label="Campaign status">
      {opts.map((o) => (
        <button key={o.key || "all"} type="button" className={value === o.key ? "on" : ""} onClick={() => onChange(o.key)}>
          {o.dot ? <i style={{ background: o.dot }} /> : null}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ⋯ button — click karo to saare kaam ek chhoti list me.
   List "fixed" position pe khulti hai, taaki table ke scroll me na kate. */
function RowMenu({ items, busy }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!pos) return undefined;
    const off = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setPos(null); };
    /* khulte hi jo chhota scroll hota hai (mobile pe) us se band na ho */
    const openedAt = Date.now();
    const close = () => { if (Date.now() - openedAt > 400) setPos(null); };
    const esc = (e) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [pos]);
  function toggle() {
    if (pos) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const W = 236; const H = items.length * 50 + 12;
    const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
    const below = r.bottom + 6 + H < window.innerHeight;
    setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - H - 6) });
  }
  return (
    <>
      <button ref={btn} type="button" className={`rm-btn${pos ? " on" : ""}`} onClick={toggle} aria-haspopup="menu" aria-expanded={Boolean(pos)} aria-label="Actions" title="Actions">
        <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-ellipsis"}`} />
      </button>
      {pos && typeof document !== "undefined" ? createPortal(
        <div ref={menu} className="rm-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? "danger" : ""} disabled={busy}
              onClick={() => { setPos(null); it.onClick(); }}>
              <span className="rm-ic"><i className={`fa-solid ${it.icon}`} /></span>
              <span className="rm-tx"><b>{it.label}</b>{it.hint ? <small>{it.hint}</small> : null}</span>
            </button>
          ))}
        </div>, document.body,
      ) : null}
    </>
  );
}

/* Objective — Ads Manager wala (Leads, Messages, Engagement, Awareness…).
   Sirf wahi dikhte hain jinke campaigns panel me hain, saath me ginti. */
function ObjectiveQuick({ value, rows, onChange }) {
  const counts = {};
  (rows || []).forEach((r) => { const o = objectiveOf(r); if (o) counts[o] = (counts[o] || 0) + 1; });
  const list = OBJECTIVES.filter((o) => counts[o.key] || o.key === value);
  const cur = OBJECTIVES.find((o) => o.key === value);
  return (
    <label className={`oq${value ? " on" : ""}`} title="Filter by campaign objective">
      <i className={`fa-solid ${cur ? cur.icon : "fa-bullseye"}`} style={cur ? { color: cur.color } : undefined} />
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Objective">
        <option value="">All objectives</option>
        {list.map((o) => <option key={o.key} value={o.key}>{o.key}{counts[o.key] ? ` (${counts[o.key]})` : ""}</option>)}
      </select>
      <i className="fa-solid fa-chevron-down oq-cv" />
    </label>
  );
}

/* Chhoti spend line — sirf shape batati hai (badh raha / ghat raha) */
function Spark({ points, color }) {
  const W = 220; const H = 44;
  if (!points || points.length < 2) return <div className="lg-spark lg-spark-empty"><span>No daily trend yet</span></div>;
  const max = Math.max(...points, 1);
  const xs = (i) => (i * W) / (points.length - 1);
  const ys = (v) => H - 4 - (v / max) * (H - 10);
  const line = points.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const id = `sp-${String(color).replace(/\W/g, "")}`;
  return (
    <svg className="lg-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1])} r="2.6" fill={color} />
    </svg>
  );
}

/* Kharch ka hissa — chhota ring, beech me % */
function Ring({ pct, color }) {
  const r = 26; const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <svg className="mx-ring" viewBox="0 0 64 64" aria-label={`${p}% of spend`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#EEEFF3" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray .7s ease" }} />
      <text x="32" y="36" textAnchor="middle" className="mx-ring-t">{p}%</text>
    </svg>
  );
}