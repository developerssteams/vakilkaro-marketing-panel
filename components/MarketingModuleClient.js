"use client";

import { usePaged } from "./Pager";
import { useEffect, useMemo, useState } from "react";
import { getModule, datasetKey, DATASETS } from "../lib/marketing-config";
import { readRows, writeRows, uid, logActivity, readActivity, readSettings } from "../lib/marketing-local";
import { tokenState } from "../lib/marketing-validate";
import { useToast } from "./Toast";
import CampaignCards from "./CampaignCards";
import WalletBalance from "./WalletBalance";
import LeadDaywise from "./LeadDaywise";
import CreateAdWizard from "./CreateAdWizard";
import BroadcastSender from "./BroadcastSender";
import ReplyInbox from "./ReplyInbox";
import CrmSync from "./CrmSync";
import QueueBuilder from "./QueueBuilder";
import MarkRecovered from "./MarkRecovered";
import AdPreview from "./AdPreview";
import MetaConnect from "./MetaConnect";
import AccountsBoard from "./AccountsBoard";
import PaymentHistory from "./PaymentHistory";
import LeadFormsTab from "./LeadFormsTab";
import StatesTab from "./StatesTab";
import ByTimeTab from "./ByTimeTab";
import { pullMetaLeads, lastLeadPull } from "../lib/meta-pull";
import { runMetaSync, isoAgo } from "../lib/sync-merge";
import {
  num, money, count, digits, pretty, isPillKey, statusClass,
  rowComputed, blankForm, labelOf, FormModal, FieldInput, MetricStrip, Empty,
} from "./ModuleParts";
import { validateForm } from "../lib/marketing-validate";

export default function MarketingModuleClient({ moduleKey }) {
  const config = getModule(moduleKey);
  const { show } = useToast();
  const [activeTab, setActiveTab] = useState(config.tabs[0].key);
  const tab = config.tabs.find((t) => t.key === activeTab) || config.tabs[0];

  return (
    <div className="mod-wrap">
      <div className="pg-head">
        <div>
          <h1 className="pg-title">{config.title}</h1>
          <div className="pg-desc">{config.description}</div>
        </div>
      </div>

      <div className="hl-tabs">
        {config.tabs.map((t) => (
          <button key={t.key} type="button" className={`hl-tab${t.key === activeTab ? " on" : ""}`} onClick={() => setActiveTab(t.key)}>
            <i className={`fa-solid ${t.icon}`} /> &nbsp;{t.label}
          </button>
        ))}
      </div>

      {tab.type === "cards" ? <CampaignCards moduleKey={moduleKey} tab={tab} show={show} />
        : tab.type === "wallet" ? (
          /* Balance & Payments — balance + payment history */
          <div className="wb-stack">
            <WalletBalance tab={tab} show={show} />
            <PaymentHistory />
          </div>
        )
        : tab.type === "leadforms" ? <LeadFormsTab tab={tab} />
        : tab.type === "states" ? <StatesTab tab={tab} />
        : tab.type === "bytime" ? <ByTimeTab tab={tab} />
        : tab.type === "daywise" ? <LeadDaywise moduleKey={moduleKey} tab={tab} show={show} />
        : tab.type === "broadcast" ? <BroadcastTab moduleKey={moduleKey} tab={tab} show={show} />
        : tab.type === "replies" ? <RepliesTab tab={tab} />
        : tab.type === "wizard" ? <WizardTab tab={tab} onDone={() => setActiveTab(tab.target)} />
        : tab.type === "builder" ? <BuilderTab moduleKey={moduleKey} tab={tab} onDone={() => setActiveTab(tab.target)} show={show} />
        : tab.type === "log" ? <LogTab tab={tab} />
        : tab.type === "perf" ? <PerfTab tab={tab} />
        : <CrudTab key={tab.key} moduleKey={moduleKey} tab={tab} show={show} />}
    </div>
  );
}

/* ============================================================
   CRUD TAB
   ============================================================ */
