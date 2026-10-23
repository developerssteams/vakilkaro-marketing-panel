"use client";

/* ============================================================
   components/MetaConnect.js

   Ad Accounts → "Connect Meta Account"

   1. Token check — valid hai? kab expire hoga? permissions poori?
   2. Token jitne ad accounts dekh sakta hai, sab ki list
   3. Tick karo → "Connect" → account panel me judta hai
      aur usi waqt uske campaigns + daily data Campaigns me aa
      jaata hai.

   Token kabhi browser me nahi aata — sirf .env me rehta hai.
   Pehle form me "Access Token" field tha jo localStorage me
   save hota tha; wahan se koi bhi staff ya browser extension
   token padh sakta tha, aur us token se ad account ka paisa
   kharch ho sakta hai.
   ============================================================ */

import { useEffect, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { runMetaSync, isoAgo, ACCOUNTS } from "../lib/sync-merge";
import { useToast } from "./Toast";
import { count, money } from "./ModuleParts";
import { usePaged } from "./Pager";

const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 1 year", days: 365 },
];

export default function MetaConnect({ onClose, onDone }) {
  const { show } = useToast();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState({});
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const connected = new Set(readRows(ACCOUNTS)
    .filter((a) => a.platform === "Meta")
    .map((a) => String(a.accountId || "").trim()));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/meta/accounts");
      const j = await res.json();
      setState(j);
      /* Active aur abhi tak na jude accounts pehle se tick */
      const pre = {};
      (j.accounts || []).forEach((a) => { if (a.active && !connected.has(a.accountId)) pre[a.accountId] = true; });
      setPicked(pre);
    } catch {
      setState({ tokenError: "Could not reach the server" });
    } finally {
      setLoading(false);
    }
  }

  async function connectAndSync() {
    const list = (state.accounts || []).filter((a) => picked[a.accountId]);
    if (!list.length) { show("Select at least one account.", "error"); return; }

    setBusy("connect");
    setResult(null);
    try {
      /* Har account ka Page bhi le aate hain — Create Ad me chahiye */
      const pages = {};
      await Promise.all(list.map(async (a) => {
        try {
          const r = await fetch("/api/meta/accounts", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId: a.accountId }),
          });
          const j = await r.json();
          if (j.ok) pages[a.accountId] = { pageId: j.account.pageId, pageName: j.account.pageName };
        } catch { /* page optional hai */ }
      }));

      const rows = readRows(ACCOUNTS);
      const hasMetaDefault = rows.some((r) => r.platform === "Meta" && r.isDefault === "Yes");
      const now = new Date().toISOString();
      const tokenExpiry = state.token?.expiresAt || "";
      let next = [...rows];
      let firstDefault = !hasMetaDefault;

      list.forEach((a) => {
        const patch = {
          name: a.name, platform: "Meta", accountId: a.accountId,
          bmId: a.bmId, bmName: a.bmName, currency: a.currency, timezone: a.timezone,
          pageId: pages[a.accountId]?.pageId || "", pageName: pages[a.accountId]?.pageName || "",
          metaStatus: a.status, connectedVia: "System User",
          amountSpent: String(Math.round(a.amountSpent || 0)), balance: String(Math.round(a.balance || 0)),
          spendCap: String(Math.round(a.spendCap || 0)),
          tokenExpiry, status: a.active ? "Active" : "Paused",
          lastSync: now.slice(0, 10), updatedAt: now,
        };
        const i = next.findIndex((r) => r.platform === "Meta" && String(r.accountId).trim() === a.accountId);
        if (i >= 0) {
          /* Haath se bhari cheezein (monthly limit, owner, naam) nahi chhedte */
          const keep = next[i];
          next[i] = { ...keep, ...patch, name: keep.name || patch.name, pageId: keep.pageId || patch.pageId, pageName: keep.pageName || patch.pageName };
        } else {
          /* Pakki id — doosre computer se connect karne pe bhi ek hi row */
          next.unshift({ id: `acc-meta-${a.accountId}`, isDefault: firstDefault ? "Yes" : "No", monthlyLimit: "", owner: "", createdAt: now, ...patch });
          firstDefault = false;
        }
      });

      writeRows(ACCOUNTS, next);
      logActivity({ dataset: ACCOUNTS, action: "Created", target: "Meta Connect", detail: `${list.length} accounts connected: ${list.map((a) => a.name).join(", ")}` });

      setBusy("sync");
      const r = await runMetaSync({ accountIds: list.map((a) => a.accountId), since: isoAgo(days), until: isoAgo(0) });
      setResult({ accounts: list.length, ...r });
      if (r.ok && !r.errors.length) show(`${list.length} accounts connected — ${r.added} campaigns loaded.`, "success");
      else if (r.ok) show(`Accounts connected, but sync failed for ${r.errors.length}: ${r.errors[0].message}`, "error");
      else show(r.error, "error");
      if (onDone) onDone();
    } finally {
      setBusy("");
    }
  }

  /* ---------- render ---------- */

  const head = (title, sub) => (
    <div className="card-head">
      <div className="ttl">
        <i className="fa-brands fa-meta" />
        <div className="ttl-txt"><b>{title}</b><span>{sub}</span></div>
      </div>
      <div className="card-tools">
        {state && !state.needsSetup ? (
          <button className="btn btn-ghost" type="button" disabled={loading} onClick={load}>
            <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
          </button>
        ) : null}
        <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const pgAcc = usePaged(state?.accounts || []);

  if (loading && !state) {
    return <div className="card">{head("Connecting to Meta...", "Checking token")}<div className="settings-body"><i className="fa-solid fa-spinner fa-spin" /> Ek second...</div></div>;
  }

  if (state?.needsSetup) {
    return (
      <div className="card">
        {head("Meta token not found", "First add the token to .env.local")}
        <div className="settings-body">
          <div className="cs-missing"><span>Missing:</span><code>META_TOKEN</code></div>
          <p className="settings-copy">
            From the WhatsApp-AI app's <code>.env.local</code> copy the <code>META_TOKEN</code> and <code>META_AD_ACCOUNTS</code> lines into this panel's <code>.env.local</code> and restart the server. Also add <code>META_APP_ID=1752005389283386</code> and <code>META_APP_SECRET</code> so the panel can check the token expiry.
          </p>
        </div>
      </div>
    );
  }

  if (state?.tokenError) {
    return (
      <div className="card">
        {head("Token is not working", "Meta rejected the token")}
        <div className="settings-body">
          <div className="cs-err">
            <i className="fa-solid fa-triangle-exclamation" />
            <div>
              <b>{state.tokenError}</b>
              <div className="cs-hint">Create a new token: Business Settings → System Users → your system user → Generate New Token → Expiration <b>Never</b>.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const t = state?.token || {};
  const accounts = state?.accounts || [];
  const pickedCount = Object.values(picked).filter(Boolean).length;

  return (
    <>
      <div className="card">
        {head("Connect Meta Account", "Facebook + Instagram with one token")}
        <div className="settings-body">
          <div className="cs-stats">
            <div className="cs-stat"><span>Token</span><b className="cs-hl">{t.name || "—"}</b></div>
            <div className="cs-stat"><span>Expiry</span><b>{t.neverExpires ? "Never ✓" : t.expiresAt || "Unknown"}</b></div>
            <div className="cs-stat"><span>Accounts found</span><b>{count(accounts.length)}</b></div>
            <div className="cs-stat"><span>Connected in panel</span><b>{count(accounts.filter((a) => connected.has(a.accountId)).length)}</b></div>
          </div>

          {t.missing?.length ? (
            <div className="cs-err">
              <i className="fa-solid fa-key" />
              <div>
                <b>Token is missing these permissions: {t.missing.map((s) => <code key={s}>{s}</code>)}</b>
                <div className="cs-hint">Campaigns will not load without them. Tick these when creating a new token.</div>
              </div>
            </div>
          ) : null}

          {t.note ? (
            <div className="cs-warn" style={{ marginBottom: 14 }}>
              <i className="fa-solid fa-circle-info" />
              <span>{t.note}</span>
            </div>
          ) : null}

          {state.accountErrors?.length && accounts.length ? (
            <div className="cs-warn" style={{ marginBottom: 14 }}>
              <i className="fa-solid fa-circle-exclamation" />
              <span>Some accounts could not be opened: {state.accountErrors.map((e) => <span key={e.account}><code>{e.account}</code> {e.message} </span>)}</span>
            </div>
          ) : null}

          {t.missingNice?.length ? (
            <div className="cs-warn" style={{ marginBottom: 14 }}>
              <i className="fa-solid fa-circle-info" />
              <span>Token is missing these permissions: {t.missingNice.map((s) => <code key={s}>{s}</code>)} — data will still load.
                {t.missingNice.includes("ads_management") ? <> <b>ads_management</b> is needed to turn ads ON/OFF from the panel.</> : null}
                {t.missingNice.includes("leads_retrieval") ? <> <b>leads_retrieval</b> is needed for "Pull Leads" to work.</> : null}
                {t.missingNice.some((s) => s.startsWith("pages_")) ? <> Without Pages permission, the page will not show in Create Ad.</> : null}
              </span>
            </div>
          ) : null}

          {!t.neverExpires && t.expiresAt ? (
            <div className="cs-warn" style={{ marginBottom: 14 }}>
              <i className="fa-solid fa-clock" />
              <span>This token expires on <b>{t.expiresAt}</b> . Sync will stop then. When creating a System User token, set Expiration to <b>Never</b> — a normal user token expires in 60 days.</span>
            </div>
          ) : null}

          {state.accountsError ? (
            <div className="cs-err"><i className="fa-solid fa-triangle-exclamation" /><div><b>{state.accountsError}</b></div></div>
          ) : null}

          {!accounts.length && !state.accountsError ? (
            <div className="cs-warn">
              <i className="fa-solid fa-circle-exclamation" />
              <span>The token is valid but has no ad account assigned. Business Settings → System Users → your system user → <b>Add Assets</b> → Ad Accounts → select account → <b>Manage campaigns</b> permission do.</span>
            </div>
          ) : null}

          {accounts.length ? (
            <>
              <div className="form-label" style={{ marginTop: 4 }}>Which accounts to connect</div>
              <div className="tbl-scroll">
                <table className="mod-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Account</th><th>ID</th><th>Business</th><th>Status</th><th>Currency</th><th>Lifetime spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pgAcc.rows.map((a) => {
                      const isOn = connected.has(a.accountId);
                      return (
                        <tr key={a.accountId}>
                          <td><input type="checkbox" checked={!!picked[a.accountId]} onChange={(e) => setPicked((p) => ({ ...p, [a.accountId]: e.target.checked }))} /></td>
                          <td><b>{a.name}</b>{isOn ? <span className="pill pill-active" style={{ marginLeft: 8 }}><span className="dot">●</span>Connected</span> : null}</td>
                          <td><code>{a.accountId}</code></td>
                          <td>{a.bmName || "—"}</td>
                          <td><span className={`pill ${a.active ? "pill-active" : "pill-off"}`}><span className="dot">●</span>{a.status}</span></td>
                          <td>{a.currency}</td>
                          <td>{a.currency === "INR" ? money(a.amountSpent) : `${a.currency} ${count(Math.round(a.amountSpent))}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pgAcc.pager}

              <div className="cs-run">
                <label className="fg" style={{ margin: 0, flex: "0 0 auto" }}>
                  <span className="form-label">How much history to load</span>
                  <select className="form-control" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
                  </select>
                  <span className="fg-note">90 days is fine the first time — more makes sync slower</span>
                </label>
                <button className="btn btn-gold" type="button" disabled={!!busy || !pickedCount} onClick={connectAndSync}>
                  <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-link"}`} />
                  {busy === "connect" ? "Connecting..." : busy === "sync" ? "Loading campaigns..." : ` Connect ${pickedCount} account${pickedCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-check" /> &nbsp;Done</div></div>
          <div className="settings-body">
            <div className="cs-stats">
              <div className="cs-stat"><span>Accounts connected</span><b className="cs-hl">{count(result.accounts)}</b></div>
              <div className="cs-stat"><span>New campaigns</span><b>{count(result.added || 0)}</b></div>
              <div className="cs-stat"><span>Updated</span><b>{count(result.updated || 0)}</b></div>
              <div className="cs-stat"><span>Daily rows</span><b>{count(result.daily || 0)}</b></div>
            </div>
            {result.errors?.length ? (
              <div className="cs-err">
                <i className="fa-solid fa-triangle-exclamation" />
                <div>{result.errors.map((e) => <div key={e.account}><b>{e.account}</b>: {e.message}</div>)}</div>
              </div>
            ) : null}
            {result.added ? (
              <div className="cs-warn" style={{ marginBottom: 12 }}>
                <i className="fa-solid fa-tags" />
                <span><b>{count(result.added)} new campaigns have no Service set.</b> Meta does not know VakilKaro services — select a service on each campaign in Campaigns → Live Ads, otherwise service-wise CPL will not be calculated.</span>
              </div>
            ) : null}
            <a className="btn btn-gold" href="/campaigns"><i className="fa-solid fa-bullhorn" /> Open Campaigns</a>
          </div>
        </div>
      ) : null}
    </>
  );
}
