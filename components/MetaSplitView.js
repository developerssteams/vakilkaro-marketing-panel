"use client";

/* ============================================================
   components/MetaSplitView.js  —  Campaigns → "Meta (FB + IG)"

   Ads Manager ek campaign ka ek hi number dikhata hai (FB + IG
   jod ke). Panel ke Facebook / Instagram card use baant dete hain.
   Ye view dono ek saath dikhata hai:

     · upar total + Facebook + Instagram ke alag box
     · "FB vs IG" table — kaunsa platform sasta pad raha hai
     · har campaign: total, FB hissa, IG hissa  (total = Ads Manager)
     · din-wise: kitna FB, kitna IG

   Total wala column Ads Manager se seedha match hona chahiye —
   check karne ka sabse aasaan tareeka yahi hai.
   ============================================================ */

import { usePaged } from "./Pager";
import { useMemo, useState } from "react";
import { money, money2, count, statusClass, dayLabel, Empty } from "./ModuleParts";
import { daysInRange, rangeLabel, todayISO } from "../lib/date-range";
import { sumMetrics, sameCampaign, costPerResult, ctrAll, ctrLink, cpm, budgetInfo } from "../lib/meta-metrics";

const FB = "Facebook";
const IG = "Instagram";
const FB_C = "#1877F2";
const IG_C = "#C13584";

const cpl = costPerResult;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const M = money2;