function CrudTab({ moduleKey, tab, show }) {
  const ds = datasetKey(moduleKey, tab.key);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [modal, setModal] = useState(null); // { editingId, initial }
  const [preview, setPreview] = useState(null);
  const [crmOpen, setCrmOpen] = useState(false);
  const [qbOpen, setQbOpen] = useState(false);
  const [recoverRow, setRecoverRow] = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);
  /* Ad Accounts hamesha cards me (table view hata diya) */
  const cardsMode = Boolean(tab.metaConnect);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;   /* har page pe 10 — zyada ho to agla page */

  /* Purane version me token form me daala jaata tha aur browser me
     save hota tha. Wahan se hata dete hain — token sirf .env me. */
  useEffect(() => {
    if (!tab.metaConnect) return;
    const old = readRows(ds);
    if (old.some((r) => r.accessToken)) {
      writeRows(ds, old.map(({ accessToken, ...rest }) => rest));
      show("Removed an old access token stored in the browser — the token now lives only in .env.", "success");
    }
  }, [ds, tab]);

  useEffect(() => {
    const load = () => setRows(withLiveCounts(tab, readRows(ds)));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [ds, tab]);

  const statusField = tab.fields.find((f) => f.key === "status" && f.options?.length);

  /* Staff-wise filter — jab dataset me assigned-to jaisa field ho.
     Har staff apni leads dekh sake, aur "Unassigned" alag se. */
  const staffField = tab.fields?.find((f) => f.key === "lastStaff" || f.key === "owner");

  const staffList = useMemo(() => {
    if (!staffField) return [];
    return [...new Set(rows.map((r) => String(r[staffField.key] || "").trim()).filter(Boolean))].sort();
  }, [rows, staffField]);

  /* Filter ya search badla to page 1 par wapas — warna user page 4
     par hota hai aur filter ke baad sirf 10 rows bachti hain, phir
     khaali screen dikhti hai. */
  useEffect(() => { setPage(1); }, [search, filter, staffFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (filter) out = out.filter((r) => String(r.status || "") === filter);
    if (staffFilter && staffField) {
      out = staffFilter === "__none"
        ? out.filter((r) => !String(r[staffField.key] || "").trim())
        : out.filter((r) => String(r[staffField.key] || "").trim() === staffFilter);
    }
    if (!q) return out;
    return out.filter((row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, search, filter, staffFilter, staffField]);

  /* 150 rows ek saath render karne se page bhaari ho jaata hai aur
     scroll me dhoondhna mushkil. 25 per page rakhte hain. */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page],
  );

  function titleOf(r) {
    return r.name || r.title || r.code || r.invoiceNo || r.formName || r.account || r.journey || tab.singular;
  }

  function save(form) {
    const now = new Date().toISOString();
    let next;
    if (modal.editingId) {
      next = rows.map((r) => (r.id === modal.editingId ? { ...r, ...form, updatedAt: now } : r));
      logActivity({ dataset: ds, action: "Updated", target: titleOf(form), detail: `${tab.label} record edited` });
      show(`${tab.singular} updated.`, "success");
    } else {
      next = [{ id: uid(), ...form, createdAt: now, updatedAt: now }, ...rows];
      logActivity({ dataset: ds, action: "Created", target: titleOf(form), detail: `New ${tab.singular.toLowerCase()} added` });
      show(`${tab.singular} added.`, "success");
    }
    /* Ek platform pe sirf ek default — naya set karo to purana apne aap hat jaaye. */
    if (tab.singleDefault && String(form[tab.singleDefault.field]) === "Yes") {
      const scopeVal = String(form[tab.singleDefault.scope] || "");
      const savedId = modal.editingId || next[0].id;
      next = next.map((r) => (r.id !== savedId && String(r[tab.singleDefault.scope] || "") === scopeVal)
        ? { ...r, [tab.singleDefault.field]: "No" } : r);
    }
    setRows(next); writeRows(ds, next); setModal(null);

    /* Disposition set hui to Lost Pool me wapas likho — attempts badhao
       aur bucket ke hisaab se cooldown lagao. Bina iske wahi lead kal
       phir queue me aa jaati, aur staff ko dobara call karna padta. */
    if (tab.dispositionSync && form.disposition) applyDisposition(form);

    /* Meta account haath se add/edit hua → Meta se verify karo, details
       bharo, aur turant uske campaigns le aao. */
    if (tab.metaConnect && form.platform === "Meta" && form.accountId) {
      const before = modal.editingId ? rows.find((r) => r.id === modal.editingId) : null;
      const savedId = modal.editingId || next[0].id;
      if (!before || String(before.accountId).trim() !== String(form.accountId).trim()) verifyAndSync(savedId, form.accountId);
    }
  }

  async function verifyAndSync(rowId, rawId) {
    const accountId = String(rawId).trim().startsWith("act_") ? String(rawId).trim() : `act_${String(rawId).trim()}`;
    show("Checking the account with Meta...", "success");
    let acc;
    try {
      const r = await fetch("/api/meta/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }),
      });
      const j = await r.json();
      if (j.needsSetup) { show("META_TOKEN is not in .env — account saved but it will not sync.", "error"); return; }
      if (!j.ok) { show(`${j.error}${j.hint ? " — " + j.hint : ""}`, "error"); return; }
      acc = j.account;
    } catch { show("Could not reach the server.", "error"); return; }

    /* Jo user ne khud bhara wo rehne do, khaali fields Meta se bharo */
    const cur = readRows(ds);
    const updated = cur.map((r) => (r.id !== rowId ? r : {
      ...r, accountId: acc.accountId,
      bmId: r.bmId || acc.bmId, currency: r.currency || acc.currency,
      pageId: r.pageId || acc.pageId, pageName: r.pageName || acc.pageName,
      metaStatus: acc.status, bmName: acc.bmName, timezone: acc.timezone,
      connectedVia: "System User", updatedAt: new Date().toISOString(),
    }));
    setRows(updated); writeRows(ds, updated);

    const res = await runMetaSync({ accountIds: [acc.accountId], since: isoAgo(90), until: isoAgo(0) });
    if (!res.ok) { show(res.error, "error"); return; }
    if (res.errors.length) { show(`Sync fail: ${res.errors[0].message}`, "error"); return; }
    const latest = readRows(ds).map((r) => (r.id === rowId ? { ...r, lastSync: new Date().toISOString().slice(0, 10) } : r));
    writeRows(ds, latest);
    show(`${acc.name} connected — ${res.added} new campaigns and ${res.daily} daily rows added to Campaigns.`, "success");
    setRows(withLiveCounts(tab, readRows(ds)));
  }

  function applyDisposition(row) {
    const pool = readRows("audience__lost-pool");
    const buckets = readRows("audience__buckets");
    const digits = String(row.contact || "").replace(/\D/g, "").slice(-10);
    const lead = pool.find((l) => String(l.phone || "").replace(/\D/g, "").slice(-10) === digits);
    if (!lead) return;

    const d = String(row.disposition);
    const bucket = buckets.find((b) =>
      String(b.name || "").trim().toLowerCase() === String(lead.bucket || "").trim().toLowerCase());
    const cooldown = Number(bucket?.cooldownDays || 30);

    const patch = { attempts: String(Number(lead.attempts || 0) + 1), updatedAt: new Date().toISOString() };

    if (d === "Wrong Number") {
      /* Number hi galat hai — dobara try karne ka koi matlab nahi */
      patch.status = "Archived";
      patch.dnd = "Yes";
    } else if (d === "Final No") {
      patch.status = "Archived";
    } else if (d === "Interested") {
      /* Garam lead — cooldown nahi lagana, staff turant follow kare */
      patch.priority = "High";
      patch.status = "Queued";
    } else {
      /* Connected / Callback / Not Reachable — normal cooldown */
      const next = new Date();
      next.setDate(next.getDate() + (d === "Callback" ? 3 : cooldown));
      patch.nextEligible = next.toISOString().slice(0, 10);
      patch.status = "Sequenced";
    }

    writeRows("audience__lost-pool", pool.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));
  }

  function removeRow(row) {
    /* Jis account pe campaigns ya ledger entries hain use delete mat hone do. */
    for (const g of (tab.deleteGuard || [])) {
      const used = readRows(g.dataset).filter((r) => String(r[g.match] || "") === String(row.name || row.account || ""));
      if (used.length) { show(`This account has ${used.length} ${g.label} — remove them first.`, "error"); return; }
    }
    if (!window.confirm(`Delete this ${tab.singular.toLowerCase()}?`)) return;
    const next = rows.filter((r) => r.id !== row.id);
    setRows(next); writeRows(ds, next);
    logActivity({ dataset: ds, action: "Deleted", target: titleOf(row), detail: `${tab.label} record removed` });
    show(`${tab.singular} deleted.`, "success");
  }

  function toggleStatus(row) {
    if (!statusField) return;
    const o = statusField.options;
    const nextStatus = o[(Math.max(0, o.indexOf(row.status)) + 1) % o.length];
    const next = rows.map((r) => (r.id === row.id ? { ...r, status: nextStatus, updatedAt: new Date().toISOString() } : r));
    setRows(next); writeRows(ds, next);
    logActivity({ dataset: ds, action: "Status", target: titleOf(row), detail: `${row.status || "—"} → ${nextStatus}` });
    show(`Status changed to ${nextStatus}.`, "success");
  }

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
        <div className="cc-head-actions">
          {tab.queueBuilder ? (
            <button className="btn btn-ghost" type="button" onClick={() => setQbOpen((v) => !v)}>
              <i className="fa-solid fa-list-check" /> {qbOpen ? "Hide builder" : "Build Today's Queue"}
            </button>
          ) : null}
          {tab.metaConnect && !cardsMode ? (
            <button className="btn btn-ghost" type="button" onClick={() => setMetaOpen((v) => !v)}>
              <i className="fa-brands fa-meta" /> {metaOpen ? "Hide" : "Connect Meta Account"}
            </button>
          ) : null}
          {tab.metaLeadPull ? <LeadPullButton show={show} /> : null}
          {tab.crmSync ? (
            <button className="btn btn-ghost" type="button" onClick={() => setCrmOpen((v) => !v)}>
              <i className="fa-solid fa-database" /> {crmOpen ? "Hide CRM sync" : "Sync from CRM"}
            </button>
          ) : null}
          {!cardsMode ? (
            <button className="btn btn-gold" type="button" onClick={() => setModal({ editingId: null, initial: blankForm(tab.fields) })}>
              <i className="fa-solid fa-plus" /> Add {tab.singular}
            </button>
          ) : null}
        </div>
      </div>

      {metaOpen ? (
        <ConnectPopup onClose={() => setMetaOpen(false)}>
          <MetaConnect onClose={() => setMetaOpen(false)} onDone={() => setRows(withLiveCounts(tab, readRows(ds)))} />
        </ConnectPopup>
      ) : null}
      {crmOpen ? <CrmSync onClose={() => setCrmOpen(false)} /> : null}
      {qbOpen ? <QueueBuilder onClose={() => setQbOpen(false)} /> : null}
      {recoverRow ? <MarkRecovered row={recoverRow} onClose={() => setRecoverRow(null)} onDone={() => setRows(withLiveCounts(tab, readRows(ds)))} /> : null}

      {cardsMode ? (
        <AccountsBoard
          rows={rows}
          onEdit={(row) => setModal({ editingId: row.id, initial: { ...blankForm(tab.fields), ...row } })}
          onDelete={removeRow}
          onConnect={() => setMetaOpen(true)}
          onAdd={() => setModal({ editingId: null, initial: blankForm(tab.fields) })}
        />
      ) : null}

      {!cardsMode ? <MetricStrip metrics={tab.metrics} rows={rows} /> : null}

      {!cardsMode ? <div className="card">
        <div className="card-head">
          <div className="ttl"><i className={`fa-solid ${tab.icon}`} /> &nbsp;{tab.label}</div>
          <div className="card-tools">
            {staffField && staffList.length ? (
              <select className="form-control mini-select" value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                <option value="">All staff</option>
                {staffList.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value="__none">Unassigned</option>
              </select>
            ) : null}
            {statusField ? (
              <select className="form-control mini-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All status</option>
                {statusField.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : null}
            <label className="mini-search"><i className="fa-solid fa-magnifying-glass" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></label>
            <span className="cnt">{filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="tbl-scroll desktop-module-table">
              <table className="mod-table">
                <thead>
                  <tr>
                    {tab.columns.map((k) => <th key={k}>{labelOf(tab, k)}</th>)}
                    {tab.tokenColumn ? <th>Token</th> : null}
                    {tab.usedIn ? <th>Used In</th> : null}
                    {(tab.computed || []).map((c) => <th key={c.label}>{c.label}</th>)}
                    <th className="ta-r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      {tab.columns.map((k) => (
                        isPillKey(k)
                          ? <td key={k}>{row[k] ? <span className={`pill ${statusClass(row[k])}`}><span className="dot">●</span>{row[k]}</span> : "—"}</td>
                          : <td key={k}><Cell k={k} v={row[k]} /></td>
                      ))}
                      {tab.tokenColumn ? (() => { const t = tokenState(row); return <td key="tok"><span className={`pill ${t.cls}`}><span className="dot">●</span>{t.label}</span></td>; })() : null}
                      {tab.usedIn ? (() => {
                        const used = readRows(tab.usedIn.dataset).filter((c) => String(c[tab.usedIn.match] || "") === String(row[tab.usedIn.by] || ""));
                        return <td key="used">{used.length ? <span className="pill pill-default">{used.length} campaign{used.length === 1 ? "" : "s"}</span> : <span className="mut">Not used</span>}</td>;
                      })() : null}
                      {(tab.computed || []).map((c) => <td key={c.label}><b>{rowComputed(c, row)}</b></td>)}
                      <td>
                        <div className="row-actions">
                          {tab.preview ? <button className="icon-btn" type="button" title="Preview as ad" onClick={() => setPreview(row)}><i className="fa-solid fa-eye" /></button> : null}
                          {tab.call && digits(row[tab.call.phoneField]) ? (
                            <>
                              <a className="icon-btn" title="Call" href={`tel:+91${digits(row[tab.call.phoneField])}`}><i className="fa-solid fa-phone" /></a>
                              <a className="icon-btn" title="WhatsApp" target="_blank" rel="noopener noreferrer" href={`https://wa.me/91${digits(row[tab.call.phoneField])}`}><i className="fa-brands fa-whatsapp" /></a>
                              {tab.markRecovered && String(row.status || "") !== "Recovered" ? (
                                <button className="icon-btn win" type="button" title="Mark recovered"
                                  onClick={() => setRecoverRow(row)}><i className="fa-solid fa-trophy" /></button>
                              ) : null}
                            </>
                          ) : null}
                          {statusField ? <button className="icon-btn" type="button" title="Next status" onClick={() => toggleStatus(row)}><i className="fa-solid fa-rotate" /></button> : null}
                          <button className="icon-btn" type="button" title="Edit" onClick={() => setModal({ editingId: row.id, initial: { ...blankForm(tab.fields), ...row } })}><i className="fa-solid fa-pen" /></button>
                          <button className="icon-btn danger" type="button" title="Delete" onClick={() => removeRow(row)}><i className="fa-solid fa-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mod-cards mobile-module-cards">
              {pageRows.map((row) => (
                <div className="mod-card" key={row.id}>
                  <div className="mod-card-top">
                    <div>
                      <div className="mod-card-name">{titleOf(row)}</div>
                      <div className="mod-card-code">{row.platform || row.type || row.channel || row.service || row.kind || tab.label}</div>
                    </div>
                    {row.status ? <span className={`pill ${statusClass(row.status)}`}>{row.status}</span> : null}
                  </div>
                  <div className="mod-card-rows">
                    {tab.columns.slice(0, 5).map((k) => <div className="mc-row" key={k}><span className="lbl">{labelOf(tab, k)}</span><span className="val">{pretty(row[k], k)}</span></div>)}
                    {(tab.computed || []).map((c) => <div className="mc-row" key={c.label}><span className="lbl">{c.label}</span><span className="val">{rowComputed(c, row)}</span></div>)}
                  </div>
                  <div className="mod-card-actions">
                    {tab.preview ? <button className="mc-act edit" onClick={() => setPreview(row)}><i className="fa-solid fa-eye" /> Preview</button> : null}
                    <button className="mc-act edit" onClick={() => setModal({ editingId: row.id, initial: { ...blankForm(tab.fields), ...row } })}><i className="fa-solid fa-pen" /> Edit</button>
                    <button className="mc-act del" onClick={() => removeRow(row)}><i className="fa-solid fa-trash" /> Delete</button>
                  </div>
                </div>
              ))}
            </div>

            <Pager page={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onPage={setPage} />
          </>
        ) : <Empty icon={tab.icon} text={`No ${tab.label.toLowerCase()} yet. Use "Add ${tab.singular}" to create the first record.`} />}
      </div> : null}

      {modal ? (
        <FormModal
          tab={tab} rows={rows} editingId={modal.editingId} initial={modal.initial}
          icon={tab.icon}
          title={modal.editingId ? `Edit ${tab.singular}` : `Add ${tab.singular}`}
          onSave={save} onClose={() => setModal(null)}
        />
      ) : null}

      {preview ? <AdPreview row={preview} kind={tab.preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

/* ============================================================
   BROADCAST TAB — WhatsApp bhejta hai + purane broadcasts ki list
   ============================================================ */
function BroadcastTab({ moduleKey, tab, show }) {
  const ds = datasetKey(moduleKey, tab.key);
  const [rows, setRows] = useState([]);
  const [composing, setComposing] = useState(false);
  const pgB = usePaged(rows);

  useEffect(() => {
    const load = () => setRows(readRows(ds));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [ds]);

  if (composing) {
    return (
      <>
        <div className="pg-head" style={{ marginTop: 0 }}>
          <div className="pg-head-left">
            <button className="back-btn" type="button" onClick={() => setComposing(false)} aria-label="Back">
              <i className="fa-solid fa-arrow-left" />
            </button>
            <div><h2 className="pg-title cc-title">New broadcast</h2>
              <div className="pg-desc">Audience → template → preview → send</div></div>
          </div>
        </div>
        <BroadcastSender onClose={() => setComposing(false)} />
      </>
    );
  }

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
        <button className="btn btn-gold" type="button" onClick={() => setComposing(true)}>
          <i className="fa-brands fa-whatsapp" /> New Broadcast
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ttl">
            <i className="fa-solid fa-tower-cell" />
            <div className="ttl-txt"><b>Past broadcasts</b><span>Delivery report updates live via webhook</span></div>
          </div>
          <div className="card-tools"><span className="cnt">{rows.length} broadcast{rows.length === 1 ? "" : "s"}</span></div>
        </div>
        {rows.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Broadcast</th><th>Audience</th><th className="ta-r">Sent</th><th className="ta-r">Delivered</th><th className="ta-r">Read</th><th className="ta-r">Replied</th><th className="ta-r">Failed</th><th>Status</th></tr></thead>
              <tbody>{pgB.rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="ad-name">{r.name}</div><div className="ad-sub"><span className="ad-lvl">{r.template || "—"}</span>{r.scheduledAt ? <span>{pretty(r.scheduledAt, "scheduledAt")}</span> : null}</div></td>
                  <td>{r.audience || "—"}</td>
                  <td className="ta-r"><b>{count(r.sent)}</b></td>
                  <td className="ta-r">{count(r.delivered)}</td>
                  <td className="ta-r">{count(r.read)}</td>
                  <td className="ta-r"><b>{count(r.replies)}</b></td>
                  <td className="ta-r">{Number(r.failed || 0) ? <span style={{ color: "var(--red)" }}>{count(r.failed)}</span> : "—"}</td>
                  <td><span className={`pill ${statusClass(r.status)}`}><span className="dot">●</span>{r.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty icon="fa-tower-cell" text="No broadcast sent yet. Start with 'New Broadcast'." />}
        {pgB.pager}
      </div>
    </>
  );
}

/* ============================================================
   REPLIES TAB
   ============================================================ */
function RepliesTab({ tab }) {
  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>
      <ReplyInbox />
    </>
  );
}

/* ============================================================
   WIZARD TAB — Meta par actual campaign banata hai
   ============================================================ */
function WizardTab({ tab, onDone }) {
  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>
      <CreateAdWizard onPublished={onDone} />
    </>
  );
}

/* ============================================================
   BUILDER TAB
   ============================================================ */
function BuilderTab({ moduleKey, tab, onDone, show }) {
  const targetDs = datasetKey(moduleKey, tab.target);
  const [nonce, setNonce] = useState(0);

  function publish(form) {
    const now = new Date().toISOString();
    const rows = readRows(targetDs);
    writeRows(targetDs, [{ id: uid(), ...(tab.preset || {}), ...form, createdAt: now, updatedAt: now }, ...rows]);
    logActivity({ dataset: targetDs, action: "Created", target: form.name, detail: `Published from Create Ad · ${form.status || "Draft"} · ${form.channel || ""}` });
    show(`${form.name} published to Live Ads.`, "success");
    setNonce((n) => n + 1);
    onDone();
  }

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>
      <div className="card">
        <div className="card-head"><div className="ttl"><i className={`fa-solid ${tab.icon}`} /> &nbsp;New {tab.singular}</div></div>
        <FormInline key={nonce} tab={tab} onSubmit={publish} submitLabel="Publish" submitIcon="fa-paper-plane" />
      </div>
    </>
  );
}

/* Builder ka form modal me nahi, seedha card me. */
function FormInline({ tab, onSubmit, submitLabel, submitIcon }) {
  const [form, setForm] = useState(() => blankForm(tab.fields));
  const [errors, setErrors] = useState({});
  const visible = tab.fields.filter((f) => !(f.hideWhen && f.hideWhen(form)));

  function submit(e) {
    e.preventDefault();
    const errs = validateForm(visible, form, [], null);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form);
    setForm(blankForm(tab.fields));
  }

  function set(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="modal-body marketing-form-grid">
        {visible.map((f) => (
          <FieldInput key={f.key} field={f} value={form[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
        ))}
      </div>
      <div className="marketing-modal-footer">
        <button className="btn btn-ghost" type="button" onClick={() => { setForm(blankForm(tab.fields)); setErrors({}); }}>Reset</button>
        <button className="btn btn-gold" type="submit"><i className={`fa-solid ${submitIcon}`} /> {submitLabel}</button>
      </div>
    </form>
  );
}

/* ============================================================
   LOG TAB
   ============================================================ */
function LogTab({ tab }) {
  const PER_PAGE = 10;
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const load = () => setRows(readActivity(tab.watch));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [tab]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className={`fa-solid ${tab.icon}`} /> &nbsp;Change Log</div>
          <div className="card-tools"><span className="cnt">{rows.length} entries</span></div>
        </div>
        {rows.length ? (
          <>
            <div className="tbl-scroll">
              <table className="mod-table log-table">
                <thead><tr><th>When</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
                <tbody>{pageRows.map((r) => {
                  const d = new Date(r.at);
                  /* "a · b · c" → alag chips, padhne me aasaan */
                  const parts = String(r.detail || "").split(" · ").filter(Boolean);
                  return (
                    <tr key={r.id}>
                      <td className="lt-when">
                        <b>{d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b>
                        <span>{d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                      </td>
                      <td><span className={`lt-act ${String(r.action || "").toLowerCase()}`}><i />{r.action}</span></td>
                      <td><b className="lt-rec">{r.target || "—"}</b></td>
                      <td>
                        <div className="lt-detail">
                          {parts.length ? parts.map((p, i) => <span key={i} className={i === 0 && /→/.test(p) ? "lt-range" : "lt-chip"}>{p}</span>) : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={rows.length} perPage={PER_PAGE} onPage={setPage} />
          </>
        ) : <Empty icon={tab.icon} text="No changes recorded yet. An entry appears here as soon as budget, status or audience changes." />}
      </div>
    </>
  );
}

/* ============================================================
   PAGER — saare tables ka. 10 se zyada rows → page numbers.
   Andar ka scroll-box nahi; page hi scroll hota hai.
   ============================================================ */
function Pager({ page, totalPages, total, perPage, onPage }) {
  if (totalPages <= 1) return null;
  /* 1 … 4 5 6 … 12 */
  const nums = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const go = (n) => { onPage(n); try { document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* */ } };
  return (
    <nav className="pgr" aria-label="Pages">
      <span className="pgr-info">Showing <b>{(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}</b> of <b>{total}</b></span>
      <div className="pgr-btns">
        <button type="button" className="pgr-btn" disabled={page === 1} onClick={() => go(page - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left" /><span>Prev</span></button>
        {nums.map((n, i) => n === "…"
          ? <span key={`d${i}`} className="pgr-dots">…</span>
          : <button type="button" key={n} className={`pgr-num${n === page ? " on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => go(n)}>{n}</button>)}
        <button type="button" className="pgr-btn" disabled={page === totalPages} onClick={() => go(page + 1)} aria-label="Next page"><span>Next</span><i className="fa-solid fa-chevron-right" /></button>
      </div>
    </nav>
  );
}

/* ============================================================
   PERF TAB
   ============================================================ */
function PerfTab({ tab }) {
  const [data, setData] = useState({});
  useEffect(() => {
    const load = () => { const n = {}; tab.blocks.forEach((b) => { n[b.source] = readRows(b.source); }); setData(n); };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, [tab]);

  function cell(col, row) {
    const v = row[col.key];
    if (col.kind === "pill") return v ? <span className={`pill ${statusClass(v)}`}>{v}</span> : "—";
    if (col.kind === "money") return money(v);
    if (col.kind === "pct") return v ? `${num(v).toFixed(1)}%` : "—";
    if (col.kind === "num") return count(v);
    return v || "—";
  }

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>
      {tab.blocks.map((block) => {
        const rows = [...(data[block.source] || [])].sort((a, b) => num(b[block.sortField]) - num(a[block.sortField]));
        return (
          <div className="card" key={block.source}>
            <div className="card-head">
              <div className="ttl"><i className={`fa-solid ${block.icon}`} /> &nbsp;{block.title}</div>
              <div className="card-tools"><span className="cnt">{rows.length} record{rows.length === 1 ? "" : "s"}</span></div>
            </div>
            {rows.length ? (
              <div className="tbl-scroll">
                <table className="mod-table">
                  <thead><tr><th>#</th><th>Name</th>{block.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                  <tbody>{rows.map((row, i) => (
                    <tr key={row.id}>
                      <td><b>{i + 1}</b></td>
                      <td><b>{row[block.nameField] || "—"}</b></td>
                      {block.columns.map((c) => <td key={c.key}>{cell(c, row)}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <Empty icon={block.icon} text="Ranking will appear here once records are added." />}
          </div>
        );
      })}
    </>
  );
}


/* ============================================================
   LIVE COUNTS

   Buckets tab me "Leads in Bucket" aur "Recovered" pehle manual
   number field the — koi unhe bharta hi nahi tha, isliye hamesha
   khaali dikhte the.

   Ab Lost Pool se seedha gine jaate hain. Manual rakhne ka matlab
   hota ki har sync ke baad haath se update karna padta, aur wo
   kabhi sach nahi rehta.
   ============================================================ */
function withLiveCounts(tab, rows) {
  if (!tab.liveCount) return rows;

  const pool = readRows(tab.liveCount.from);

  return rows.map((r) => {
    const key = String(r[tab.liveCount.matchOn] || "").trim().toLowerCase();
    if (!key) return r;

    const mine = pool.filter((p) => String(p[tab.liveCount.poolField] || "").trim().toLowerCase() === key);
    const recovered = mine.filter((p) => String(p.status || "") === "Recovered").length;

    return { ...r, leadCount: String(mine.length), recovered: String(recovered) };
  });
}

/* Table cell — kuch columns ko thoda pehchaan wala roop:
   platform → rang ka dot, date → chhota date chip. Baaki pretty(). */
const CH_COLOR = { Facebook: "#1877F2", Instagram: "#D62976", YouTube: "#FF0000", Website: "#0F766E", Meta: "#1877F2", Google: "#EA4335" };
const DATE_COLS = ["date", "receivedAt", "lostAt", "runAt", "invoiceDate", "dueDate", "lastContact"];
function Cell({ k, v }) {
  if ((k === "channel" || k === "platform" || k === "source") && CH_COLOR[v]) {
    return <span className="tc-ch" style={{ "--c": CH_COLOR[v] }}><i />{v}</span>;
  }
  if (DATE_COLS.includes(k) && v) return <span className="tc-date">{pretty(v, k)}</span>;
  return pretty(v, k);
}

/* Lead Capture → "Pull leads from Meta" — har lead ad se, saare pages */
function LeadPullButton({ show }) {
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState("");
  useEffect(() => { setAt(lastLeadPull()); }, []);
  async function run() {
    setBusy(true);
    try {
      const r = await pullMetaLeads({});
      if (!r.ok) show(r.error, "error");
      else if (r.added) show(`${r.added} new leads — Facebook ${r.fb}, Instagram ${r.ig}.`, "success");
      else show(`No new leads. ${r.adsChecked} lead ads checked${r.errors.length ? `, ${r.errors.length} could not be read` : ""}.`, r.errors.length ? "error" : "success");
      setAt(lastLeadPull());
    } finally { setBusy(false); }
  }
  const ago = at ? Math.round((Date.now() - Date.parse(at)) / 60000) : null;
  return (
    <button className="btn btn-ghost" type="button" disabled={busy} onClick={run}
      title={at ? `Last pulled ${ago < 1 ? "just now" : `${ago} min ago`} — also runs automatically every 15 minutes` : "Runs automatically every 15 minutes while the panel is open"}>
      <i className={`fa-${busy ? "solid fa-spinner fa-spin" : "brands fa-meta"}`} /> {busy ? "Pulling leads..." : "Pull leads from Meta"}
    </button>
  );
}

/* Connect Meta Account — wahi jagah popup me (page upar scroll nahi hota) */
function ConnectPopup({ onClose, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="cp-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cp-modal" role="dialog" aria-modal="true" aria-label="Connect Meta account">{children}</div>
    </div>
  );
}