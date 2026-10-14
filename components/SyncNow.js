"use client";

/* ============================================================
   components/SyncNow.js

   "Sync Now" dabao → server Meta/Google se data laata hai →
   yahan localStorage me merge hota hai.

   Merge upsert hai: same date + same campaign wali entry replace
   hoti hai, jodti nahi. Isliye ek hi range do baar sync karne se
   spend double nahi hota — Meta ka data 24-48 ghante tak adjust
   hota rehta hai, isliye dobara sync karna normal baat hai.
   ============================================================ */

import { useEffect, useState } from "react";
import { readRows, writeRows, uid, logActivity } from "../lib/marketing-local";
import { pullMetaLeads as pullLeadsFromMeta, leadDiagnosisText } from "../lib/meta-pull";
import { runMetaSync, panelMetaAccountIds, mergeCampaigns, mergeDaily, isoAgo } from "../lib/sync-merge";
import { resolveRange } from "../lib/date-range";
import { useToast } from "./Toast";

const DAILY = "campaigns__daily-stats";
const LEADS = "lead-capture__inbox-log";
const FORMS = "lead-capture__forms";

export default function SyncNow({ filters, onDone }) {
  const { show } = useToast();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then((d) => setStatus(d.platforms || null))
      .catch(() => setStatus(null));
  }, []);

  const anyReady = status && (status.meta.ready || status.google.ready || status.website.ready);

  async function run(provider) {
    setBusy(provider);
    try {
      if (provider === "website") return await pullWebsite();
      if (provider === "meta-leads") return await pullMetaLeads();

      const { from, to } = resolveRange(filters.range, filters.from, filters.to);
      /* All time par bhi API ko dates chahiye — 90 din maang lete hain. */
      const since = from || isoAgo(90);
      const until = to || isoAgo(0);

      /* Meta: panel ke Ad Accounts tab me jude accounts pe chalta hai */
      if (provider === "meta") {
        const r = await runMetaSync({ accountIds: panelMetaAccountIds(), since, until });
        if (!r.ok) { show(r.error, "error"); return; }
        if (r.errors.length) show(`${r.daily} rows loaded. ${r.errors.length} accounts failed: ${r.errors[0].message}`, "error");
        else show(`Sync complete — ${r.added} new, ${r.updated} updated campaigns, ${r.daily} daily entries.`, "success");
        if (onDone) onDone();
        return;
      }

      const res = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, since, until }),
      });
      const data = await res.json();

      if (data.needsSetup) { show(data.message, "error"); return; }
      if (!res.ok) { show(data.error || "Sync failed", "error"); return; }

      const c = mergeCampaigns(data.campaigns || []);
      const m = mergeDaily(data.daily || []);
      const n = c.added + c.updated;

      logActivity({
        dataset: DAILY, action: "Updated", target: "Google Sync",
        detail: `${since} → ${until} · ${m} daily rows · ${n} campaigns`,
      });

      const errs = data.errors || [];
      if (errs.length) {
        show(`${m} rows loaded. ${errs.length} accounts failed: ${errs[0].message}`, "error");
      } else {
        show(`Sync complete — ${n} campaigns, ${m} daily entries.`, "success");
      }
      if (onDone) onDone();
    } catch (e) {
      show("Could not reach the server — check the network.", "error");
    } finally {
      setBusy("");
    }
  }

  /* Lead form se actual leads — naam, number, city, service.
     Meta batata hai lead Facebook se aayi ya Instagram se, isliye
     panel me dono alag-alag count hoti hain. */
  /* Ab har lead ad se seedha (form ID ki zaroorat nahi), saare pages */
  async function pullMetaLeads() {
    const { from } = resolveRange(filters.range, filters.from, filters.to);
    const r = await pullLeadsFromMeta({ since: from || undefined });
    if (!r.ok) { show(r.error, "error"); return; }
    if (!r.added && r.diagnosis && r.diagnosis.reason !== "none-found") { show(`${leadDiagnosisText(r.diagnosis).title} — see Lead Capture for the fix.`, "error"); return; }
    if (!r.added) { show(r.checked ? "All leads are already in the panel." : `No new leads in this period (${r.adsChecked} lead ads checked).`, "success"); return; }
    show(`${r.added} leads added — Facebook ${r.fb}, Instagram ${r.ig}.`, "success");
  }


  async function pullWebsite() {
    const res = await fetch("/api/leads/website");
    const data = await res.json();
    if (!res.ok) { show(data.error || "No website leads found", "error"); return; }

    const incoming = data.leads || [];
    if (!incoming.length) { show("No new website leads.", "success"); return; }

    const rows = readRows(LEADS);
    const seen = new Set(rows.map((r) => String(r.phone || "").replace(/\D/g, "").slice(-10)));
    const add = [];
    incoming.forEach((l) => {
      const p = String(l.phone || "").replace(/\D/g, "").slice(-10);
      add.push({
        id: uid(), name: l.name, phone: p, email: l.email || "", city: l.city || "",
        source: "Website", campaign: l.campaign || "", service: l.service || "",
        receivedAt: l.receivedAt, flag: seen.has(p) ? "Duplicate" : "Clean",
        stage: "New", status: "Received",
        createdAt: new Date().toISOString(),
      });
      seen.add(p);
    });
    writeRows(LEADS, [...add, ...rows]);
    logActivity({ dataset: LEADS, action: "Created", target: "Website Sync", detail: `${add.length} leads pulled` });
    show(`${add.length} website lead${add.length === 1 ? "" : "s"} added.`, "success");
    if (onDone) onDone();
  }

  if (!status) return null;

  return (
    <div className="sy-wrap">
      {status.meta.ready ? (
        <button className="sy-btn" type="button" disabled={busy === "meta"} onClick={() => run("meta")}>
          <i className={`fa-solid ${busy === "meta" ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
          {busy === "meta" ? "Syncing..." : "Sync Meta"}
          <span className="sy-sub">FB + IG</span>
        </button>
      ) : null}

      {status.google.ready ? (
        <button className="sy-btn" type="button" disabled={busy === "google"} onClick={() => run("google")}>
          <i className={`fa-solid ${busy === "google" ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
          {busy === "google" ? "Syncing..." : "Sync Google"}
          <span className="sy-sub">YouTube</span>
        </button>
      ) : null}

      {status.meta.ready ? (
        <button className="sy-btn" type="button" disabled={busy === "meta-leads"} onClick={() => run("meta-leads")}>
          <i className={`fa-solid ${busy === "meta-leads" ? "fa-spinner fa-spin" : "fa-inbox"}`} />
          {busy === "meta-leads" ? "Pulling..." : "Pull Leads"}
          <span className="sy-sub">FB + IG</span>
        </button>
      ) : null}

      {status.website.ready ? (
        <button className="sy-btn" type="button" disabled={busy === "website"} onClick={() => run("website")}>
          <i className={`fa-solid ${busy === "website" ? "fa-spinner fa-spin" : "fa-inbox"}`} />
          {busy === "website" ? "Pulling..." : "Pull Website Leads"}
        </button>
      ) : null}

      {!anyReady ? (
        <span className="sy-off">
          <i className="fa-solid fa-plug-circle-xmark" />
          Auto-sync off — add the token to .env. Manual entry works until then.
        </span>
      ) : null}
    </div>
  );
}

