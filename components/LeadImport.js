"use client";

/* ============================================================
   components/LeadImport.js — bahar ki leads CSV se panel me

   Lead Capture → All Leads → "Import Leads".
   Kisi bhi jagah ki leads (JustDial, website, Excel sheet, purana CRM)
   CSV file se aa jaati hain. Column ke naam alag hon to bhi chalega —
   "Full Name", "Mobile", "Phone Number", "Date" sab pehchaane jaate hain.
   Excel file ho to Excel me File → Save As → CSV karke daalo.

   Pehle preview dikhta hai, phir Import. Jo number panel me pehle se
   hai woh by default nahi aata (leads delete nahi hoti, isliye kachra
   na bhare).
   ============================================================ */

import { useMemo, useRef, useState } from "react";
import { uid, logActivity } from "../lib/marketing-local";
import { digits, todayISO } from "./ModuleParts";

const SOURCES = ["Meta", "Facebook", "Instagram", "Google", "Website", "WhatsApp", "Referral", "Marketplace", "Other"];

/* Column ke naam → panel ka field */
const ALIASES = {
  name: ["name", "full name", "fullname", "full_name", "lead name", "customer name", "client name", "customer", "client", "first name"],
  phone: ["phone", "phone number", "phone_number", "phone no", "mobile", "mobile number", "mobile no", "mobile_number", "contact", "contact number", "number", "whatsapp", "whatsapp number", "cell"],
  email: ["email", "email address", "e-mail", "email id", "mail"],
  city: ["city", "location", "town", "district"],
  state: ["state"],
  source: ["source", "lead source", "platform", "channel"],
  campaign: ["campaign", "campaign name", "campaign_name", "ad campaign"],
  adName: ["ad", "ad name", "ad_name"],
  service: ["service", "services", "requirement", "interested in", "category", "product", "case type", "matter"],
  receivedAt: ["date", "received on", "received at", "receivedat", "created", "created at", "created_time", "created time", "lead date", "enquiry date", "inquiry date", "timestamp", "submitted on", "time"],
  assignedTo: ["assigned to", "assigned", "owner", "agent", "executive", "lead owner"],
  stage: ["stage", "lead stage"],
  status: ["status", "lead status"],
  note: ["note", "notes", "remark", "remarks", "message", "comment", "comments", "query", "description"],
};
const norm = (s) => String(s || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
const ALIAS_MAP = Object.fromEntries(Object.entries(ALIASES).flatMap(([k, list]) => list.map((a) => [norm(a), k])));

/* CSV padhna — quotes ke andar comma / new line bhi sahi */
function parseCsv(text) {
  const t = String(text || "").replace(/^\uFEFF/, "");
  const first = t.split(/\r?\n/)[0] || "";
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

/* 10 digit Indian number — +91 / 0 hata ke */
function cleanPhone(v) {
  let d = digits(String(v || "").replace(/^p:/i, ""));
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  else if (d.length > 10) d = d.slice(-10);
  return d;
}

/* Date — 2026-10-07, 07/10/2026, 07-10-2026, 7 Oct 2026, ISO time sab */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function cleanDate(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const z = (n) => String(n).padStart(2, "0");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${z(m[2])}-${z(m[1])}`; }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${z(MON[m[2].toLowerCase()])}-${z(m[1])}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const SAMPLE = "Name,Phone,Email,City,Source,Campaign,Service,Date,Notes\nRahul Sharma,9876543210,rahul@example.com,Delhi,Website,,Divorce,07/10/2026,Called from website form\nPriya Verma,+91 98123 45678,,Jaipur,Referral,,Property,2026-10-06,\n";

export default function LeadImport({ rows, fields, onDone, onClose, show }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);   /* { head, body } */
  const [defSource, setDefSource] = useState("Other");
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const serviceOpts = useMemo(() => (fields.find((f) => f.key === "service")?.options || []), [fields]);

  function pick(f) {
    setErr(""); setData(null); setFile(f || null);
    if (!f) return;
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) { setErr("Please choose a CSV file. Excel file? In Excel: File → Save As → CSV, then choose that file."); return; }
    if (f.size > 5 * 1024 * 1024) { setErr("File is larger than 5 MB — split it into smaller files."); return; }
    const r = new FileReader();
    r.onload = () => {
      const all = parseCsv(r.result);
      if (all.length < 2) { setErr("No leads found — the file needs a header row and at least one lead."); return; }
      setData({ head: all[0], body: all.slice(1) });
    };
    r.onerror = () => setErr("Could not read this file.");
    r.readAsText(f);
  }

  /* Column → field */
  const mapping = useMemo(() => {
    if (!data) return [];
    const used = new Set();
    return data.head.map((h) => {
      const k = ALIAS_MAP[norm(h)];
      if (!k || used.has(k)) return null;
      used.add(k); return k;
    });
  }, [data]);

  /* Har row → lead, aur kaun aayega / kaun nahi */
  const plan = useMemo(() => {
    if (!data) return null;
    const have = new Set(rows.map((r) => digits(r.phone)).filter(Boolean).map((d) => d.slice(-10)));
    const seen = new Set();
    const out = []; let skipped = 0; let dupPanel = 0; let dupFile = 0;
    data.body.forEach((cells) => {
      const v = {};
      mapping.forEach((k, i) => { if (k) v[k] = String(cells[i] ?? "").trim(); });
      if (!v.name && !v.phone) { skipped += 1; return; }
      const phone = cleanPhone(v.phone);
      const inPanel = phone && have.has(phone);
      const inFile = phone && seen.has(phone);
      if (inPanel) dupPanel += 1;
      if (inFile) dupFile += 1;
      if (skipDup && (inPanel || inFile)) return;
      if (phone) seen.add(phone);
      const src = SOURCES.find((s) => s.toLowerCase() === String(v.source || "").toLowerCase()) || v.source || defSource;
      const svc = serviceOpts.find((s) => s.toLowerCase() === String(v.service || "").toLowerCase()) || v.service || "";
      out.push({
        name: v.name || (phone ? `Lead ${phone.slice(-4)}` : "Lead"),
        phone, email: v.email || "", city: v.city || "", state: v.state || "",
        source: src, campaign: v.campaign || "", adName: v.adName || "", service: svc,
        receivedAt: cleanDate(v.receivedAt) || todayISO(),
        assignedTo: v.assignedTo || "",
        stage: v.stage || "New", status: v.status || "Received",
        flag: inPanel || inFile ? "Duplicate" : "Clean",
        note: v.note || "",
      });
    });
    return { out, skipped, dupPanel, dupFile, total: data.body.length };
  }, [data, mapping, rows, skipDup, defSource, serviceOpts]);

  const found = mapping.filter(Boolean);
  const missingKey = data && !found.includes("name") && !found.includes("phone");

  function doImport() {
    if (!plan?.out.length) return;
    setBusy(true);
    const now = new Date().toISOString();
    const batch = `imp-${Date.now()}`;
    const fresh = plan.out.map((l) => ({ id: uid(), ...l, importBatch: batch, importFile: file?.name || "", importedAt: now, createdAt: now, updatedAt: now }));
    logActivity({ dataset: "lead-capture__inbox-log", action: "Imported", target: file?.name || "CSV", detail: `${fresh.length} leads imported${plan.skipped ? ` · ${plan.skipped} empty rows skipped` : ""}${skipDup && plan.dupPanel + plan.dupFile ? ` · ${plan.dupPanel + plan.dupFile} duplicate numbers skipped` : ""}` });
    onDone(fresh);
    show(`${fresh.length} lead${fresh.length === 1 ? "" : "s"} imported.`, "success");
    setBusy(false);
  }

  function sample() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv;charset=utf-8;" }));
    a.download = "leads-import-sample.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const LABEL = { name: "Name", phone: "Phone", email: "Email", city: "City", state: "State", source: "Source", campaign: "Campaign", adName: "Ad", service: "Service", receivedAt: "Date", assignedTo: "Assigned To", stage: "Stage", status: "Status", note: "Notes" };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal marketing-modal li-modal" role="dialog" aria-label="Import leads">
        <div className="modal-head">
          <div className="mt"><i className="fa-solid fa-file-import" /> Import Leads</div>
          <button className="modal-x" type="button" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body li-body">
          <label className={`li-drop${file ? " has" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <i className={`fa-solid ${file ? "fa-file-csv" : "fa-cloud-arrow-up"}`} />
            <b>{file ? file.name : "Choose a CSV file or drop it here"}</b>
            <span>{file ? `${plan?.total ?? 0} rows found · click to change` : "Leads from anywhere — website, JustDial, Excel sheet, old CRM"}</span>
          </label>
          <div className="li-help">
            <span><i className="fa-solid fa-circle-info" /> Needs at least a <b>Name</b> or <b>Phone</b> column. Excel file? Save it as CSV first.</span>
            <button type="button" className="li-link" onClick={sample}><i className="fa-solid fa-download" /> Sample CSV</button>
          </div>

          {err ? <div className="li-err"><i className="fa-solid fa-triangle-exclamation" /> {err}</div> : null}
          {missingKey ? <div className="li-err"><i className="fa-solid fa-triangle-exclamation" /> No Name or Phone column found. Rename the column to "Name" or "Phone" and choose the file again.</div> : null}

          {data && !missingKey ? (
            <>
              <div className="li-cols">
                <span className="li-k">Columns matched</span>
                {data.head.map((h, i) => (
                  <em key={`${h}-${i}`} className={mapping[i] ? "ok" : "no"} title={mapping[i] ? `→ ${LABEL[mapping[i]]}` : "Not used"}>
                    {mapping[i] ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-minus" />} {h || `Column ${i + 1}`}{mapping[i] && norm(h) !== norm(LABEL[mapping[i]]) ? <small> → {LABEL[mapping[i]]}</small> : null}
                  </em>
                ))}
              </div>

              <div className="li-opts">
                <label className="fg">
                  <span className="form-label">Source (when the file has none)</span>
                  <select className="form-control" value={defSource} onChange={(e) => setDefSource(e.target.value)}>
                    {SOURCES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label className="li-check">
                  <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                  <span>Skip numbers already in the panel<small>Leads can't be deleted later, so keep this on</small></span>
                </label>
              </div>

              <div className="li-sum">
                <div className="ok"><b>{plan.out.length}</b><span>will be imported</span></div>
                <div><b>{plan.dupPanel}</b><span>already in panel{skipDup ? " (skipped)" : ""}</span></div>
                <div><b>{plan.dupFile}</b><span>repeated in file{skipDup ? " (skipped)" : ""}</span></div>
                <div><b>{plan.skipped}</b><span>empty rows skipped</span></div>
              </div>

              {plan.out.length ? (
                <div className="li-prev">
                  <table>
                    <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Source</th><th>Service</th></tr></thead>
                    <tbody>
                      {plan.out.slice(0, 5).map((l, i) => (
                        <tr key={i}>
                          <td>{l.receivedAt}</td>
                          <td>{l.name}{l.flag === "Duplicate" ? <span className="li-dup">Duplicate</span> : null}</td>
                          <td>{l.phone ? `+91 ${l.phone}` : "—"}</td>
                          <td>{l.source}</td>
                          <td>{l.service || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.out.length > 5 ? <div className="li-more">+ {plan.out.length - 5} more</div> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="marketing-modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-gold" type="button" disabled={busy || !plan?.out.length || missingKey} onClick={doImport}>
            <i className="fa-solid fa-file-import" /> {plan?.out.length ? `Import ${plan.out.length} lead${plan.out.length === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