export default function MetaSplitView({
  rows, dailyInRange, range, from, to, problems, busyId, rangeText,
  onBack, onOpenCard, onToggle, onAds, filterPanel,
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("spend");

  const blockedIds = useMemo(() => new Set(problems.map((p) => p.accountId)), [problems]);

  /* Sirf FB + IG ki daily entries */
  const metaDaily = useMemo(
    () => dailyInRange.filter((d) => d.channel === FB || d.channel === IG),
    [dailyInRange],
  );

  const totals = useMemo(() => ({
    fb: sumMetrics(metaDaily.filter((d) => d.channel === FB)),
    ig: sumMetrics(metaDaily.filter((d) => d.channel === IG)),
    all: sumMetrics(metaDaily),
  }), [metaDaily]);

  /* Har campaign ka FB aur IG hissa. Account bhi milate hain taaki do
     accounts ke same naam wale campaign mix na hon. */
  const perCampaign = useMemo(() => {
    const out = rows.map((r) => {
      const mine = metaDaily.filter((d) => sameCampaign(r, d));
      return {
        row: r,
        fb: sumMetrics(mine.filter((d) => d.channel === FB)),
        ig: sumMetrics(mine.filter((d) => d.channel === IG)),
        all: sumMetrics(mine),
        blocked: blockedIds.has(r.accountId),
      };
    });
    const q = search.trim().toLowerCase();
    const list = q ? out.filter((x) => String(x.row.name || "").toLowerCase().includes(q) || String(x.row.account || "").toLowerCase().includes(q)) : out;
    const key = { spend: (x) => x.all.spend, leads: (x) => x.all.leads, cpl: (x) => (x.all.leads ? -cpl(x.all) : -Infinity), name: null }[sort];
    return key ? [...list].sort((a, b) => key(b) - key(a)) : [...list].sort((a, b) => String(a.row.name).localeCompare(String(b.row.name)));
  }, [rows, metaDaily, search, sort, blockedIds]);

  const days = useMemo(() => {
    const list = daysInRange(from, to) || [...new Set(metaDaily.map((d) => d.date))].sort().reverse();
    return list.map((day) => {
      const mine = metaDaily.filter((d) => d.date === day);
      const fb = sumMetrics(mine.filter((d) => d.channel === FB));
      const ig = sumMetrics(mine.filter((d) => d.channel === IG));
      return { day, fb, ig, spend: fb.spend + ig.spend, leads: fb.leads + ig.leads };
    });
  }, [metaDaily, from, to]);
  const maxDay = Math.max(1, ...days.map((d) => d.spend));
  const pgCamp = usePaged(perCampaign, sort);
  const pgDays = usePaged(days);

  const live = rows.filter((r) => r.status === "Active" && !blockedIds.has(r.accountId)).length;
  const { fb, ig, all } = totals;
  const rl = rangeText || rangeLabel(range, from, to);

  /* FB vs IG: kaunsa sasta — CPL kam = behtar */
  const cheaper = fb.leads && ig.leads ? (cpl(fb) <= cpl(ig) ? FB : IG) : "";

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div className="pg-head-left">
          <button className="back-btn" type="button" aria-label="Back to platforms" onClick={onBack}>
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div>
            <h2 className="pg-title cc-title">
              <span className="pc-ic-sm" style={{ background: "#EEF2FF", color: FB_C }}><i className="fa-brands fa-meta" /></span>
              Meta — Facebook vs Instagram
            </h2>
            <div className="pg-desc">Total column matches Ads Manager · {rl}</div>
          </div>
        </div>
        <div className="cc-head-actions">
          <ViewSwitch current="Meta" onOpen={onOpenCard} />
        </div>
      </div>

      {filterPanel}
      <ProblemBanner problems={problems} />

      {/* ---- teen column: total / FB / IG ---- */}
      <div className="ms-cols">
        <SideBox title="Total (FB + IG)" color="var(--ink)" icon="fa-brands fa-meta" t={all} extra={`${live} live · ${rows.length} campaigns`} />
        <SideBox title="Facebook" color={FB_C} icon="fa-brands fa-facebook-f" t={fb} share={pct(fb.spend, all.spend)} best={cheaper === FB} onOpen={() => onOpenCard(FB)} />
        <SideBox title="Instagram" color={IG_C} icon="fa-brands fa-instagram" t={ig} share={pct(ig.spend, all.spend)} best={cheaper === IG} onOpen={() => onOpenCard(IG)} />
      </div>

      {/* ---- FB vs IG aamne-saamne ---- */}
      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-scale-balanced" />
            <div className="ttl-txt"><b>Facebook vs Instagram</b><span>Like Ads Manager → Breakdown → Platform</span></div>
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="mod-table ms-tbl">
            <thead><tr><th>Metric</th><th className="ta-r fb">Facebook</th><th className="ta-r ig">Instagram</th><th className="ta-r">Total</th></tr></thead>
            <tbody>
              <CmpRow label="Amount spent" f={M(fb.spend)} i={M(ig.spend)} t={M(all.spend)} bold />
              <CmpRow label="Spend share" f={`${pct(fb.spend, all.spend)}%`} i={`${pct(ig.spend, all.spend)}%`} t="100%" />
              <CmpRow label={`Results${all.label ? ` · ${all.label}` : ""}`} f={count(fb.results)} i={count(ig.results)} t={count(all.results)} bold />
              <CmpRow label="Cost per result" f={fb.results ? M(cpl(fb)) : "—"} i={ig.results ? M(cpl(ig)) : "—"} t={all.results ? M(cpl(all)) : "—"} bold
                win={cheaper === FB ? "f" : cheaper === IG ? "i" : ""} />
              <CmpRow label="Leads (Form)" f={count(fb.formLeads)} i={count(ig.formLeads)} t={count(all.formLeads)} />
              <CmpRow label="Messaging conversations started" f={count(fb.chats)} i={count(ig.chats)} t={count(all.chats)} />
              <CmpRow label="Impressions" f={count(fb.impressions)} i={count(ig.impressions)} t={count(all.impressions)} />
              <CmpRow label="CPM" f={fb.impressions ? M(cpm(fb)) : "—"} i={ig.impressions ? M(cpm(ig)) : "—"} t={all.impressions ? M(cpm(all)) : "—"} />
              <CmpRow label="Link clicks" f={count(fb.linkClicks)} i={count(ig.linkClicks)} t={count(all.linkClicks)} />
              <CmpRow label="CTR (link click-through rate)" f={fb.impressions ? `${ctrLink(fb).toFixed(2)}%` : "—"} i={ig.impressions ? `${ctrLink(ig).toFixed(2)}%` : "—"} t={all.impressions ? `${ctrLink(all).toFixed(2)}%` : "—"} />
              <CmpRow label="Clicks (all)" f={count(fb.clicks)} i={count(ig.clicks)} t={count(all.clicks)} />
              <CmpRow label="CTR (all)" f={fb.impressions ? `${ctrAll(fb).toFixed(2)}%` : "—"} i={ig.impressions ? `${ctrAll(ig).toFixed(2)}%` : "—"} t={all.impressions ? `${ctrAll(all).toFixed(2)}%` : "—"} />
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- campaign-wise split ---- */}
      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-bullhorn" />
            <div className="ttl-txt"><b>Campaign-wise split</b><span>Total column = Ads Manager Amount spent / Results / Cost per result</span></div>
          </div>
          <div className="card-tools">
            <select className="form-control mini-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="spend">Highest spend first</option>
              <option value="leads">Most leads first</option>
              <option value="cpl">Lowest CPL first</option>
              <option value="name">By name</option>
            </select>
            <label className="mini-search"><i className="fa-solid fa-magnifying-glass" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></label>
            <span className="cnt">{perCampaign.length}</span>
          </div>
        </div>

        {perCampaign.length ? (
          <div className="tbl-scroll">
            <table className="mod-table ms-tbl">
              <thead>
                <tr>
                  <th rowSpan={2}>Campaign</th>
                  <th rowSpan={2}>Status</th>
                  <th rowSpan={2}>Budget</th>
                  <th colSpan={3} className="grp">Amount spent <span className="th-sub">{rl}</span></th>
                  <th colSpan={3} className="grp">Results</th>
                  <th colSpan={3} className="grp">Cost per result</th>
                  <th rowSpan={2} className="ta-r">ON/OFF</th>
                </tr>
                <tr>
                  <th className="ta-r">Total</th><th className="ta-r fb">FB</th><th className="ta-r ig">IG</th>
                  <th className="ta-r">Total</th><th className="ta-r fb">FB</th><th className="ta-r ig">IG</th>
                  <th className="ta-r">Total</th><th className="ta-r fb">FB</th><th className="ta-r ig">IG</th>
                </tr>
              </thead>
              <tbody>
                {pgCamp.rows.map(({ row, fb: f, ig: i, all: a, blocked }) => (
                  <tr key={row.id}>
                    <td>
                      <div className="ad-name">{row.name}</div>
                      <div className="ad-sub">
                        {row.account ? <span>{row.account}</span> : null}
                        {row.service ? <span>{row.service}</span> : <span className="mut">Select service</span>}
                      </div>
                      {row.issue ? <div className="ms-issue"><i className="fa-solid fa-circle-exclamation" /> {row.issue}</div> : null}
                    </td>
                    <td>
                      {blocked && row.status === "Active"
                        ? <span className="pill pill-off"><span className="dot">●</span>Payment error</span>
                        : <span className={`pill ${statusClass(row.status)}`}><span className="dot">●</span>{row.status}</span>}
                      {row.metaStatus && row.metaStatus !== row.status ? <div className="ad-sync">Meta: {row.metaStatus}</div> : null}
                    </td>
                    <td>{(() => { const b = budgetInfo(row, money); return <>{b.main}{b.sub ? <div className="ms-sub">{b.sub}</div> : null}</>; })()}</td>
                    <td className="ta-r"><b>{M(a.spend)}</b></td>
                    <td className="ta-r fb">{M(f.spend)}<div className="ms-sub">{pct(f.spend, a.spend)}%</div></td>
                    <td className="ta-r ig">{M(i.spend)}<div className="ms-sub">{pct(i.spend, a.spend)}%</div></td>
                    <td className="ta-r"><b>{a.results || a.spend ? count(a.results) : "—"}</b><div className="ms-sub" style={{ whiteSpace: "nowrap" }}>{a.label || row.resultLabel || ""}</div></td>
                    <td className="ta-r fb">{count(f.results)}</td>
                    <td className="ta-r ig">{count(i.results)}</td>
                    <td className="ta-r"><b>{a.results ? M(cpl(a)) : <span className="mut">—</span>}</b></td>
                    <td className="ta-r fb">{f.results ? M(cpl(f)) : <span className="mut">—</span>}</td>
                    <td className="ta-r ig">{i.results ? M(cpl(i)) : <span className="mut">—</span>}</td>
                    <td className="ta-r">
                      {onAds && row.status === "Active" && row.extId ? (
                        <button className="icon-btn ads-btn" type="button" title="View this campaign's ads" onClick={() => onAds(row)}>
                          <i className="fa-solid fa-layer-group" /> Ads
                        </button>
                      ) : null}
                      <button className="icon-btn" type="button" disabled={busyId === row.id}
                        title={row.extId ? (row.status === "Active" ? "Turn OFF (on Meta too)" : "Turn ON (on Meta too)") : "Local only"}
                        onClick={() => onToggle(row)}>
                        <i className={`fa-solid ${busyId === row.id ? "fa-spinner fa-spin" : row.status === "Active" ? "fa-toggle-on" : "fa-toggle-off"}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="fa-bullhorn" text="No Meta campaigns. Connect one from Ad Accounts → Connect Meta Account." />}
        {pgCamp.pager}
      </div>

      {/* ---- din-wise FB / IG ---- */}
      <div className="card">
        <div className="card-head">
          <div className="ttl"><i className="fa-solid fa-calendar-days" />
            <div className="ttl-txt"><b>Day-wise — Facebook vs Instagram</b><span>Blue = Facebook, pink = Instagram</span></div>
          </div>
          <div className="card-tools"><span className="cnt">{days.length} days</span></div>
        </div>
        {days.length ? (
          <div className="db-list">
            {pgDays.rows.map((d) => {
              const zero = d.spend === 0 && d.leads === 0;
              return (
                <div className={`db-row${zero ? " zero" : ""}`} key={d.day}>
                  <div className="db-date">
                    <b>{dayLabel(d.day).split(" ")[0]}</b>
                    <span>{dayLabel(d.day).split(" ")[1]}</span>
                    {d.day === todayISO() ? <em>Today</em> : null}
                  </div>
                  <div className="db-mid">
                    <div className="db-nums">
                      <div className="db-num"><span>Total</span><b>{M(d.spend)}</b></div>
                      <div className="db-num"><span style={{ color: FB_C }}>FB</span><b>{M(d.fb.spend)}</b></div>
                      <div className="db-num"><span style={{ color: IG_C }}>IG</span><b>{M(d.ig.spend)}</b></div>
                      <div className="db-num"><span>Results FB / IG</span><b>{count(d.fb.leads)} / {count(d.ig.leads)}</b></div>
                      <div className="db-num"><span>Cost/result</span><b>{d.leads ? M(d.spend / d.leads) : "—"}</b></div>
                    </div>
                    <div className="ms-day-bar" style={{ width: `${Math.max(2, (d.spend / maxDay) * 100)}%` }}>
                      <i style={{ width: `${pct(d.fb.spend, d.spend)}%`, background: FB_C }} />
                      <i style={{ width: `${pct(d.ig.spend, d.spend)}%`, background: IG_C }} />
                    </div>
                  </div>
                  <div className="db-tag">{zero ? <span className="pill pill-default">No spend</span> : <span className="db-ads">FB {pct(d.fb.spend, d.spend)}% · IG {pct(d.ig.spend, d.spend)}%</span>}</div>
                </div>
              );
            })}
          </div>
        ) : <Empty icon="fa-calendar-days" text="No day-wise list for All time — choose a fixed range." />}
        {pgDays.pager}
      </div>
    </>
  );
}

/* ---------- chhote hisse ---------- */

/* Upar ka switch — Meta / Facebook / Instagram ke beech ek click */
export function ViewSwitch({ current, onOpen }) {
  const opts = [
    { key: "Meta", label: "FB vs IG", icon: "fa-brands fa-meta" },
    { key: FB, label: "Facebook only", icon: "fa-brands fa-facebook-f" },
    { key: IG, label: "Instagram only", icon: "fa-brands fa-instagram" },
  ];
  return (
    <div className="ms-seg">
      {opts.map((o) => (
        <button key={o.key} type="button" className={current === o.key ? "on" : ""} onClick={() => onOpen(o.key)}>
          <i className={o.icon} /> {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProblemBanner({ problems }) {
  if (!problems?.length) return null;
  return (
    <div className="ms-banner">
      <i className="fa-solid fa-triangle-exclamation" />
      <div>
        {problems.map((p) => <div key={p.accountId}><b>{p.name}</b> ({p.accountId}): {p.problem}</div>)}
        <div className="cs-hint">This account's campaigns will show as ON but ads are not running — they are not counted as "Live". Fix it in Ads Manager → Billing &amp; payments; this warning disappears on the next sync.</div>
      </div>
    </div>
  );
}

function SideBox({ title, color, icon, t, share, best, extra, onOpen }) {
  return (
    <div className={`ms-col${onOpen ? " click" : ""}`} onClick={onOpen} style={{ borderTopColor: color }} role={onOpen ? "button" : undefined}>
      <div className="ms-col-h" style={{ color }}><i className={icon} /> {title}
        {best ? <span className="pill pill-active" style={{ marginLeft: "auto" }}>Lower CPL</span> : null}
      </div>
      <div className="ms-col-big">{M(t.spend)}</div>
      <div className="ms-col-sub">{share !== undefined ? `${share}% spend` : extra}</div>
      <div className="ms-col-grid">
        <div><span>Results</span><b>{count(t.results)}</b></div>
        <div><span>Cost/result</span><b>{t.results ? M(t.spend / t.results) : "—"}</b></div>
        <div><span>Leads (Form)</span><b>{count(t.formLeads)}</b></div>
        <div><span>Msg. conv.</span><b>{count(t.chats)}</b></div>
        <div><span>Link clicks</span><b>{count(t.linkClicks)}</b></div>
        <div><span>CTR (link)</span><b>{t.impressions ? `${ctrLink(t).toFixed(2)}%` : "—"}</b></div>
      </div>
      {onOpen ? <div className="pc-go">View {title} only <i className="fa-solid fa-arrow-right" /></div> : null}
    </div>
  );
}

function CmpRow({ label, f, i, t, bold, win }) {
  const W = (s, k) => (win === k ? <span style={{ color: "var(--green)" }}>{s} <i className="fa-solid fa-check" /></span> : s);
  return (
    <tr>
      <td>{bold ? <b>{label}</b> : label}</td>
      <td className="ta-r fb">{bold ? <b>{W(f, "f")}</b> : f}</td>
      <td className="ta-r ig">{bold ? <b>{W(i, "i")}</b> : i}</td>
      <td className="ta-r">{bold ? <b>{t}</b> : t}</td>
    </tr>
  );
}