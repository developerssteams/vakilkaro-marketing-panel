/* ============================================================
   lib/marketing-validate.js
   Form validation — sirf "required" se kaam nahi chalta.
   Har rule wahi hai jo galat data ko DB tak pahunchne se rokta hai.
   ============================================================ */

/* Meta ad account: act_ + digits. Google: 123-456-7890. */
export function validateAccountId(platform, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (platform === "Meta") {
    if (!/^act_\d{6,}$/.test(v)) return "Meta account ID must start with `act_` followed by numbers (act_123456789).";
  } else if (platform === "Google Ads") {
    if (!/^\d{3}-\d{3}-\d{4}$/.test(v)) return "Google customer ID format is 123-456-7890.";
  }
  return "";
}

export function validateDigitsOnly(value, label, min = 8, max = 20) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (!/^\d+$/.test(v)) return `${label} must contain numbers only.`;
  if (v.length < min || v.length > max) return `${label} must be ${min}-${max} digits.`;
  return "";
}

export function validateFutureDate(value, label) {
  const v = String(value || "").trim();
  if (!v) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (new Date(v) < today) return `${label} cannot be in the past.`;
  return "";
}

export function validatePhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length < 10) return "Enter a 10-digit mobile number.";
  const ten = d.slice(-10);
  if (!/^[6-9]/.test(ten)) return "Mobile number must start with 6-9.";
  return "";
}

export function validateEmail(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "Enter a valid email.";
  return "";
}

export function validateUrl(value, label = "URL") {
  const v = String(value || "").trim();
  if (!v) return "";
  if (!/^https?:\/\/.+\..+/.test(v)) return `${label} must start with https://.`;
  return "";
}

export function validateRange(value, label, min, max) {
  const v = String(value || "").trim();
  if (v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (min !== undefined && n < min) return `${label} cannot be less than ${min}.`;
  if (max !== undefined && n > max) return `${label} cannot be more than ${max.toLocaleString("en-IN")}.`;
  return "";
}

export function validateLength(value, label, min, max) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  if (max && v.length > max) return `${label} cannot be longer than ${max} characters.`;
  return "";
}

export function validateJson(value, label = "Field map") {
  const v = String(value || "").trim();
  if (!v) return "";
  try { JSON.parse(v); return ""; }
  catch { return `${label} is not valid JSON.`; }
}

/* Ek field pe jo bhi rules lage hain, sab chalao aur pehla error lauta do. */
export function runFieldRules(field, form) {
  const value = form[field.key];
  const rules = field.rules || [];
  for (const rule of rules) {
    let err = "";
    switch (rule.type) {
      case "accountId":   err = validateAccountId(form.platform, value); break;
      case "digits":      err = validateDigitsOnly(value, field.label, rule.min, rule.max); break;
      case "futureDate":  err = validateFutureDate(value, field.label); break;
      case "phone":       err = validatePhone(value); break;
      case "email":       err = validateEmail(value); break;
      case "url":         err = validateUrl(value, field.label); break;
      case "range":       err = validateRange(value, field.label, rule.min, rule.max); break;
      case "length":      err = validateLength(value, field.label, rule.min, rule.max); break;
      case "json":        err = validateJson(value, field.label); break;
      default: break;
    }
    if (err) return err;
  }
  return "";
}

/* Poora form — required + rules + duplicate check. */
export function validateForm(fields, form, rows, editingId) {
  const errors = {};
  for (const f of fields) {
    if (f.hideWhen && f.hideWhen(form)) continue;
    if (f.required && !String(form[f.key] ?? "").trim()) {
      errors[f.key] = `${f.label} is required.`;
      continue;
    }
    const err = runFieldRules(f, form);
    if (err) { errors[f.key] = err; continue; }
    if (f.unique) {
      const val = String(form[f.key] ?? "").trim().toLowerCase();
      if (val) {
        const scope = f.uniqueWith ? (r) => String(r[f.uniqueWith] || "") === String(form[f.uniqueWith] || "") : () => true;
        const clash = (rows || []).some((r) => r.id !== editingId && scope(r) && String(r[f.key] ?? "").trim().toLowerCase() === val);
        if (clash) errors[f.key] = `This ${f.label.toLowerCase()} is already in use.`;
      }
    }
  }
  return errors;
}

/* Token ka haal expiry date se nikalta hai — manual dropdown hamesha stale
   reh jaata hai, isliye compute kiya jaata hai. */
export function tokenState(row) {
  if (String(row.status || "") === "Disabled") return { label: "Disconnected", cls: "pill-off", days: null };
  /* Meta account System User token se juda ho to token .env me hai —
     row me koi token nahi hota, phir bhi Live hai. */
  if (!row.accessToken && !row.tokenExpiry && !row.connectedVia) return { label: "Not Connected", cls: "pill-default", days: null };
  if (!row.tokenExpiry) return { label: "Live", cls: "pill-active", days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(row.tokenExpiry);
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return { label: "Expired", cls: "pill-off", days };
  if (days <= 10) return { label: `Expiring · ${days}d`, cls: "pill-default", days };
  return { label: "Live", cls: "pill-active", days };
}
