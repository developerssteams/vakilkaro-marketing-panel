"use client";

/* ============================================================
   components/AccountsBoard.js — Ad Accounts ka card view

   Table ki jagah har account ek "pass" — ek nazar me pata chale:
   kaunsa account, kis business ka, Meta pe theek hai ya nahi, kitna
   kharch hua, token kab tak chalega, aakhri sync kab hua.

   Edit / Delete / Connect wahi purane handlers (MarketingModuleClient
   se aate hain) — sirf dikhne ka tareeka badla hai.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { dedupeAccounts } from "../lib/sync-merge";
import { money, count } from "./ModuleParts";
import { tokenState } from "../lib/marketing-validate";

const PLATFORM = {
  Meta: { color: "#1877F2", icon: "fa-brands fa-meta", label: "Meta" },
  Google: { color: "#EA4335", icon: "fa-brands fa-google", label: "Google Ads" },
};
const pf = (p) => PLATFORM[p] || { color: "#6B6F7B", icon: "fa-solid fa-rectangle-ad", label: p || "Other" };

function ago(iso) {
  if (!iso) return "Never";
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (!t) return iso;
  const d = Math.round((Date.now() - t) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

export default function AccountsBoard({ rows, onEdit, onDelete, onConnect, onAdd }) {
  /* Same account do-teen baar dikhe to ek kar do (lib/sync-merge) */
  useEffect(() => { dedupeAccounts(); }, [rows.length]);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState("");

  const stats = useMemo(() => {
    const live = rows.filter((r) => tokenState(r).label === "Live").length;
    const attention = rows.filter((r) => r.problem || ["Expired", "Expiring"].includes(tokenState(r).label) || (r.metaStatus && r.metaStatus !== "Active")).length;
    const spent = rows.reduce((t, r) => t + (Number(r.amountSpent) || 0), 0);
    const lastSync = rows.map((r) => r.lastSyncAt || r.lastSync).filter(Boolean).sort().pop();
    return { live, attention, spent, lastSync };
  }, [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.name, r.accountId, r.bmName, r.platform].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [rows, q]);

  function copy(id) {
    try { navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(""), 1400); } catch { /* */ }
  }

  return (
    <div className="ab-wrap">
      {/* ---- summary ---- */}
      <section className="ab-sum">
        <div className="ab-sum-main">
          <span className="ab-kicker">Connected accounts</span>
          <b className="ab-big">{count(rows.length)}</b>
          <span className="ab-sub">{stats.lastSync ? `Last synced ${ago(stats.lastSync).toLowerCase()}` : "Not synced yet"}</span>
        </div>
        <div className="ab-sum-facts">
          <div><span>Live tokens</span><b>{count(stats.live)}</b></div>
          <div><span>Lifetime spend</span><b>{money(stats.spent)}</b></div>
          <div className={stats.attention ? "warn" : ""}><span>Need attention</span><b>{count(stats.attention)}</b></div>
        </div>
        <div className="ab-sum-cta">
          <button type="button" className="btn btn-gold" onClick={onConnect}><i className="fa-brands fa-meta" /> Connect Meta Account</button>
          <button type="button" className="btn btn-ghost" onClick={onAdd}><i className="fa-solid fa-plus" /> Add manually</button>
        </div>
      </section>

      {rows.length ? (
        <div className="ab-tools">
          <label className="ab-search"><i className="fa-solid fa-magnifying-glass" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or business" aria-label="Search accounts" />
          </label>
          <span className="ab-count">{shown.length} of {rows.length}</span>
        </div>
      ) : null}

      {!rows.length ? (
        <div className="ab-empty">
          <div className="ab-empty-ic"><i className="fa-brands fa-meta" /></div>
          <b>No ad account connected yet</b>
          <p>Connect your Meta account and every campaign, spend and lead will start flowing into the panel automatically.</p>
          <div className="ab-empty-steps">
            <span><em>1</em>Add the token to .env.local</span>
            <span><em>2</em>Click Connect Meta Account</span>
            <span><em>3</em>Tick accounts and connect</span>
          </div>
          <button type="button" className="btn btn-gold" onClick={onConnect}><i className="fa-brands fa-meta" /> Connect Meta Account</button>
        </div>
      ) : (
        <div className="ab-grid">
          {shown.map((r) => {
            const p = pf(r.platform);
            const tok = tokenState(r);
            const metaOk = !r.metaStatus || r.metaStatus === "Active";
            const bad = r.problem || !metaOk || tok.label === "Expired";
            return (
              <article className={`ab-card${bad ? " bad" : ""}`} key={r.id} style={{ "--pc": p.color }}>
                <header className="ab-card-h">
                  <span className="ab-logo"><i className={p.icon} /></span>
                  <div className="ab-id">
                    <b title={r.name}>{r.name || "Untitled account"}</b>
                    <span>{p.label}{r.bmName ? ` · ${r.bmName}` : ""}</span>
                  </div>
                  {r.isDefault === "Yes" ? <span className="ab-default" title="Default account"><i className="fa-solid fa-star" /> Default</span> : null}
                </header>

                <button type="button" className="ab-acc" onClick={() => copy(r.accountId)} title="Copy account ID">
                  <code>{r.accountId || "—"}</code>
                  <span>{copied === r.accountId ? <><i className="fa-solid fa-check" /> Copied</> : <><i className="fa-regular fa-copy" /> Copy</>}</span>
                </button>

                {r.problem ? <div className="ab-alert"><i className="fa-solid fa-triangle-exclamation" /> {r.problem}</div> : null}

                <dl className="ab-facts">
                  <div><dt>Lifetime spend</dt><dd>{Number(r.amountSpent) > 0 ? money(r.amountSpent) : "—"}</dd></div>
                  <div><dt>Currency</dt><dd>{r.currency || "—"}</dd></div>
                  <div><dt>Last sync</dt><dd>{ago(r.lastSyncAt || r.lastSync)}</dd></div>
                </dl>

                <div className="ab-health">
                  <span className={`ab-h ${!r.metaStatus ? "off" : metaOk ? "ok" : "no"}`}><i />Meta: {r.metaStatus || "Not checked"}</span>
                  <span className={`ab-h ${tok.label === "Live" ? "ok" : tok.label === "Expiring" ? "mid" : tok.label === "Not Connected" ? "off" : "no"}`}><i />Token: {tok.label}{tok.days != null && tok.label !== "Live" ? ` (${tok.days}d)` : ""}</span>
                  <span className={`ab-h ${r.status === "Active" ? "ok" : "off"}`}><i />{r.status || "Active"}</span>
                </div>

                <footer className="ab-card-f">
                  <button type="button" className="ab-btn" onClick={() => onEdit(r)}><i className="fa-solid fa-pen" /> Edit</button>
                  <button type="button" className="ab-btn danger" onClick={() => onDelete(r)}><i className="fa-solid fa-trash" /> Remove</button>
                </footer>
              </article>
            );
          })}
          <button type="button" className="ab-add" onClick={onConnect}>
            <i className="fa-solid fa-plus" />
            <b>Connect another account</b>
            <span>Opens right here — tick the account and it joins automatically</span>
          </button>
        </div>
      )}
    </div>
  );
}
