"use client";

import { useEffect, useMemo, useState } from "react";
import { DATASETS, MARKETING_MODULES } from "../lib/marketing-config";
import { readRows, readSettings } from "../lib/marketing-local";

function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }
function money(v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n(v)); }
function count(v) { return new Intl.NumberFormat("en-IN").format(n(v)); }
function sum(rows, key) { return (rows || []).reduce((a, r) => a + n(r[key]), 0); }
function pct(a, b) { return b > 0 ? (a / b) * 100 : 0; }

export default function MarketingDashboardClient() {
  const [d, setD] = useState({});
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const load = () => {
      const next = {};
      Object.entries(DATASETS).forEach(([alias, key]) => { next[alias] = readRows(key); });
      setD(next);
      setSettings(readSettings());
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("vk-marketing-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const k = useMemo(() => {
    const ads = d.liveAds || [];
    const ledger = d.walletLedger || [];
    const balances = d.walletBalance || [];
    const inbox = d.inbox || [];
    const sources = d.sources || [];
    const pool = d.lostPool || [];
    const recovered = d.recovered || [];
    const queue = d.queue || [];
    const bcast = d.broadcast || [];

    const adSpend = sum(ads, "spend");
    const ledgerSpend = ledger.filter((r) => String(r.type).toLowerCase() === "spend").reduce((a, r) => a + n(r.amount), 0);
    const spend = adSpend + ledgerSpend + sum(sources, "monthlyCost");

    const balance = sum(balances, "balance");
    const burn = sum(balances, "dailyBurn");
    const daysLeft = burn > 0 ? Math.floor(balance / burn) : null;

    const leads = inbox.length || sum(ads, "leads") || sum(sources, "leads");
    const qualified = inbox.filter((r) => ["qualified", "converted"].includes(String(r.stage).toLowerCase())).length || sum(sources, "qualified");
    const won = inbox.filter((r) => String(r.stage).toLowerCase() === "converted").length || sum(ads, "won") || sum(sources, "won");
    const revenue = sum(ads, "revenue");

    const recRevenue = sum(recovered, "orderValue");
    const recCost = sum(recovered, "recoveryCost");

    return {
      spend, balance, burn, daysLeft,
      leads, qualified, won, revenue,
      cpl: leads > 0 ? spend / leads : 0,
      costPerWon: won > 0 ? spend / won : 0,
      qualifiedPct: pct(qualified, leads),
      convPct: pct(won, leads),
      roas: spend > 0 ? (revenue + recRevenue) / spend : 0,
      recovered: recovered.length,
      recRevenue,
      cpr: recovered.length > 0 ? recCost / recovered.length : 0,
      liveAds: ads.filter((r) => String(r.status).toLowerCase() === "active").length,
      pausedAds: ads.filter((r) => String(r.status).toLowerCase() === "paused").length,
      draftAds: ads.filter((r) => String(r.status).toLowerCase() === "draft").length,
      pool: pool.filter((r) => !["recovered", "archived"].includes(String(r.status).toLowerCase())).length,
      dueQueue: queue.filter((r) => String(r.status).toLowerCase() === "queued").length,
      broadcastSent: sum(bcast, "sent"),
      broadcastReplies: sum(bcast, "replies"),
    };
  }, [d]);

  /* Source split — kis jagah se kitni leads */
  const sourceSplit = useMemo(() => {
    const rows = d.sources || [];
    const fromInbox = {};
    (d.inbox || []).forEach((r) => {
      const key = r.source || "Other";
      fromInbox[key] = (fromInbox[key] || 0) + 1;
    });
    const merged = rows.map((r) => ({
      name: r.name, kind: r.kind,
      leads: n(r.leads) || n(fromInbox[r.name]) || 0,
      spend: n(r.spend) + n(r.monthlyCost),
      won: n(r.won),
    }));
    Object.entries(fromInbox).forEach(([name, leads]) => {
      if (!merged.some((m) => m.name === name)) merged.push({ name, kind: "Captured", leads, spend: 0, won: 0 });
    });
    return merged.sort((a, b) => b.leads - a.leads).slice(0, 7);
  }, [d]);

  /* Service-wise CPL — NGO ka alag, Trademark ka alag */
  const serviceRows = useMemo(() => {
    const map = {};
    (d.liveAds || []).forEach((r) => {
      const s = r.service || "Unmapped";
      map[s] = map[s] || { service: s, spend: 0, leads: 0, won: 0, revenue: 0 };
      map[s].spend += n(r.spend); map[s].leads += n(r.leads);
      map[s].won += n(r.won); map[s].revenue += n(r.revenue);
    });
    (d.inbox || []).forEach((r) => {
      const s = r.service || "Unmapped";
      map[s] = map[s] || { service: s, spend: 0, leads: 0, won: 0, revenue: 0 };
      if (!(d.liveAds || []).length) map[s].leads += 1;
    });
    return Object.values(map).sort((a, b) => b.spend - a.spend).slice(0, 8);
  }, [d]);

  /* Alerts */
  const alerts = useMemo(() => {
    const out = [];
    const lowAt = n(settings.walletLow) || 5000;
    const cplWarn = n(settings.cplThreshold) || 0;
    (d.walletBalance || []).forEach((r) => {
      if (n(r.balance) < (n(r.lowThreshold) || lowAt)) out.push({ tone: "off", text: `${r.account || "Account"} wallet low — ${money(r.balance)}` });
    });
    (d.accounts || []).forEach((r) => {
      if (r.tokenState === "Expiring") out.push({ tone: "default", text: `${r.name} token expiring${r.tokenExpiry ? ` · ${r.tokenExpiry}` : ""}` });
      if (r.tokenState === "Disconnected") out.push({ tone: "off", text: `${r.name} disconnected — reconnect` });
    });
    (d.liveAds || []).forEach((r) => {
      const cap = n(r.cplCap) || cplWarn;
      const cpl = n(r.leads) > 0 ? n(r.spend) / n(r.leads) : 0;
      if (cap > 0 && cpl > cap) out.push({ tone: "off", text: `${r.name} CPL cap cross — ${money(cpl)} vs ${money(cap)}` });
    });
    (d.broadcast || []).forEach((r) => {
      if (n(r.failed) > 0) out.push({ tone: "default", text: `${count(r.failed)} failed in ${r.name} broadcast` });
    });
    return out.slice(0, 5);
  }, [d, settings]);

  /* Loop meter */
  const loop = useMemo(() => {
    const leads = k.leads;
    const won = k.won;
    const pool = k.pool;
    const rec = k.recovered;
    return [
      { label: "Leads received", value: leads, tone: "gold" },
      { label: "Won", value: won, tone: "green" },
      { label: "Went to pool", value: pool || Math.max(0, leads - won), tone: "red" },
      { label: "Recovered", value: rec, tone: "blue" },
    ];
  }, [k]);

  const maxLeads = Math.max(1, ...sourceSplit.map((s) => s.leads));

  return (
    <div className="marketing-dashboard">
      <div className="mk-hero">
        <div>
          <div className="mk-eyebrow">Growth command center</div>
          <h1>Growth Dashboard</h1>
          <p>Combined overview of Marketing and Remarketing — spend, leads, and recovered leads. Data is currently stored in this browser; a database can be connected later without changing the flow.</p>
        </div>
        <div className="mk-hero-icon"><i className="fa-solid fa-chart-line" /></div>
      </div>

      {alerts.length ? (
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-triangle-exclamation" /> &nbsp;Alerts</div><div className="card-tools"><span className="cnt">{alerts.length} open</span></div></div>
          <div className="settings-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {alerts.map((a, i) => <span className={`pill ${a.tone === "off" ? "pill-off" : "pill-default"}`} key={i}><span className="dot">●</span>{a.text}</span>)}
          </div>
        </div>
      ) : null}

      <Row title="Money" icon="fa-indian-rupee-sign" items={[
        { label: "Ad Spend", value: money(k.spend), sub: "Campaigns + ledger + fixed cost" },
        { label: "Wallet Balance", value: money(k.balance), sub: `${money(k.burn)}/day burn` },
        { label: "Days Remaining", value: k.daysLeft === null ? "—" : `${k.daysLeft}d`, sub: "At the current burn rate" },
        { label: "Revenue", value: money(k.revenue + k.recRevenue), sub: `${money(k.recRevenue)} from recovery` },
      ]} />

      <Row title="Leads" icon="fa-user-plus" items={[
        { label: "Total Leads", value: count(k.leads), sub: `${count(k.qualified)} qualified` },
        { label: "CPL", value: money(k.cpl), sub: "Cost per lead" },
        { label: "Qualified %", value: `${k.qualifiedPct.toFixed(1)}%`, sub: `Conversion ${k.convPct.toFixed(1)}%` },
        { label: "Cost / Won Order", value: money(k.costPerWon), sub: "This is the real number" },
      ]} />

      <Row title="Return" icon="fa-arrow-trend-up" items={[
        { label: "ROAS", value: `${k.roas.toFixed(2)}x`, sub: "Revenue / spend" },
        { label: "Recovered Leads", value: count(k.recovered), sub: `${money(k.recRevenue)} revenue` },
        { label: "Cost / Recovery", value: money(k.cpr), sub: `vs fresh CPL ${money(k.cpl)}` },
        { label: "Live Ads", value: count(k.liveAds), sub: `${count(k.pausedAds)} paused · ${count(k.draftAds)} draft` },
      ]} />

      <div className="grid2">
        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-diagram-project" /> &nbsp;Source split</div><div className="card-tools"><span className="cnt">Leads by source</span></div></div>
          <div className="settings-body">
            {sourceSplit.length ? sourceSplit.map((s) => (
              <div className="lt-row" key={s.name}>
                <div className="lt-meta">
                  <div className="lt-name">{s.name}</div>
                  <div className="lt-sub">{s.kind} · {s.spend > 0 ? `CPL ${money(s.leads > 0 ? s.spend / s.leads : 0)}` : "No cost tracked"}</div>
                  <div style={{ height: 6, background: "var(--bg)", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(3, (s.leads / maxLeads) * 100)}%`, background: "var(--gold)", borderRadius: 4 }} />
                  </div>
                </div>
                <span className="paid-badge pb-paid">{count(s.leads)} leads</span>
              </div>
            )) : <Empty icon="fa-diagram-project" text="The split appears here once entries are added in Lead Capture → Sources." />}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-briefcase" /> &nbsp;Service-wise CPL</div><div className="card-tools"><span className="cnt">NGO and Trademark separately</span></div></div>
          {serviceRows.length ? (
            <div className="tbl-scroll">
              <table className="mod-table">
                <thead><tr><th>Service</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Won</th></tr></thead>
                <tbody>
                  {serviceRows.map((r) => (
                    <tr key={r.service}>
                      <td><b>{r.service}</b></td>
                      <td>{money(r.spend)}</td>
                      <td>{count(r.leads)}</td>
                      <td><b>{money(r.leads > 0 ? r.spend / r.leads : 0)}</b></td>
                      <td>{count(r.won)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="settings-body"><Empty icon="fa-briefcase" text="Service-wise CPL appears here once services are mapped on campaigns." /></div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-arrows-spin" /> &nbsp;Loop meter</div><div className="card-tools"><span className="cnt">Lead received → won → pool → recovered</span></div></div>
        <div className="settings-body">
          <div className="mk-kpi-grid">
            {loop.map((l) => (
              <div className="mk-kpi" key={l.label}>
                <div className="mk-kpi-label">{l.label}</div>
                <div className="mk-kpi-value">{count(l.value)}</div>
                <div className="mk-kpi-sub">
                  {l.label === "Recovered" && k.pool > 0 ? `${pct(k.recovered, k.pool + k.recovered).toFixed(1)}% recovery rate` : null}
                  {l.label === "Won" && k.leads > 0 ? `${k.convPct.toFixed(1)}% of leads` : null}
                  {l.label === "Went to pool" ? `${count(k.dueQueue)} due in queue` : null}
                  {l.label === "Leads received" ? `${count(k.broadcastSent)} broadcast sent` : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mk-module-grid">
        {Object.entries(MARKETING_MODULES).map(([key, c]) => (
          <a href={`/${key}`} className="mk-module-card" key={key}>
            <span className="mk-module-icon"><i className={`fa-solid ${c.icon}`} /></span>
            <div><b>{c.title}</b><span>{c.tabs.length} tabs</span></div>
            <i className="fa-solid fa-chevron-right mk-arrow" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Row({ title, icon, items }) {
  return (
    <div>
      <div className="mk-row-title">
        <i className={`fa-solid ${icon}`} /> &nbsp;{title}
      </div>
      <div className="mk-kpi-grid">
        {items.map((it) => (
          <div className="mk-kpi" key={it.label}>
            <div className="mk-kpi-label">{it.label}</div>
            <div className="mk-kpi-value">{it.value}</div>
            <div className="mk-kpi-sub">{it.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon, text }) {
  return <div className="mod-empty" style={{ padding: 26 }}><i className={`fa-solid ${icon}`} /><p>{text}</p></div>;
}
