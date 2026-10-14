"use client";

/* ============================================================
   components/PaymentHistory.js — Ad Wallet → Balance & Payments

   Har paisa jo ad accounts me gaya (recharge = "Credit"), refund,
   aur ledger me likha kharch — ek jagah, filter ke saath.
   Data Ledger se hi aata hai; koi alag entry nahi karni.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows } from "../lib/marketing-local";
import { num, money, money2 } from "./ModuleParts";
import { syncMetaPayments, lastPaymentSync, lastPaymentErrors, prepaidBalances, paymentsNeedFullSync } from "../lib/meta-pull";

const LEDGER = "ad-wallet__ledger";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PER_PAGE = 10;

const PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "this-year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];
const TYPES = [
  { key: "all", label: "All transactions" },
  { key: "payments", label: "Funded only" },
  { key: "Spend", label: "Paid (ad charges)" },
  { key: "Refund", label: "Refund" },
  { key: "Adjustment", label: "Adjustment" },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(period, from, to) {
  const n = new Date();
  if (period === "this-month") return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)];
  if (period === "last-month") return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))];
  if (period === "3m") return [iso(new Date(n.getFullYear(), n.getMonth() - 2, 1)), iso(n)];
  if (period === "this-year") return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)];
  if (period === "custom") return [from || "", to || ""];
  return ["", ""];
}
function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}
const isPayment = (t) => t === "Credit";
const METHOD_ICON = { "Prepaid balance": "fa-wallet", "Manual payment": "fa-hand-holding-dollar", UPI: "fa-mobile-screen-button", "UPI autopay": "fa-mobile-screen-button", "Net banking": "fa-building-columns", "Bank transfer": "fa-building-columns", Card: "fa-credit-card", Wallet: "fa-wallet", "Automatic payment": "fa-rotate" };
/* Meta ka apna shabd — "Money added to balance", "Account billed" */
function eventText(l) {
  const n = String(l.note || "").replace(/^Meta billing ?·? ?/, "").trim();
  if (!n) return "";
  const map = { "funding event successful": "Money added to balance", "ad account billing charge": "Charged for ads", "ad account billing decline": "Payment declined", "ad account billing refund": "Refund" };
  return map[n.toLowerCase()] || n.replace(/^\w/, (c) => c.toUpperCase());
}
const STATUS_ICON = { Funded: "fa-arrow-down", Paid: "fa-check", Failed: "fa-xmark", Refunded: "fa-rotate-left", Pending: "fa-clock" };
/* Meta jaisa status — Funded / Paid / Failed / Pending / Refunded */
function statusOf(l) {
  if (l.metaStatus) return l.metaStatus;
  if (l.status === "Cancelled") return "Failed";
  if (l.status === "Pending") return "Pending";
  if (l.type === "Refund") return "Refunded";
  return l.type === "Credit" ? "Funded" : "Paid";
}
const actId = (l) => String(l.accountId || (String(l.extId || "").match(/^meta-(act_\d+)-/) || [])[1] || "").replace(/^act_/, "");
const metaLink = (id) => (id ? `https://adsmanager.facebook.com/adsmanager/billing_hub/payment_activity/?asset_id=${id}` : "https://adsmanager.facebook.com/adsmanager/billing_hub/payment_activity/");
/* Payment ka waqt — IST, jaise "2:45 pm" */
function fmtTime(t) {
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

export default function PaymentHistory() {
  const [ledger, setLedger] = useState([]);
  const [f, setF] = useState({ period: "3m", from: "", to: "", account: "", type: "all", mode: "", status: "", q: "" });
  const [prepaid, setPrepaid] = useState({});
  const [page, setPage] = useState(1);
  const [sync, setSync] = useState({ busy: false, at: "", result: null });
  /* Khulte hi: aakhri sync 1 ghante se purana ho to apne aap — button
     dabane ki zaroorat nahi. Background me har 6 ghante bhi chalta hai. */
  useEffect(() => {
    const at = lastPaymentSync();
    setSync((x) => ({ ...x, at, result: lastPaymentErrors().length ? { ok: true, added: 0, updated: 0, errors: lastPaymentErrors(), stored: true } : null }));
    /* Purani Meta entries me payment ka time nahi tha — ek baar dobara laao */
    const old = readRows(LEDGER).some((l) => l.source === "Meta Billing" && (!l.time || ["Meta billing", "Auto-debit", ""].includes(String(l.method || ""))));
    if (!at || old || paymentsNeedFullSync() || Date.now() - Date.parse(at) > 3600000) pullFromMeta(true);
  }, []);

  async function pullFromMeta(auto = false) {
    setSync((x) => ({ ...x, busy: true, auto }));
    const r = await syncMetaPayments({ quiet: auto }).catch((e) => ({ ok: false, error: e?.message }));
    /* auto sync me sirf tab dikhao jab kuch aaya ya error hua */
    const show = !auto || !r.ok || r.added || r.errors?.length;
    setSync({ busy: false, auto: false, at: lastPaymentSync(), result: show ? r : null });
  }

  useEffect(() => {
    const load = () => { setLedger(readRows(LEDGER)); setPrepaid(prepaidBalances()); };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  const accounts = useMemo(() => [...new Set(ledger.map((l) => l.account).filter(Boolean))].sort(), [ledger]);
  const modes = useMemo(() => [...new Set(ledger.map((l) => l.payMode).filter(Boolean))].sort(), [ledger]);
  const [a, b] = range(f.period, f.from, f.to);

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return ledger.filter((l) => {
      const d = String(l.date || "").slice(0, 10);
      if (a && d < a) return false;
      if (b && d > b) return false;
      if (f.account && l.account !== f.account) return false;
      if (f.type === "payments" && !isPayment(l.type)) return false;
      if (!["payments", "all"].includes(f.type) && l.type !== f.type) return false;
      if (f.mode && l.payMode !== f.mode) return false;
      if (f.status && statusOf(l) !== f.status) return false;
      if (q && ![l.amount, l.method, l.payMode, statusOf(l), l.note, l.account].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    }).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")) || String(y.time || "").localeCompare(String(x.time || "")) || String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
  }, [ledger, f, a, b]);

  useEffect(() => { setPage(1); }, [f]);

  /* Totals — sirf Posted gine jaate hain (Pending/Cancelled paisa abhi gaya nahi) */
  /* Refund "Payments only" filter me bhi dikhe — isliye refund period +
     account se ginte hain, type / mode filter se nahi */
  const refundTotal = useMemo(() => ledger.filter((l) => {
    const d = String(l.date || "").slice(0, 10);
    return l.type === "Refund" && (l.status || "Posted") === "Posted" && (!a || d >= a) && (!b || d <= b) && (!f.account || l.account === f.account);
  }).reduce((x, l) => x + num(l.amount), 0), [ledger, a, b, f.account]);

  const sum = useMemo(() => {
    const posted = rows.filter((l) => (l.status || "Posted") === "Posted");
    const by = (t) => posted.filter((l) => l.type === t).reduce((x, l) => x + num(l.amount), 0);
    const pays = posted.filter((l) => isPayment(l.type));
    return {
      paid: by("Credit"), refund: refundTotal, spend: by("Spend"),
      count: pays.length, avg: pays.length ? by("Credit") / pays.length : 0,
      last: pays.map((l) => l.date).filter(Boolean).sort().pop(),
      pending: rows.filter((l) => l.status === "Pending").length,
    };
  }, [rows, refundTotal]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const set = (p) => setF((o) => ({ ...o, ...p }));
  const active = (f.account ? 1 : 0) + (f.mode ? 1 : 0) + (f.status ? 1 : 0) + (f.q ? 1 : 0) + (f.type !== "all" ? 1 : 0) + (f.period !== "3m" ? 1 : 0);
  /* Upar wala "Prepaid balance" — chuna hua account, ya sabka jod */
  const pre = useMemo(() => {
    const byName = {}; ledger.forEach((l) => { const id = actId(l); if (id && l.account) byName[l.account] = id; });
    const ids = f.account ? [byName[f.account]].filter(Boolean) : Object.keys(prepaid).map((k) => k.replace(/^act_/, ""));
    const vals = ids.map((id) => prepaid[`act_${id}`]?.prepaid).filter((v) => typeof v === "number");
    return { show: vals.length > 0, total: vals.reduce((t, v) => t + v, 0), id: ids.length === 1 ? ids[0] : "" };
  }, [prepaid, ledger, f.account]);

  function exportCsv() {
    const head = ["Date", "Time", "Account", "Amount", "Payment method", "Payment status"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head, ...rows.map((l) => [l.date, fmtTime(l.time), l.account, l.amount, l.method || l.payMode, statusOf(l)])]
      .map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const el = document.createElement("a"); el.href = url; el.download = `payments-${a || "all"}-to-${b || "today"}.csv`; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="ph">
      <div className="ph-head">
        <div>
          <h2>Payment history</h2>
          <p>Same as Meta → Billing &amp; payments → Payment activity. Funded = money added to the prepaid balance · Paid = ad charges taken from it.</p>
        </div>
        <div className="ph-actions">
          <button type="button" className="btn btn-gold" onClick={() => pullFromMeta(false)} disabled={sync.busy}>
            <i className={`fa-solid ${sync.busy ? "fa-spinner fa-spin" : "fa-rotate"}`} /> {sync.busy ? (sync.auto ? "Updating from Meta..." : "Syncing...") : "Sync now"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><i className="fa-solid fa-download" /> Export CSV</button>
        </div>
      </div>

      <div className="ph-syncline">
        <i className="fa-brands fa-meta" />
        {sync.at ? <>Meta payments last synced {new Date(sync.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Updates automatically — every 6 hours, and whenever you open this page after an hour.</>
          : <>Loading Meta payments automatically...</>}
      </div>
      {sync.result ? (
        sync.result.ok ? (
          <div className={`ph-result${sync.result.errors?.length ? " warn" : ""}`}>
            {sync.result.stored ? <b>Last sync had problems:</b> : <b>{sync.result.added} new, {sync.result.updated} updated payments from Meta.</b>}
            {sync.result.errors?.map((e) => <div key={e.account}>{e.account}: {e.message}</div>)}
          </div>
        ) : <div className="ph-result warn"><b>{sync.result.error}</b></div>
      ) : null}


      {/* ---- Meta jaisa header: ad account + prepaid balance ---- */}
      <div className="pa-head">
        <div className="pa-acc">
          <span>Ad account</span>
          <b>{f.account || (accounts.length === 1 ? accounts[0] : "All ad accounts")}{pre.id ? <em> ({pre.id})</em> : null}</b>
        </div>
        {pre.show ? (
          <div className="pa-bal">
            <span>Prepaid balance</span>
            <b>{money2(pre.total)}</b>
          </div>
        ) : null}
        <a className="btn btn-primary pa-add" href={metaLink(pre.id)} target="_blank" rel="noreferrer"><i className="fa-solid fa-plus" /> Add funds</a>
      </div>

      {/* ---- filters ---- */}
      <div className="ph-filters">
        <div className="ph-periods" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className={f.period === p.key ? "on" : ""} onClick={() => set({ period: p.key })}>{p.label}</button>
          ))}
        </div>
        {f.period === "custom" ? (
          <div className="ph-dates">
            <input type="date" className="form-control" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
            <span>to</span>
            <input type="date" className="form-control" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
          </div>
        ) : null}
        <div className="ph-selects">
          <select className="form-control" value={f.account} onChange={(e) => set({ account: e.target.value })} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select className="form-control" value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select className="form-control" value={f.mode} onChange={(e) => set({ mode: e.target.value })} aria-label="Payment mode">
            <option value="">All payment modes</option>
            {modes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select className="form-control" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            <option value="Funded">Funded</option><option value="Paid">Paid</option><option value="Failed">Failed</option><option value="Refunded">Refunded</option>
          </select>
          <label className="ph-search"><i className="fa-solid fa-magnifying-glass" />
            <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search amount, method, status…" aria-label="Search" />
          </label>
          {active ? <button type="button" className="ph-clear" onClick={() => setF({ period: "3m", from: "", to: "", account: "", type: "all", mode: "", status: "", q: "" })}>Clear ({active})</button> : null}
        </div>
      </div>

      {/* ---- totals ---- */}
      <div className="ph-stats">
        <div className="hero"><span>Total funded</span><b>{money(sum.paid)}</b><em>{sum.count} time{sum.count === 1 ? "" : "s"} added{a ? ` · ${fmtDate(a)} to ${fmtDate(b)}` : ""}</em></div>
        <div><span>Average payment</span><b>{sum.count ? money(sum.avg) : "—"}</b></div>
        <div><span>Last payment</span><b>{fmtDate(sum.last)}</b></div>
        <div><span>Refunds</span><b>{money(sum.refund)}</b></div>
        <div><span>Paid for ads</span><b>{money(sum.spend)}</b></div>
      </div>

      {/* ---- table ---- */}
      {rows.length ? (
        <div className="ph-table-wrap">
          <div className="tbl-scroll">
            <table className="mod-table ph-table">
              <thead><tr><th>Date</th><th className="ta-r">Amount</th><th>Payment method</th><th>Payment status</th><th className="ta-c">Action</th></tr></thead>
              <tbody>
                {pageRows.map((l) => {
                  const st = statusOf(l);
                  const id = actId(l);
                  const method = l.method || l.payMode || "—";
                  return (
                    <tr key={l.id}>
                      <td><span className="pa-date">{fmtDate(l.date)}</span>{fmtTime(l.time) ? <span className="ph-time">{fmtTime(l.time)}</span> : null}{!f.account && accounts.length > 1 && l.account ? <small className="pa-accsm">{l.account}</small> : null}</td>
                      <td className="ta-r pa-amt">{money2(l.amount)}</td>
                      <td><span className="pa-method"><i className={`fa-solid ${METHOD_ICON[method] || "fa-credit-card"}`} /> <span>{method}{eventText(l) ? <small>{eventText(l)}</small> : null}</span></span></td>
                      <td><span className={`pa-st s-${st.toLowerCase()}`}><i className={`fa-solid ${STATUS_ICON[st] || "fa-circle"}`} /> {st}</span></td>
                      <td className="ta-c">
                        <a className="pa-dl" href={metaLink(id)} target="_blank" rel="noreferrer" title="Receipt / invoice on Meta Billing" aria-label="Open in Meta Billing"><i className="fa-solid fa-download" /></a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <nav className="pgr" aria-label="Pages">
              <span className="pgr-info">Showing <b>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, rows.length)}</b> of <b>{rows.length}</b></span>
              <div className="pgr-btns">
                <button type="button" className="pgr-btn" disabled={page === 1} onClick={() => setPage(page - 1)}><i className="fa-solid fa-chevron-left" /><span>Prev</span></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} style={{ display: "contents" }}>
                      {i > 0 && n - arr[i - 1] > 1 ? <span className="pgr-dots">…</span> : null}
                      <button type="button" className={`pgr-num${n === page ? " on" : ""}`} onClick={() => setPage(n)}>{n}</button>
                    </span>
                  ))}
                <button type="button" className="pgr-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}><span>Next</span><i className="fa-solid fa-chevron-right" /></button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : (
        <div className="ph-empty">
          <i className="fa-solid fa-receipt" />
          <b>{ledger.length ? "No entries match these filters" : "No payments recorded yet"}</b>
          <span>{ledger.length ? "Try a wider period or clear the filters." : "Use Recharge on an account above — every recharge is saved here automatically."}</span>
        </div>
      )}
    </section>
  );
}
