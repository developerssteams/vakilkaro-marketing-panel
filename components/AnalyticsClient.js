"use client";

import { useEffect, useMemo, useState } from "react";
import { DATASETS } from "../lib/marketing-config";
import { readRows } from "../lib/marketing-local";

function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }
function money(v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n(v)); }
function count(v) { return new Intl.NumberFormat("en-IN").format(n(v)); }
function sum(rows, key) { return (rows || []).reduce((a, r) => a + n(r[key]), 0); }
function pct(a, b) { return b > 0 ? (a / b) * 100 : 0; }

const TABS = [
  { key: "funnel", label: "Funnel", icon: "fa-filter" },
  { key: "marketing", label: "Marketing", icon: "fa-bullhorn" },
  { key: "remarketing", label: "Remarketing", icon: "fa-rotate-left" },
  { key: "compare", label: "Compare", icon: "fa-scale-balanced" },
];

export default function AnalyticsClient() {
  const [tab, setTab] = useState("funnel");
  const [d, setD] = useState({});

  useEffect(() => {
    const load = () => {
      const next = {};
      Object.entries(DATASETS).forEach(([alias, key]) => { next[alias] = readRows(key); });
      setD(next);
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  const x = useMemo(() => {
    const ads = d.liveAds || [];
    const inbox = d.inbox || [];
    const ledger = d.walletLedger || [];
    const recovered = d.recovered || [];
    const bcast = d.broadcast || [];
    const journeys = d.journeys || [];
    const pool = d.lostPool || [];

    const spend = sum(ads, "spend") + ledger.filter((r) => String(r.type).toLowerCase() === "spend").reduce((a, r) => a + n(r.amount), 0);
    const impressions = sum(ads, "impressions");
    const clicks = sum(ads, "clicks");
    const leads = inbox.length || sum(ads, "leads");
    const contacted = inbox.filter((r) => ["contacted", "qualified", "converted"].includes(String(r.stage).toLowerCase())).length;
    const qualified = inbox.filter((r) => ["qualified", "converted"].includes(String(r.stage).toLowerCase())).length;
    const won = inbox.filter((r) => String(r.stage).toLowerCase() === "converted").length || sum(ads, "won");

    const recRevenue = sum(recovered, "orderValue");
    const recCost = sum(recovered, "recoveryCost");
    const cpr = recovered.length ? recCost / recovered.length : 0;
    const cpl = leads ? spend / leads : 0;

    const sent = sum(bcast, "sent");
    const delivered = sum(bcast, "delivered");
    const readMsg = sum(bcast, "read");
    const replies = sum(bcast, "replies");

    const touched = pool.filter((r) => ["sequenced", "queued", "recovered", "archived"].includes(String(r.status).toLowerCase())).length;

    return {
      spend, impressions, clicks, leads, contacted, qualified, won,
      cpl, costPerWon: won ? spend / won : 0,
      revenue: sum(ads, "revenue"),
      recovered: recovered.length, recRevenue, recCost, cpr,
      sent, delivered, readMsg, replies,
      recoveryRate: pct(recovered.length, touched || recovered.length),
      avgDays: recovered.length ? Math.round(sum(recovered, "days") / recovered.length) : 0,
      deadPool: pool.filter((r) => String(r.status).toLowerCase() === "archived").length,
      journeys, bcast, ads, recovered, pool,
    };
  }, [d]);

  return (
    <div className="mod-wrap">
      <div className="pg-head">
        <div>
          <h1 className="pg-title">Analytics</h1>
          <div className="pg-desc">Analysis of both Marketing and Remarketing — and the key question: is a fresh lead or a recovered lead cheaper?</div>
        </div>
      </div>

      <div className="hl-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`hl-tab${t.key === tab ? " on" : ""}`} onClick={() => setTab(t.key)}>
            <i className={`fa-solid ${t.icon}`} /> &nbsp;{t.label}
          </button>
        ))}
      </div>

      {tab === "funnel" ? <FunnelTab x={x} /> : null}
      {tab === "marketing" ? <MarketingTab d={d} x={x} /> : null}
      {tab === "remarketing" ? <RemarketingTab d={d} x={x} /> : null}
      {tab === "compare" ? <CompareTab x={x} /> : null}
    </div>
  );
}

