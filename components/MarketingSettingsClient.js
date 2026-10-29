"use client";

import { usePaged } from "./Pager";
import { useEffect, useMemo, useState } from "react";
import { clearMarketingData, readSettings, writeSettings, readRows, writeRows, uid, readActivity, logActivity } from "../lib/marketing-local";
import { useToast } from "./Toast";

const TABS = [
  { key: "thresholds", label: "Thresholds", icon: "fa-sliders" },
  { key: "automation", label: "Automation", icon: "fa-robot" },
  { key: "integrations", label: "Integrations", icon: "fa-plug-circle-bolt" },
  { key: "compliance", label: "Compliance", icon: "fa-shield-halved" },
  { key: "team", label: "Team", icon: "fa-users-gear" },
];

const DEFAULTS = {
  brandName: "VakilKaro", currency: "INR", timezone: "Asia/Kolkata", defaultOwner: "",
  cplThreshold: "450", walletLow: "5000", cooldownDays: "30", maxAttempts: "3",
  throttlePerDay: "200", throttlePerHour: "200", attribution: "Last Touch", leadSla: "15",
  paymentGateway: "Razorpay",
  cronSync: "Hourly", cronJourney: "Daily 09:00", cronBroadcast: "Every 15 min",
  alertWalletLow: "On", alertCplSpike: "On", alertTokenExpiry: "On",
  alertBudgetExhausted: "On", alertBroadcastFail: "On", alertQueueOverdue: "On",
  alertChannelPanel: "On", alertChannelWa: "On", alertChannelEmail: "Off",
  consentSource: "Website form + Ad lead form",
};

const DND_KEY = "settings__dnd";
const TEAM_KEY = "settings__team";
const JOB_KEY = "settings__jobs";

export default function MarketingSettingsClient() {
  const { show } = useToast();
  const [tab, setTab] = useState("thresholds");
  const [form, setForm] = useState(DEFAULTS);

  useEffect(() => setForm((p) => ({ ...p, ...readSettings() })), []);

  function save(e) {
    e.preventDefault();
    writeSettings(form);
    logActivity({ dataset: "settings", action: "Updated", target: "Growth Settings", detail: `${tab} tab saved` });
    show("Settings saved.", "success");
  }

  function set(k, v) { setForm({ ...form, [k]: v }); }

  return (
    <div className="mod-wrap">
      <div className="pg-head">
        <div>
          <h1 className="pg-title">Settings</h1>
          <div className="pg-desc">Thresholds, automation, integrations, compliance and team — the control room for the whole Growth panel.</div>
        </div>
      </div>

      <div className="hl-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`hl-tab${t.key === tab ? " on" : ""}`} onClick={() => setTab(t.key)}>
            <i className={`fa-solid ${t.icon}`} /> &nbsp;{t.label}
          </button>
        ))}
      </div>

      {tab === "thresholds" ? <Thresholds form={form} set={set} save={save} show={show} /> : null}
      {tab === "automation" ? <Automation form={form} set={set} save={save} show={show} /> : null}
      {tab === "integrations" ? <Integrations /> : null}
      {tab === "compliance" ? <Compliance show={show} /> : null}
      {tab === "team" ? <Team form={form} set={set} save={save} show={show} /> : null}
    </div>
  );
}

