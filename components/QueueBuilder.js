"use client";

/* ============================================================
   components/QueueBuilder.js

   Win-back Queue → "Build Today's Queue"

   Preview pehle dikhata hai — kitni leads eligible hain, kaun
   kis wajah se chhoot rahi hai, aur kis staff ko kitni milengi.
   Confirm karne par hi queue banti hai.

   Preview isliye zaroori hai: ek baar 400 leads queue me daal do
   to nikalna mushkil hota hai, aur staff ko galat list mil jaati.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { buildQueue, eligibleLeads } from "../lib/queue-builder";
import { useToast } from "./Toast";
import { count, money } from "./ModuleParts";

const POOL = "audience__lost-pool";
const BUCKETS = "audience__buckets";
const QUEUE = "win-back-queue__my-queue";

export default function QueueBuilder({ onClose }) {
  const { show } = useToast();
  const [pool, setPool] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [existing, setExisting] = useState([]);
  const [mode, setMode] = useState("keepOwner");
  const [limit, setLimit] = useState("50");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    setPool(readRows(POOL));
    setBuckets(readRows(BUCKETS));
    setExisting(readRows(QUEUE));
  }, []);

  const staffList = useMemo(
    () => [...new Set(pool.map((l) => String(l.lastStaff || "").trim()).filter(Boolean))].sort(),
    [pool],
  );

  const preview = useMemo(
    () => eligibleLeads(pool, buckets, { existingQueue: existing }),
    [pool, buckets, existing],
  );

  const cap = Number(limit) || 0;
  const willAdd = cap > 0 ? Math.min(cap, preview.leads.length) : preview.leads.length;

  /* Staff-wise preview — build se pehle dikhna chahiye */
  const byStaff = useMemo(() => {
    const slice = preview.leads.slice(0, willAdd);
    const m = {};
    slice.forEach((l) => {
      const k = String(l.lastStaff || "").trim() || "(unassigned)";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [preview.leads, willAdd]);

  const totalValue = useMemo(
    () => preview.leads.slice(0, willAdd).reduce((s, l) => s + Number(l.quoted || 0), 0),
    [preview.leads, willAdd],
  );

  function run() {
    if (!preview.leads.length) { show("No leads are eligible today.", "error"); return; }
    setBusy(true);
    try {
      const res = buildQueue({
        pool, buckets, existingQueue: existing,
        staffList, mode, limit: cap, uid,
      });

      writeRows(QUEUE, [...res.rows, ...existing]);
      logActivity({
        dataset: QUEUE, action: "Created", target: "Auto Queue",
        detail: `${res.added} leads · ${mode === "keepOwner" ? "with owner" : "round-robin"}`,
      });

      setDone(res);
      setExisting(readRows(QUEUE));
      show(`${res.added} leads added to the queue.`, "success");
      window.dispatchEvent(new CustomEvent("vk-marketing-updated"));
    } catch {
      show("Queue was not created — please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-check" /> &nbsp;Queue created</div>
          <div className="card-tools"><button className="btn btn-ghost" type="button" onClick={onClose}>Close</button></div>
        </div>
        <div className="settings-body">
          <div className="qb-stats">
            <div className="qb-stat"><span>Added to queue</span><b className="qb-hl">{count(done.added)}</b></div>
            <div className="qb-stat"><span>Were eligible</span><b>{count(done.eligible)}</b></div>
            <div className="qb-stat"><span>In cooldown</span><b>{count(done.skipped.cooldown)}</b></div>
            <div className="qb-stat"><span>Attempts used up</span><b>{count(done.skipped.attempts)}</b></div>
          </div>
          {Object.keys(done.byStaff).length ? (
            <>
              <div className="form-label" style={{ marginTop: 14 }}>Leads per staff member</div>
              <div className="qb-chips">
                {Object.entries(done.byStaff).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <span className="qb-chip" key={s}>{s} <b>{n}</b></span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="ttl">
          <i className="fa-solid fa-list-check" />
          <div className="ttl-txt">
            <b>Build today's queue</b>
            <span>Cooldown, attempts and DND are checked automatically</span>
          </div>
        </div>
        <div className="card-tools"><button className="btn btn-ghost" type="button" onClick={onClose}>Close</button></div>
      </div>

      <div className="settings-body">
        <div className="qb-stats">
          <div className="qb-stat"><span>Total in pool</span><b>{count(pool.length)}</b></div>
          <div className="qb-stat"><span>Eligible today</span><b className="qb-hl">{count(preview.leads.length)}</b></div>
          <div className="qb-stat"><span>Will go to queue</span><b className="qb-hl">{count(willAdd)}</b></div>
          <div className="qb-stat"><span>Quoted value</span><b>{money(totalValue)}</b></div>
        </div>

        {preview.leads.length ? null : (
          <div className="qb-warn">
            <i className="fa-solid fa-circle-info" />
            <span>No leads are eligible today. Either all are in cooldown, have used up their attempts, or are already in the queue. See the breakdown below.</span>
          </div>
        )}

        <div className="form-label" style={{ marginTop: 14 }}>Who is being left out</div>
        <div className="qb-chips">
          {[
            ["In cooldown", preview.skipped.cooldown, "fa-clock"],
            ["Attempts used up", preview.skipped.attempts, "fa-ban"],
            ["Already in queue", preview.skipped.alreadyQueued, "fa-list"],
            ["DND", preview.skipped.dnd, "fa-phone-slash"],
            ["Recovered/Archived", preview.skipped.done, "fa-check"],
            ["No number", preview.skipped.noPhone, "fa-triangle-exclamation"],
            ["Bucket paused", preview.skipped.pausedBucket, "fa-pause"],
          ].filter(([, n]) => n > 0).map(([label, n, icon]) => (
            <span className="qb-chip mut" key={label}><i className={`fa-solid ${icon}`} /> {label} <b>{n}</b></span>
          ))}
        </div>

        <div className="qb-grid">
          <label className="fg">
            <span className="form-label">How many leads</span>
            <select className="form-control" value={limit} onChange={(e) => setLimit(e.target.value)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="0">All ({preview.leads.length})</option>
            </select>
            <span className="fg-note">One staff member can make 40–50 calls a day</span>
          </label>

          <label className="fg">
            <span className="form-label">Staff assign</span>
            <select className="form-control" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="keepOwner">Whoever spoke to them before (recommended)</option>
              <option value="roundRobin">Split evenly</option>
            </select>
            <span className="fg-note">
              {mode === "keepOwner"
                ? "Context is remembered — better recovery rate"
                : "Unassigned leads will be split evenly"}
            </span>
          </label>
        </div>

        {byStaff.length ? (
          <>
            <div className="form-label">Leads each staff member will get</div>
            <div className="qb-chips">
              {byStaff.map(([s, n]) => <span className="qb-chip" key={s}>{s} <b>{n}</b></span>)}
            </div>
          </>
        ) : null}

        {preview.leads.length ? (
          <>
            <div className="form-label" style={{ marginTop: 14 }}>Top of the list (by score)</div>
            <div className="qb-top">
              {preview.leads.slice(0, 5).map((l) => (
                <div className="qb-top-row" key={l.id}>
                  <b>{l.name}</b>
                  <span className="pill pill-default">{l.bucket || "no bucket"}</span>
                  <span>{l.quoted ? money(l.quoted) : "—"}</span>
                  <span className="qb-score">{l.score || 0}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="qb-foot">
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn btn-gold" type="button" disabled={busy || !preview.leads.length} onClick={run}>
          <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-list-check"}`} /> {count(willAdd)} add leads to the queue
        </button>
      </div>
    </div>
  );
}
