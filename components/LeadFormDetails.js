"use client";

/* ============================================================
   components/LeadFormDetails.js — ek lead form ke sawaal (columns)
   Lead Forms tab aur Campaigns → Ads → "View form details" dono
   yahi dikhate hain.
   ============================================================ */

export const TYPE_LABEL = {
  FULL_NAME: "Full name", FIRST_NAME: "First name", LAST_NAME: "Last name",
  EMAIL: "Email", PHONE: "Phone number", WORK_EMAIL: "Work email", WORK_PHONE_NUMBER: "Work phone",
  CITY: "City", STATE: "State", PROVINCE: "Province", ZIP: "PIN code", POST_CODE: "PIN code", COUNTRY: "Country",
  STREET_ADDRESS: "Street address", DOB: "Date of birth", GENDER: "Gender", MARITIAL_STATUS: "Marital status",
  RELATIONSHIP_STATUS: "Relationship status", JOB_TITLE: "Job title", COMPANY_NAME: "Company name",
  MILITARY_STATUS: "Military status", DATE_TIME: "Date & time", STORE_LOOKUP: "Store", SLIDER: "Slider",
  CUSTOM: "Custom question", USER_PROVIDED_PHONE_NUMBER: "Phone number",
};
export const TYPE_ICON = {
  FULL_NAME: "fa-user", FIRST_NAME: "fa-user", LAST_NAME: "fa-user", EMAIL: "fa-envelope", WORK_EMAIL: "fa-envelope",
  PHONE: "fa-phone", WORK_PHONE_NUMBER: "fa-phone", CITY: "fa-city", STATE: "fa-map", ZIP: "fa-location-dot",
  POST_CODE: "fa-location-dot", COUNTRY: "fa-earth-asia", STREET_ADDRESS: "fa-house", DOB: "fa-cake-candles",
  GENDER: "fa-venus-mars", JOB_TITLE: "fa-briefcase", COMPANY_NAME: "fa-building", DATE_TIME: "fa-calendar",
  CUSTOM: "fa-pen-to-square",
};
export const OBJ = { OUTCOME_LEADS: "Leads", OUTCOME_ENGAGEMENT: "Engagement", OUTCOME_AWARENESS: "Awareness", OUTCOME_TRAFFIC: "Traffic", OUTCOME_SALES: "Sales", OUTCOME_APP_PROMOTION: "App promotion", LEAD_GENERATION: "Leads", MESSAGES: "Messages" };

export function typeText(q) {
  if (q.type === "CUSTOM") return q.options.length ? `Multiple choice (${q.options.length})` : "Short answer";
  return TYPE_LABEL[q.type] || String(q.type || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function LeadFormDetails({ fid, f: form, usedBy = [] }) {
  const f = form || { id: fid, error: "Form details not loaded" };
  return (
                  <div className="lf-form">
                    <div className="lf-form-h">
                      <span className="lf-form-ic"><i className="fa-solid fa-rectangle-list" /></span>
                      <div className="lf-form-tt">
                        <b>{f.name || `Form ${fid}`}</b>
                        <div className="lf-sub">
                          {f.status ? <span className={`pill ${f.status === "ACTIVE" ? "pill-active" : "pill-default"}`}>{f.status === "ACTIVE" ? "Active" : f.status.toLowerCase()}</span> : null}
                          <span>ID {fid}</span>
                          {f.page ? <span><i className="fa-brands fa-facebook" /> {f.page}</span> : null}
                          {f.locale ? <span>{f.locale}</span> : null}
                          {f.questions ? <span>{f.questions.length} question{f.questions.length === 1 ? "" : "s"}</span> : null}
                        </div>
                      </div>
                      {typeof f.leadsCount === "number" ? <div className="lf-leads"><b>{f.leadsCount.toLocaleString("en-IN")}</b><span>leads (all time)</span></div> : null}
                    </div>

                    {f.error ? <div className="lf-err warn"><i className="fa-solid fa-lock" /> {f.error} — the token needs access to this form's Page (add the Page token in META_PAGE_TOKENS).</div> : (
                      <div className="tbl-scroll lf-tw">
                        <table className="mod-table lf-q">
                          <thead><tr><th>#</th><th>Question (column)</th><th>Type</th><th>Options</th><th>Key</th></tr></thead>
                          <tbody>
                            {f.questions.map((x, i) => (
                              <tr key={`${x.key}-${i}`}>
                                <td className="mut">{i + 1}</td>
                                <td><span className="lf-qn"><i className={`fa-solid ${TYPE_ICON[x.type] || "fa-circle-question"}`} /> {x.label || TYPE_LABEL[x.type] || x.key}</span>{x.conditional ? <span className="lf-tag">conditional</span> : null}</td>
                                <td><span className={`lf-type${x.type === "CUSTOM" ? " custom" : ""}`}>{typeText(x)}</span></td>
                                <td className="lf-opts">{x.options.length ? x.options.map((o) => <span key={o}>{o}</span>) : <em className="lf-none">—</em>}</td>
                                <td><code>{x.key}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!f.error ? (
                      <details className="lf-more">
                        <summary>Intro, thank-you page and ads using this form</summary>
                        <div className="lf-more-b">
                          {usedBy.length ? <div><span>Used by</span><b>{usedBy.map((a) => a.name).join(", ")}</b></div> : null}
                          {f.intro?.title ? <div><span>Intro headline</span><b>{f.intro.title}</b>{f.intro.content?.length ? <em>{f.intro.content.join(" · ")}</em> : null}</div> : null}
                          {f.thankYou ? <div><span>Thank-you page</span><b>{f.thankYou.title || "—"}</b>{f.thankYou.body ? <em>{f.thankYou.body}</em> : null}{f.thankYou.button ? <em>Button: {f.thankYou.button}{f.thankYou.url ? ` → ${f.thankYou.url}` : ""}</em> : null}</div> : null}
                          {f.privacy ? <div><span>Privacy policy</span><a href={f.privacy} target="_blank" rel="noreferrer">{f.privacy}</a></div> : null}
                          {f.created ? <div><span>Created</span><b>{new Date(f.created).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b></div> : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
  );
}