/* ---------- FUNNEL ---------- */
function FunnelTab({ x }) {
  const steps = [
    { label: "Impressions", value: x.impressions, icon: "fa-eye" },
    { label: "Clicks", value: x.clicks, icon: "fa-arrow-pointer" },
    { label: "Leads", value: x.leads, icon: "fa-inbox" },
    { label: "Contacted", value: x.contacted, icon: "fa-phone" },
    { label: "Qualified", value: x.qualified, icon: "fa-user-check" },
    { label: "Won", value: x.won, icon: "fa-trophy" },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <>
      <div className="mk-kpi-grid analytics-kpis">
        <K label="Tracked Spend" value={money(x.spend)} />
        <K label="Leads" value={count(x.leads)} />
        <K label="CPL" value={money(x.cpl)} />
        <K label="Cost / Won" value={money(x.costPerWon)} />
        <K label="Close Rate" value={`${pct(x.won, x.leads).toFixed(1)}%`} />
      </div>
      <div className="card analytics-card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-filter" /> &nbsp;Impression → Won</div></div>
        <div className="settings-body">
          {steps.map((s) => (
            <div className="lt-row" key={s.label}>
              <div className="lt-ic" style={{ background: "var(--gold-bg)", color: "var(--gold-deep)" }}><i className={`fa-solid ${s.icon}`} /></div>
              <div className="lt-meta">
                <div className="lt-name">{s.label}</div>
                <div style={{ height: 7, background: "var(--bg)", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(2, (s.value / max) * 100)}%`, background: "var(--ink)", borderRadius: 4 }} />
                </div>
              </div>
              <span className="paid-badge pb-paid">{count(s.value)}</span>
            </div>
          ))}
          <div className="pg-desc" style={{ marginTop: 12 }}>
            CTR {pct(x.clicks, x.impressions).toFixed(2)}% · Lead rate {pct(x.leads, x.clicks).toFixed(2)}% · Qualified {pct(x.qualified, x.leads).toFixed(1)}% · Close {pct(x.won, x.leads).toFixed(1)}%
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- MARKETING ---------- */
function MarketingTab({ d, x }) {
  const bySource = (d.sources || []).map((r) => ({
    name: r.name, leads: n(r.leads), won: n(r.won),
    spend: n(r.spend) + n(r.monthlyCost),
  })).sort((a, b) => b.leads - a.leads);
  const staff = useMemo(() => {
    const map = {};
    (d.inbox || []).forEach((r) => {
      const s = r.assignedTo || "Unassigned";
      map[s] = map[s] || { name: s, leads: 0, won: 0 };
      map[s].leads += 1;
      if (String(r.stage).toLowerCase() === "converted") map[s].won += 1;
    });
    return Object.values(map).sort((a, b) => b.leads - a.leads);
  }, [d]);
  const bucketCross = useMemo(() => {
    const map = {};
    (d.lostPool || []).forEach((r) => {
      const c = r.campaign || "Unknown campaign";
      map[c] = map[c] || { campaign: c, total: 0, buckets: {} };
      map[c].total += 1;
      const b = r.bucket || "Untagged";
      map[c].buckets[b] = (map[c].buckets[b] || 0) + 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [d]);

  return (
    <>
      <div>
        <Table title="Source performance" icon="fa-diagram-project" head={["Source", "Leads", "Won", "CPL"]}
          rows={bySource.map((r) => [r.name, count(r.leads), count(r.won), money(r.leads ? r.spend / r.leads : 0)])}
          empty="Add entries in Lead Capture → Sources." />
      </div>
      <div className="grid2">
        <Table title="Staff-wise conversion" icon="fa-user-tie" head={["Staff", "Leads", "Won", "Conversion"]}
          rows={staff.map((r) => [r.name, count(r.leads), count(r.won), `${pct(r.won, r.leads).toFixed(1)}%`])}
          empty="Staff comparison appears once Assigned To is filled in the Inbox Log." />
        <Table title="Lost reason × campaign" icon="fa-table-cells" head={["Campaign", "Lost", "Top reason"]}
          rows={bucketCross.map((r) => {
            const top = Object.entries(r.buckets).sort((a, b) => b[1] - a[1])[0];
            return [r.campaign, count(r.total), top ? `${top[0]} (${top[1]})` : "—"];
          })}
          empty="The cross-tab appears here once Audience → Lost Pool is filled." />
      </div>
    </>
  );
}

/* ---------- REMARKETING ---------- */
function RemarketingTab({ d, x }) {
  const byBucket = (d.buckets || []).map((r) => ({
    name: r.name, total: n(r.leadCount), rec: n(r.recovered),
  })).sort((a, b) => b.total - a.total);
  const byJourney = useMemo(() => {
    const map = {};
    (d.journeys || []).forEach((r) => {
      const j = r.journey || "—";
      map[j] = map[j] || { name: j, enrolled: 0, recovered: 0, steps: 0 };
      map[j].enrolled += n(r.enrolled); map[j].recovered += n(r.recovered); map[j].steps += 1;
    });
    return Object.values(map).sort((a, b) => b.recovered - a.recovered);
  }, [d]);
  const byStaff = useMemo(() => {
    const map = {};
    (d.recovered || []).forEach((r) => {
      const s = r.owner || "Unassigned";
      map[s] = map[s] || { name: s, rec: 0, rev: 0 };
      map[s].rec += 1; map[s].rev += n(r.orderValue);
    });
    return Object.values(map).sort((a, b) => b.rev - a.rev);
  }, [d]);

  return (
    <>
      <div className="mk-kpi-grid analytics-kpis">
        <K label="Recovery Rate" value={`${x.recoveryRate.toFixed(1)}%`} />
        <K label="Recovered" value={count(x.recovered)} />
        <K label="Recovery Revenue" value={money(x.recRevenue)} />
        <K label="Avg Time" value={`${x.avgDays}d`} />
        <K label="Dead Pool" value={count(x.deadPool)} />
      </div>
      <div className="card analytics-card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-tower-cell" /> &nbsp;Message funnel</div></div>
        <div className="settings-body">
          {[["Sent", x.sent], ["Delivered", x.delivered], ["Read", x.readMsg], ["Replied", x.replies], ["Converted", x.recovered]].map(([label, v]) => {
            const max = Math.max(1, x.sent);
            return (
              <div className="lt-row" key={label}>
                <div className="lt-meta">
                  <div className="lt-name">{label}</div>
                  <div style={{ height: 7, background: "var(--bg)", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(2, (n(v) / max) * 100)}%`, background: "var(--gold)", borderRadius: 4 }} />
                  </div>
                </div>
                <span className="paid-badge pb-paid">{count(v)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid2">
        <Table title="Bucket-wise recovery" icon="fa-tags" head={["Bucket", "Leads", "Recovered", "Rate"]}
          rows={byBucket.map((r) => [r.name, count(r.total), count(r.rec), `${pct(r.rec, r.total).toFixed(1)}%`])}
          empty="Fill counts in Audience → Buckets." />
        <Table title="Journey performance" icon="fa-route" head={["Journey", "Steps", "Enrolled", "Recovered"]}
          rows={byJourney.map((r) => [r.name, count(r.steps), count(r.enrolled), count(r.recovered)])}
          empty="Add steps in Outreach → Journeys." />
      </div>
      <Table title="Staff-wise recovery" icon="fa-user-tie" head={["Staff", "Recovered", "Revenue"]}
        rows={byStaff.map((r) => [r.name, count(r.rec), money(r.rev)])}
        empty="The staff board appears once owner is filled in Win-back Queue → Recovered." />
    </>
  );
}

/* ---------- COMPARE ---------- */
function CompareTab({ x }) {
  const cheaper = x.cpr > 0 && x.cpl > 0 ? (x.cpr < x.cpl ? "Recovered lead is cheaper" : "Fresh lead is cheaper") : "Data from both sides is needed";
  const rows = [
    ["Cost per lead / recovery", money(x.cpl), money(x.cpr)],
    ["Volume", count(x.leads), count(x.recovered)],
    ["Revenue", money(x.revenue), money(x.recRevenue)],
    ["Total cost", money(x.spend), money(x.recCost)],
    ["ROAS", `${(x.spend ? x.revenue / x.spend : 0).toFixed(2)}x`, `${(x.recCost ? x.recRevenue / x.recCost : 0).toFixed(2)}x`],
  ];
  return (
    <>
      <div className="mk-kpi-grid">
        <K label="Fresh CPL" value={money(x.cpl)} />
        <K label="Cost / Recovery" value={money(x.cpr)} />
        <K label="Difference" value={money(Math.abs(x.cpl - x.cpr))} />
        <K label="Verdict" value={cheaper} />
      </div>
      <div className="card analytics-card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-scale-balanced" /> &nbsp;Marketing vs Remarketing</div>
          <div className="card-tools"><button className="btn btn-ghost" type="button" onClick={() => window.print()}><i className="fa-solid fa-file-export" /> Export</button></div>
        </div>
        <div className="tbl-scroll">
          <table className="mod-table">
            <thead><tr><th>Metric</th><th>Marketing (fresh)</th><th>Remarketing (recovered)</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="analytics-note">
          This is the number shown to the board — if a recovered lead costs less than a fresh lead, it makes sense to invest more in remarketing.
        </div>
      </div>
    </>
  );
}

/* ---------- shared ---------- */
function K({ label, value }) {
  return <div className="mk-kpi"><div className="mk-kpi-label">{label}</div><div className={`mk-kpi-value${String(value).length > 12 ? " ho-name" : ""}`} style={String(value).length > 12 ? { fontSize: 15, lineHeight: 1.35 } : undefined}>{value}</div></div>;
}

function Table({ title, icon, head, rows, empty }) {
  return (
    <div className="card analytics-card">
      <div className="card-head"><div className="ttl"><i className={`fa-solid ${icon}`} /> &nbsp;{title}</div><div className="card-tools"><span className="cnt">{rows.length} row{rows.length === 1 ? "" : "s"}</span></div></div>
      {rows.length ? (
        <div className="tbl-scroll">
          <table className="mod-table">
            <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{j === 0 ? <b>{c}</b> : c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <div className="mod-empty" style={{ padding: 26 }}><i className={`fa-solid ${icon}`} /><p>{empty}</p></div>}
    </div>
  );
}