/* ---------- 1 · THRESHOLDS ---------- */
function Thresholds({ form, set, save, show }) {
  return (
    <div className="settings-grid">
      <form className="card settings-form-card" onSubmit={save}>
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-sliders" /> &nbsp;Growth Thresholds</div></div>
        <div className="settings-body">
          <div className="grid2">
            <Field label="Brand / Business Name" value={form.brandName} onChange={(v) => set("brandName", v)} />
            <Field label="Default Currency" value={form.currency} onChange={(v) => set("currency", v)} />
            <Field label="CPL Threshold (₹)" type="number" hint="Alert when CPL goes above this" value={form.cplThreshold} onChange={(v) => set("cplThreshold", v)} />
            <Field label="Wallet Low Alert At (₹)" type="number" value={form.walletLow} onChange={(v) => set("walletLow", v)} />
            <Field label="Cooldown (days)" type="number" hint="Days to wait after a touch before contacting again" value={form.cooldownDays} onChange={(v) => set("cooldownDays", v)} />
            <Field label="Max Attempts" type="number" hint="After this: dead pool → archive" value={form.maxAttempts} onChange={(v) => set("maxAttempts", v)} />
            <Field label="Throttle / day" type="number" hint="To avoid a WhatsApp ban" value={form.throttlePerDay} onChange={(v) => set("throttlePerDay", v)} />
            <Field label="Throttle / hour" type="number" value={form.throttlePerHour} onChange={(v) => set("throttlePerHour", v)} />
            <Select label="Attribution Model" hint="Lock once and keep it consistent" value={form.attribution} onChange={(v) => set("attribution", v)} options={["First Touch", "Last Touch", "Linear"]} />
            <Field label="Lead Response SLA (minutes)" type="number" value={form.leadSla} onChange={(v) => set("leadSla", v)} />
            <Field label="Timezone" value={form.timezone} onChange={(v) => set("timezone", v)} />
            <Field label="Default Owner" value={form.defaultOwner} onChange={(v) => set("defaultOwner", v)} />
          </div>
          <button className="btn btn-gold" type="submit"><i className="fa-solid fa-check" /> Save Settings</button>
        </div>
      </form>

      <div className="card settings-form-card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-database" /> &nbsp;Data Mode</div></div>
        <div className="settings-body">
          <div className="data-mode-badge"><i className="fa-solid fa-laptop" /> Local Browser Storage</div>
          <p className="settings-copy">The Growth Panel runs fully without PostgreSQL. Module storage can later move to an API/database tables — the interface stays the same.</p>
          <button className="btn btn-danger" type="button" onClick={() => {
            if (!window.confirm("Clear all local growth records and settings?")) return;
            clearMarketingData(); show("Local growth data cleared.", "success");
          }}><i className="fa-solid fa-trash" /> Clear Local Data</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 2 · AUTOMATION ---------- */
function Automation({ form, set, save, show }) {
  const [jobs, setJobs] = useState([]);
  const pgJobs = usePaged(jobs);
  useEffect(() => {
    const load = () => setJobs(readRows(JOB_KEY));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  function runNow(name) {
    const rows = readRows(JOB_KEY);
    const next = [{ id: uid(), job: name, at: new Date().toISOString(), status: "Success", message: "Manual run queued" }, ...rows].slice(0, 100);
    writeRows(JOB_KEY, next);
    show(`${name} run queued.`, "success");
  }

  const alertKeys = [
    ["alertWalletLow", "Wallet low"],
    ["alertCplSpike", "CPL spike"],
    ["alertTokenExpiry", "Token expiring"],
    ["alertBudgetExhausted", "Budget exhausted"],
    ["alertBroadcastFail", "Broadcast failure"],
    ["alertQueueOverdue", "Queue overdue"],
  ];

  return (
    <>
      <div className="grid2">
        <form className="card settings-form-card" onSubmit={save}>
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-clock" /> &nbsp;Cron Scheduler</div></div>
          <div className="settings-body">
            <Select label="Meta / Google Sync" value={form.cronSync} onChange={(v) => set("cronSync", v)} options={["Every 15 min", "Hourly", "Every 6 hours", "Daily", "Off"]} />
            <Select label="Journey Runs" value={form.cronJourney} onChange={(v) => set("cronJourney", v)} options={["Daily 09:00", "Daily 11:00", "Twice daily", "Hourly", "Off"]} />
            <Select label="Broadcast Dispatch" value={form.cronBroadcast} onChange={(v) => set("cronBroadcast", v)} options={["Every 5 min", "Every 15 min", "Hourly", "Manual only"]} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button className="btn btn-gold" type="submit"><i className="fa-solid fa-check" /> Save</button>
              <button className="btn btn-ghost" type="button" onClick={() => runNow("Meta Sync")}><i className="fa-solid fa-play" /> Run Sync Now</button>
            </div>
          </div>
        </form>

        <div className="card settings-form-card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-bell" /> &nbsp;Alert Rules</div></div>
          <div className="settings-body">
            {alertKeys.map(([k, label]) => (
              <div className="lt-row" key={k}>
                <div className="lt-meta"><div className="lt-name">{label}</div></div>
                <button type="button" className={`toggle ${form[k] === "On" ? "on" : "off"}`} onClick={() => set(k, form[k] === "On" ? "Off" : "On")}>
                  <span className="toggle-knob" /> {form[k] === "On" ? "On" : "Off"}
                </button>
              </div>
            ))}
            <div className="pg-desc" style={{ marginTop: 12, fontWeight: 800, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>Delivery channels</div>
            {[["alertChannelPanel", "In-panel"], ["alertChannelWa", "WhatsApp"], ["alertChannelEmail", "Email"]].map(([k, label]) => (
              <div className="lt-row" key={k}>
                <div className="lt-meta"><div className="lt-name">{label}</div></div>
                <button type="button" className={`toggle ${form[k] === "On" ? "on" : "off"}`} onClick={() => set(k, form[k] === "On" ? "Off" : "On")}>
                  <span className="toggle-knob" /> {form[k] === "On" ? "On" : "Off"}
                </button>
              </div>
            ))}
            <button className="btn btn-gold" type="button" onClick={save} style={{ marginTop: 12 }}><i className="fa-solid fa-check" /> Save Alerts</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-list-check" /> &nbsp;Job Log</div><div className="card-tools"><span className="cnt">{jobs.length} runs</span></div></div>
        {jobs.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Job</th><th>Run At</th><th>Message</th><th>Status</th></tr></thead>
              <tbody>{pgJobs.rows.map((j) => (
                <tr key={j.id}>
                  <td><b>{j.job}</b></td>
                  <td className="hdate">{new Date(j.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{j.message}</td>
                  <td><span className={`pill ${j.status === "Success" ? "pill-active" : "pill-off"}`}>{j.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="mod-empty"><i className="fa-solid fa-list-check" /><p>No job has run yet. Press "Run Sync Now" or let the cron run.</p></div>}
        {pgJobs.pager}
      </div>
    </>
  );
}

/* ---------- 3 · INTEGRATIONS ---------- */
/* Yahan token type karne ke input NAHI hain — jaan-boojh kar.
   Browser me daala hua token localStorage me plain text me jaata hai,
   aur wahan se koi bhi padh sakta hai. Token se tumhare ad account
   se paisa kharch ho sakta hai aur customers ko message ja sakta hai.

   Isliye saare credentials sirf .env.local me rehte hain (server par),
   aur ye tab sirf batata hai kya connect hai aur kya missing hai. */
function Integrations() {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/sync/status")
      .then((r) => r.json())
      .then((j) => { if (j.platforms) setStatus(j.platforms); else setErr(j.error || "Status not found"); })
      .catch(() => setErr("Could not reach the server"));
  }, []);

  const BLOCKS = [
    { key: "meta", title: "Meta Ads", sub: "Facebook + Instagram — one token for both",
      icon: "fa-brands fa-meta", tint: "#E7F0FE", color: "#1877F2",
      keys: ["META_TOKEN", "META_AD_ACCOUNTS", "META_APP_ID", "META_APP_SECRET"],
      where: "Business Settings → Users → System Users → Generate New Token" },
    { key: "google", title: "Google Ads", sub: "YouTube campaigns and spend",
      icon: "fa-brands fa-google", tint: "#FDE8E8", color: "#EA4335",
      keys: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_IDS"],
      where: "Google Ads → Tools → API Centre (approval takes 1–2 weeks)" },
    { key: "whatsapp", title: "WhatsApp Cloud API", sub: "Broadcast, journeys and queue reminders",
      icon: "fa-brands fa-whatsapp", tint: "#E1F5EC", color: "#25D366",
      keys: ["WA_TOKEN", "WA_PHONE_ID", "WA_WABA_ID", "WA_WEBHOOK_VERIFY_TOKEN"],
      where: "Meta Business Manager → WhatsApp Manager → API Setup" },
    { key: "website", title: "Website Leads", sub: "Website forms (enquiries, contact, ODR) — read from the website's Hostinger database",
      icon: "fa-solid fa-globe", tint: "#E1F5F2", color: "#0F766E",
      keys: ["WEBSITE_DB_HOST", "WEBSITE_DB_NAME", "WEBSITE_DB_USER", "WEBSITE_DB_PASSWORD"],
      where: "Hostinger hPanel → Databases → Remote MySQL (host + allow Any Host %)" },
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="ttl">
            <i className="fa-solid fa-plug-circle-bolt" />
            <div className="ttl-txt">
              <b>Connections</b>
              <span>Credentials live only on the server — only status is shown here</span>
            </div>
          </div>
        </div>

        <div className="settings-body">
          {err ? <div className="wa-warn"><i className="fa-solid fa-triangle-exclamation" /><span>{err}</span></div> : null}

          {!status && !err ? <div className="mod-empty" style={{ padding: 24 }}><i className="fa-solid fa-spinner fa-spin" /><p>Checking...</p></div> : null}

          {status ? BLOCKS.map((b) => {
            const st = status[b.key] || { ready: false, missing: b.keys };
            return (
              <div className={`ic-row${st.ready ? " on" : ""}`} key={b.key}>
                <span className="ic-ic" style={{ background: b.tint, color: b.color }}><i className={b.icon} /></span>
                <div className="ic-mid">
                  <div className="ic-top">
                    <b>{b.title}</b>
                    <span className={`pill ${st.ready ? "pill-active" : "pill-off"}`}>
                      <span className="dot">●</span>{st.ready ? "Connected" : "Not connected"}
                    </span>
                    {st.ready && st.accounts ? <span className="pill pill-default">{st.accounts} account{st.accounts === 1 ? "" : "s"}</span> : null}
                    {b.key === "whatsapp" && st.ready ? (
                      <span className={`pill ${st.hasWebhook ? "pill-active" : "pill-default"}`}>
                        {st.hasWebhook ? "Webhook on" : "Webhook off"}
                      </span>
                    ) : null}
                  </div>
                  <div className="ic-sub">{b.sub}</div>

                  {!st.ready && st.missing?.length ? (
                    <div className="ic-missing">
                      <span>Missing:</span>
                      {st.missing.map((k) => <code key={k}>{k}</code>)}
                    </div>
                  ) : null}

                  <div className="ic-where"><i className="fa-solid fa-location-arrow" /> {b.where}</div>
                </div>
              </div>
            );
          }) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-shield-halved" /> &nbsp;Where to put credentials</div></div>
        <div className="settings-body">
          <p className="settings-copy" style={{ marginTop: 0 }}>
            In the project folder, create a <code>.env.local</code> file (<code>.env.example</code> is the template) and fill in the values. Then restart the server — <code>.env</code> is read only at startup; saving the file does not apply it automatically.
          </p>
          <p className="settings-copy">
            <b>There is intentionally no option to type a token in the panel.</b> A token typed into the browser is stored in localStorage as plain text, where anyone can read it — that token can spend money from your ad account and send messages to customers.
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------- 4 · COMPLIANCE ---------- */
function Compliance({ show }) {
  const [dnd, setDnd] = useState([]);
  const [audit, setAudit] = useState([]);
  const pgDnd = usePaged(dnd);
  const pgAudit = usePaged(audit);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const load = () => { setDnd(readRows(DND_KEY)); setAudit(readActivity()); };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  function addDnd(e) {
    e.preventDefault();
    const p = String(phone).replace(/\D/g, "").slice(-10);
    if (p.length < 10) { show("Enter a 10-digit number.", "error"); return; }
    if (dnd.some((r) => r.phone === p)) { show("This number is already in DND.", "error"); return; }
    const next = [{ id: uid(), phone: p, reason: reason || "Manual DND", at: new Date().toISOString() }, ...dnd];
    writeRows(DND_KEY, next);
    logActivity({ dataset: DND_KEY, action: "Created", target: p, detail: "Added to DND registry" });
    setPhone(""); setReason("");
    show("Number added to the DND list.", "success");
  }

  function removeDnd(row) {
    if (!window.confirm("Remove from DND?")) return;
    writeRows(DND_KEY, dnd.filter((r) => r.id !== row.id));
    logActivity({ dataset: DND_KEY, action: "Deleted", target: row.phone, detail: "Removed from DND registry" });
    show("Removed from DND.", "success");
  }

  return (
    <>
      <div className="grid2">
        <form className="card settings-form-card" onSubmit={addDnd}>
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-ban" /> &nbsp;Add to DND</div></div>
          <div className="settings-body">
            <p className="settings-copy" style={{ marginTop: 0 }}>TRAI compliance — broadcast or journey messages will never go to these numbers. For a legal-tech company this is not optional.</p>
            <Field label="Phone" value={phone} onChange={setPhone} />
            <Field label="Reason" value={reason} onChange={setReason} />
            <button className="btn btn-gold" type="submit"><i className="fa-solid fa-plus" /> Add to DND</button>
          </div>
        </form>

        <div className="card settings-form-card">
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-shield-halved" /> &nbsp;Suppression Rules</div></div>
          <div className="settings-body">
            {[
              ["Existing customers", "Do not show ads to existing customers — saves money"],
              ["DND registry", "Auto-excluded from every broadcast and journey"],
              ["Max attempts crossed", "Suppress leads that went to the dead pool"],
              ["Cooldown active", "No touch until cooldown ends"],
            ].map(([t, s]) => (
              <div className="lt-row" key={t}>
                <div className="lt-ic" style={{ background: "var(--green-bg)", color: "var(--green)" }}><i className="fa-solid fa-check" /></div>
                <div className="lt-meta"><div className="lt-name">{t}</div><div className="lt-sub">{s}</div></div>
                <span className="paid-badge pb-paid">Enforced</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-ban" /> &nbsp;DND Registry</div><div className="card-tools"><span className="cnt">{dnd.length} numbers</span></div></div>
        {dnd.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Phone</th><th>Reason</th><th>Added</th><th className="ta-r">Actions</th></tr></thead>
              <tbody>{pgDnd.rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.phone}</b></td>
                  <td>{r.reason}</td>
                  <td className="hdate">{new Date(r.at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
                  <td><div className="row-actions"><button className="icon-btn danger" type="button" onClick={() => removeDnd(r)}><i className="fa-solid fa-trash" /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="mod-empty"><i className="fa-solid fa-ban" /><p>DND list is empty.</p></div>}
        {pgDnd.pager}
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-clipboard-list" /> &nbsp;Audit Log</div><div className="card-tools"><span className="cnt">{audit.length} entries</span></div></div>
        {audit.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>When</th><th>Action</th><th>Record</th><th>Module</th><th>Detail</th></tr></thead>
              <tbody>{pgAudit.rows.map((r) => (
                <tr key={r.id}>
                  <td className="hdate">{new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td><span className={`pill ${r.action === "Deleted" ? "pill-off" : r.action === "Created" ? "pill-active" : "pill-default"}`}>{r.action}</span></td>
                  <td><b>{r.target || "—"}</b></td>
                  <td>{String(r.dataset || "").replace(/__/g, " · ")}</td>
                  <td>{r.detail || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="mod-empty"><i className="fa-solid fa-clipboard-list" /><p>Who changed what — everything is recorded here.</p></div>}
        {pgAudit.pager}
      </div>
    </>
  );
}

/* ---------- 5 · TEAM ---------- */
const ROLE_PRESETS = {
  "Growth Head": "Full access — campaigns, wallet, audience, outreach, analytics, settings",
  "Ads Manager": "Campaigns, Ad Wallet, Ad Accounts, Analytics",
  "Remarketing Executive": "Win-back Queue only — pool and outreach read-only",
  "Analyst": "Analytics and Dashboard read-only",
};
const MODULE_LIST = ["Dashboard", "Ad Accounts", "Campaigns", "Ad Wallet", "Lead Capture", "Audience", "Outreach", "Win-back Queue", "Analytics", "Settings"];

function Team({ form, set, save, show }) {
  const [members, setMembers] = useState([]);
  const pgMem = usePaged(members);
  const [draft, setDraft] = useState({ name: "", email: "", role: "Ads Manager", status: "Active" });
  const [openPerms, setOpenPerms] = useState(null);

  useEffect(() => {
    const load = () => setMembers(readRows(TEAM_KEY));
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  function addMember(e) {
    e.preventDefault();
    if (!draft.name.trim()) { show("Enter a name.", "error"); return; }
    const perms = {};
    MODULE_LIST.forEach((m) => { perms[m] = draft.role === "Growth Head" ? "Full" : "View"; });
    const next = [{ id: uid(), ...draft, perms, at: new Date().toISOString() }, ...members];
    writeRows(TEAM_KEY, next);
    logActivity({ dataset: TEAM_KEY, action: "Created", target: draft.name, detail: `Role: ${draft.role}` });
    setDraft({ name: "", email: "", role: "Ads Manager", status: "Active" });
    show("Team member added.", "success");
  }

  function removeMember(row) {
    if (!window.confirm("Remove this member?")) return;
    writeRows(TEAM_KEY, members.filter((r) => r.id !== row.id));
    logActivity({ dataset: TEAM_KEY, action: "Deleted", target: row.name, detail: "Removed from team" });
    show("Member removed.", "success");
  }

  function setPerm(memberId, moduleName, level) {
    const next = members.map((m) => m.id === memberId ? { ...m, perms: { ...(m.perms || {}), [moduleName]: level } } : m);
    writeRows(TEAM_KEY, next);
  }

  const current = useMemo(() => members.find((m) => m.id === openPerms), [members, openPerms]);

  return (
    <>
      <div className="grid2">
        <form className="card settings-form-card" onSubmit={addMember}>
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-user-plus" /> &nbsp;Add Team Member</div></div>
          <div className="settings-body">
            <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Email" type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
            <Select label="Role" value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} options={Object.keys(ROLE_PRESETS)} hint={ROLE_PRESETS[draft.role]} />
            <Select label="Status" value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} options={["Active", "Inactive"]} />
            <button className="btn btn-gold" type="submit"><i className="fa-solid fa-plus" /> Add Member</button>
          </div>
        </form>

        <form className="card settings-form-card" onSubmit={save}>
          <div className="card-head"><div className="ttl"><i className="fa-solid fa-user" /> &nbsp;My Profile</div></div>
          <div className="settings-body">
            <Field label="Display Name" value={form.brandName} onChange={(v) => set("brandName", v)} />
            <Field label="Default Owner (auto-assign)" value={form.defaultOwner} onChange={(v) => set("defaultOwner", v)} />
            <Field label="Timezone" value={form.timezone} onChange={(v) => set("timezone", v)} />
            <p className="settings-copy">Passwords and active sessions/devices are managed by the login system. Notifications on/off is in the Automation tab.</p>
            <button className="btn btn-gold" type="submit"><i className="fa-solid fa-check" /> Save Profile</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head"><div className="ttl"><i className="fa-solid fa-users-gear" /> &nbsp;Team &amp; Roles</div><div className="card-tools"><span className="cnt">{members.length} member{members.length === 1 ? "" : "s"}</span></div></div>
        {members.length ? (
          <div className="tbl-scroll">
            <table className="mod-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Status</th><th className="ta-r">Actions</th></tr></thead>
              <tbody>{pgMem.rows.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b></td>
                  <td>{m.email || "—"}</td>
                  <td><span className="pill pill-default">{m.role}</span></td>
                  <td>{ROLE_PRESETS[m.role] || "Custom"}</td>
                  <td><span className={`pill ${m.status === "Active" ? "pill-active" : "pill-off"}`}>{m.status}</span></td>
                  <td><div className="row-actions">
                    <button className="icon-btn" type="button" title="Permissions" onClick={() => setOpenPerms(m.id)}><i className="fa-solid fa-shield-halved" /></button>
                    <button className="icon-btn danger" type="button" title="Remove" onClick={() => removeMember(m)}><i className="fa-solid fa-trash" /></button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="mod-empty"><i className="fa-solid fa-users-gear" /><p>No team members yet. Add one above.</p></div>}
        {pgMem.pager}
      </div>

      {current ? (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenPerms(null); }}>
          <div className="modal marketing-modal">
            <div className="modal-head">
              <div className="mt"><i className="fa-solid fa-shield-halved" /> {current.name} · Permissions</div>
              <button className="modal-x" onClick={() => setOpenPerms(null)}><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className="modal-body">
              <div className="legend" style={{ marginBottom: 12 }}>
                <span><i className="dot none" /> None</span>
                <span><i className="dot view" /> View</span>
                <span><i className="dot edit" /> Edit</span>
                <span><i className="dot full" /> Full</span>
              </div>
              {MODULE_LIST.map((mod) => (
                <div className="lt-row" key={mod}>
                  <div className="lt-meta"><div className="lt-name">{mod}</div></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["None", "View", "Edit", "Full"].map((lvl) => (
                      <button key={lvl} type="button"
                        className={`hl-tab${(current.perms?.[mod] || "None") === lvl ? " on" : ""}`}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => setPerm(current.id, mod, lvl)}>{lvl}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="marketing-modal-footer">
              <button className="btn btn-gold" type="button" onClick={() => { setOpenPerms(null); show("Permissions saved.", "success"); }}><i className="fa-solid fa-check" /> Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ---------- shared inputs ---------- */
function Field({ label, value, onChange, type = "text", hint }) {
  return (
    <label className="fg">
      <span className="form-label">{label}</span>
      <input className="form-control" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="fg-note">{hint}</span> : null}
    </label>
  );
}

function Select({ label, value, onChange, options, hint }) {
  return (
    <label className="fg">
      <span className="form-label">{label}</span>
      <select className="form-control" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint ? <span className="fg-note">{hint}</span> : null}
    </label>
  );
}