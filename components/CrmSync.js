"use client";

/* ============================================================
   components/CrmSync.js

   Audience → Lost Pool ka "Sync from CRM" button.

   Do step: pehle connection test (kya mil raha hai dikhao), phir
   sync (kitna aaya, kitna skip hua batao).

   Merge me phone number key hai — CRM me ek hi lead do baar ho
   sakti hai, aur panel me pehle se bhi ho sakti hai. Purani entry
   ka attempts aur cooldown kabhi overwrite nahi hota, warna wo
   lead kal phir calling list me aa jayegi.
   ============================================================ */

import { useEffect, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";
import { count } from "./ModuleParts";

const POOL = "audience__lost-pool";

export default function CrmSync({ onClose }) {
  const { show } = useToast();
  const [status, setStatus] = useState(null);
  const [columns, setColumns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [since, setSince] = useState("");

  useEffect(() => { check(); }, []);

  async function check(withColumns) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/test${withColumns ? "?columns=1" : ""}`);
      const j = await res.json();
      setStatus(j);
      if (j.columns) setColumns(j.columns);
    } catch {
      setStatus({ error: "Could not reach the server" });
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    try {
      const res = await fetch("/api/crm/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: since || undefined, limit: 2000 }),
      });
      const j = await res.json();

      if (!res.ok) { show(j.error || "Sync fail", "error"); return; }

      const merged = merge(j.leads || []);
      setResult({ ...j, ...merged });

      logActivity({
        dataset: POOL, action: "Created", target: "CRM Sync",
        detail: `${merged.added} new · ${merged.updated} updated · ${j.fetched} from CRM`,
      });
      show(`${merged.added} new leads added, ${merged.updated} updated.`, "success");
    } catch {
      show("Could not reach the server.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* Phone se match. Nayi lead add, purani sirf tab update jab CRM me
     naya data ho — attempts, cooldown aur DND kabhi nahi chhedte. */
  function merge(incoming) {
    const existing = readRows(POOL);
    const byPhone = new Map(existing.map((r) => [String(r.phone || "").replace(/\D/g, "").slice(-10), r]));

    let added = 0;
    let updated = 0;
    const next = [...existing];

    for (const lead of incoming) {
      const old = byPhone.get(lead.phone);

      if (!old) {
        next.unshift({ id: uid(), ...lead, createdAt: new Date().toISOString() });
        added += 1;
        continue;
      }

      /* Recovered ya archived ho chuki lead ko wapas pool me mat laao */
      if (["Recovered", "Archived"].includes(String(old.status))) continue;

      const patch = {};
      if (lead.bucket && !old.bucket) patch.bucket = lead.bucket;
      if (lead.service && !old.service) patch.service = lead.service;
      if (lead.quoted && !old.quoted) patch.quoted = lead.quoted;
      if (lead.email && !old.email) patch.email = lead.email;
      if (lead.city && !old.city) patch.city = lead.city;
      if (lead.lostReason && !old.lostReason) patch.lostReason = lead.lostReason;
      if (lead.crmId && !old.crmId) patch.crmId = lead.crmId;

      if (Object.keys(patch).length) {
        const i = next.findIndex((r) => r.id === old.id);
        next[i] = { ...next[i], ...patch, updatedAt: new Date().toISOString() };
        updated += 1;
      }
    }

    writeRows(POOL, next);
    return { added, updated };
  }

  /* ---------- setup nahi hai ---------- */
  if (status?.needsSetup) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="ttl">
            <i className="fa-solid fa-database" />
            <div className="ttl-txt"><b>CRM is not connected</b><span>Connect the CRM MySQL database to bring in lost leads</span></div>
          </div>
          <div className="card-tools"><button className="btn btn-ghost" type="button" onClick={onClose}>Close</button></div>
        </div>
        <div className="settings-body">
          <div className="cs-missing">
            <span>Missing:</span>
            {(status.missing || []).map((k) => <code key={k}>{k}</code>)}
          </div>
          <p className="settings-copy">
            <code>.env.local</code> — add the CRM MySQL details and restart the server. On Hostinger you must enable <b>Remote MySQL</b> and whitelist your IP — otherwise the connection will time out.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="ttl">
            <i className="fa-solid fa-database" />
            <div className="ttl-txt"><b>Lost Leads from CRM</b><span>Read-only — nothing is changed in the CRM</span></div>
          </div>
          <div className="card-tools">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => check(true)}>
              <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-plug"}`} /> Test
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="settings-body">
          {status?.error ? (
            <div className="cs-err">
              <i className="fa-solid fa-triangle-exclamation" />
              <div>
                <b>{status.error}</b>
                {status.code === "ETIMEDOUT" || status.code === "ER_HOST_NOT_PRIVILEGED" ? (
                  <div className="cs-hint">Hostinger → Databases → <b>Remote MySQL</b> → add your IP. If you run it locally, your IP changes daily.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {status?.ok ? (
            <>
              <div className="cs-stats">
                <div className="cs-stat"><span>Table</span><b>{status.table}</b></div>
                <div className="cs-stat"><span>Total rows</span><b>{count(status.total)}</b></div>
                <div className="cs-stat"><span>Lost leads</span><b className="cs-hl">{status.lostCount === null ? "—" : count(status.lostCount)}</b></div>
              </div>

              {status.lostCount === 0 ? (
                <div className="cs-warn">
                  <i className="fa-solid fa-circle-info" />
                  <span>No lost leads found. Check the status list below — put the value used for lost in <code>CRM_LOST_STATUS</code> .</span>
                </div>
              ) : null}

              {status.statuses?.length ? (
                <>
                  <div className="form-label" style={{ marginTop: 14 }}>Statuses in the CRM</div>
                  <div className="cs-chips">
                    {status.statuses.map((s) => (
                      <span className={`cs-chip${status.config.lostValues.includes(String(s.status)) ? " on" : ""}`} key={s.status}>
                        {s.status || "(khaali)"} <b>{count(s.count)}</b>
                      </span>
                    ))}
                  </div>
                  <div className="cs-note">The green ones are set in <code>CRM_LOST_STATUS</code> — leads with these statuses will be pulled.</div>
                </>
              ) : null}

              {status.config?.unmapped?.length ? (
                <div className="cs-warn" style={{ marginTop: 14 }}>
                  <i className="fa-solid fa-circle-exclamation" />
                  <span>These fields are not mapped: {status.config.unmapped.map((k) => <code key={k}>CRM_COL_{k.toUpperCase()}</code>)}
                    {status.config.unmapped.includes("reason") ? <> — <b>without reason, buckets will not be auto-assigned</b>, and remarketing journeys will not trigger.</> : null}
                  </span>
                </div>
              ) : null}

              {columns.length ? (
                <>
                  <div className="form-label" style={{ marginTop: 14 }}>Table columns</div>
                  <div className="cs-chips">
                    {columns.map((c) => <span className="cs-chip sm" key={c.name}>{c.name}</span>)}
                  </div>
                </>
              ) : null}

              <div className="cs-run">
                <label className="fg" style={{ margin: 0, flex: "0 0 auto" }}>
                  <span className="form-label">Only after this date</span>
                  <input className="form-control" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
                  <span className="fg-note">Leave empty to pull all</span>
                </label>
                <button className="btn btn-gold" type="button" disabled={busy} onClick={runSync}>
                  <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-download"}`} /> {busy ? "Loading..." : "Sync from CRM"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-check" /> &nbsp;Sync result</div></div>
          <div className="settings-body">
            <div className="cs-stats">
              <div className="cs-stat"><span>From CRM</span><b>{count(result.fetched)}</b></div>
              <div className="cs-stat"><span>New added</span><b className="cs-hl">{count(result.added)}</b></div>
              <div className="cs-stat"><span>Updated</span><b>{count(result.updated)}</b></div>
              <div className="cs-stat"><span>Duplicate</span><b>{count(result.skipped?.duplicate)}</b></div>
              <div className="cs-stat"><span>Bad phone</span><b>{count(result.skipped?.badPhone)}</b></div>
            </div>

            {result.needsBucket ? (
              <div className="cs-warn" style={{ marginTop: 14 }}>
                <i className="fa-solid fa-tags" />
                <span><b>{count(result.needsBucket)} leads have no bucket</b> — the CRM reason did not match. Pick a bucket manually in Lost Pool, otherwise no journey will run for them.</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
