"use client";

/* ============================================================
   components/WalletBalance.js
   Ad Wallet → Balance. Accounts Ad Accounts module se apne aap
   aate hain, aur balance/burn ledger se calculate hote hain —
   koi manual entry nahi, isliye number kabhi galat nahi hota.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { readRows, writeRows, uid, logActivity, readSettings } from "../lib/marketing-local";
import { tokenState } from "../lib/marketing-validate";
import { num, money, count, todayISO, FormModal, Empty } from "./ModuleParts";

const LEDGER = "ad-wallet__ledger";
const ACCOUNTS = "ad-accounts__accounts";
const METHODS = "ad-wallet__payment-methods";
const DAILY = "campaigns__daily-stats";

export default function WalletBalance({ tab, show }) {
  const [accounts, setAccounts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [methods, setMethods] = useState([]);
  const [daily, setDaily] = useState([]);
  const [settings, setSettings] = useState({});
  const [recharge, setRecharge] = useState(null);

  useEffect(() => {
    const load = () => {
      setAccounts(readRows(ACCOUNTS));
      setLedger(readRows(LEDGER));
      setMethods(readRows(METHODS));
      setDaily(readRows(DAILY));
      setSettings(readSettings());
    };
    load();
    window.addEventListener("vk-marketing-updated", load);
    return () => window.removeEventListener("vk-marketing-updated", load);
  }, []);

  const lowAt = num(settings.walletLow) || 5000;

  const cards = useMemo(() => accounts.map((a) => {
    const mine = ledger.filter((l) => String(l.account || "") === String(a.name || ""));
    const posted = mine.filter((l) => (l.status || "Posted") === "Posted");
    /* Paid = sirf payments (Credit). Refund paisa wapas aana hai — balance
       me judta hai, "paid" me nahi. Payment History bhi yahi ginti hai. */
    const credit = posted.filter((l) => String(l.type) === "Credit").reduce((x, l) => x + num(l.amount), 0);
    const refund = posted.filter((l) => String(l.type) === "Refund").reduce((x, l) => x + num(l.amount), 0);
    const ledgerSpend = posted.filter((l) => ["Spend", "Adjustment"].includes(String(l.type))).reduce((x, l) => x + num(l.amount), 0);

    /* Meta se juda account: kharch Meta ke synced data se (ledger me
       haath se likhna nahi padta). Meta card/UPI se bill karta hai, isliye
       "balance" ki jagah Meta ka apna "unbilled" dikhate hain. */
    const isMeta = String(a.platform) === "Meta" && Boolean(a.connectedVia || a.amountSpent || a.lastSync);
    const accId = String(a.accountId || "").trim();
    const metaRows = isMeta ? daily.filter((d) => d.account === accId) : [];
    const metaSpend = metaRows.reduce((x, d) => x + num(d.spend), 0);
    const cut = new Date(); cut.setDate(cut.getDate() - 7);
    const cutIso = cut.toISOString().slice(0, 10);
    const recentMeta = metaRows.filter((d) => String(d.date) >= cutIso).reduce((x, d) => x + num(d.spend), 0);
    const recentLedger = mine.filter((l) => String(l.type) === "Spend" && l.date && String(l.date) >= cutIso).reduce((x, l) => x + num(l.amount), 0);

    const spend = ledgerSpend + metaSpend;
    const burn = (recentMeta + recentLedger) / 7;
    const balance = credit + refund - ledgerSpend;
    const daysLeft = !isMeta && burn > 0 ? Math.floor(balance / burn) : null;
    const lastRecharge = mine.filter((l) => String(l.type) === "Credit").map((l) => l.date).filter(Boolean).sort().pop();
    const method = methods.find((m) => String(m.account || "") === String(a.name || "") && String(m.autoRecharge) === "On");
    const unbilled = num(a.balance);
    const lifetime = num(a.amountSpent);

    return { acc: a, isMeta, balance, credit, spend, burn, daysLeft, lastRecharge, method, unbilled, lifetime,
      low: !isMeta && balance < lowAt, token: tokenState(a) };
  }), [accounts, ledger, methods, lowAt, daily]);


  function doRecharge(form) {
    const rows = readRows(LEDGER);
    const entry = {
      id: uid(),
      date: form.date || todayISO(),
      account: recharge.acc.name,
      platform: recharge.acc.platform,
      type: "Credit",
      amount: form.amount,
      payMode: form.payMode,
      reference: form.reference,
      note: form.note || "Wallet recharge",
      status: "Posted",
      createdAt: new Date().toISOString(),
    };
    writeRows(LEDGER, [entry, ...rows]);
    logActivity({ dataset: LEDGER, action: "Created", target: recharge.acc.name, detail: `Recharge ${money(form.amount)} via ${form.payMode || "—"}` });
    setRecharge(null);
    show(`${money(form.amount)} recharge added to the ledger.`, "success");
  }

  const rechargeTab = {
    fields: [
      { key: "amount", label: "Amount", type: "number", required: true, rules: [{ type: "range", min: 1, max: 10000000 }] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "payMode", label: "Payment Method", type: "select", required: true,
        options: ["UPI", "Card", "Net banking", "NEFT", "Other"] },
      { key: "reference", label: "Reference / UTR", type: "text" },
      { key: "note", label: "Note", type: "text" },
    ],
  };

  return (
    <>
      <div className="pg-head" style={{ marginTop: 0 }}>
        <div><div className="pg-desc" style={{ marginTop: 0 }}>{tab.description}</div></div>
      </div>

      {cards.length ? (
        <div className="wl-grid">
          {cards.map((c) => {
            const pctLeft = c.daysLeft === null ? 100 : Math.max(3, Math.min(100, (c.daysLeft / 30) * 100));
            const barColor = c.daysLeft !== null && c.daysLeft <= 3 ? "var(--red)" : c.low ? "#D97706" : "var(--green)";
            return (
              <div className={`wl-card wl2${c.low ? " low" : ""}`} key={c.acc.id}>
                {/* ---- upar: account + button ---- */}
                <div className="wl2-top">
                  <span className="wl-ic" style={{ background: c.acc.platform === "Meta" ? "#E7F0FE" : "#FDE8E8", color: c.acc.platform === "Meta" ? "#1877F2" : "#EA4335" }}>
                    <i className={`fa-brands ${c.acc.platform === "Meta" ? "fa-meta" : "fa-google"}`} />
                  </span>
                  <div className="wl-id">
                    <div className="wl-name">{c.acc.name} <span className={`pill ${c.token.cls}`}>{c.token.label}</span></div>
                    <div className="wl-code">{c.acc.accountId || c.acc.platform}</div>
                  </div>
                  <button className="btn btn-gold wl2-btn" type="button" onClick={() => setRecharge(c)}><i className="fa-solid fa-plus" /> {c.isMeta ? "Record payment" : "Recharge"}</button>
                </div>

                {/* ---- beech: total paid + baaki numbers ek line me ---- */}
                <div className="wl2-body">
                  <div className="wl2-hero">
                    <span>{c.isMeta ? "Total paid to Meta" : "Balance"}</span>
                    <b>{money(c.isMeta ? c.credit : c.balance)}</b>
                    <em><i className="fa-regular fa-calendar" /> Last payment {c.lastRecharge ? new Date(c.lastRecharge).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</em>
                  </div>
                  <div className="wl2-grid">
                    <div><span><i className="fa-solid fa-fire" /> Spending per day</span><b>{money(c.burn)}</b><em>average of last 7 days</em></div>
                    {c.isMeta ? <div><span><i className="fa-solid fa-hourglass-half" /> Unbilled now</span><b>{money(c.unbilled)}</b><em>Meta will charge this next</em></div>
                      : <div><span><i className="fa-solid fa-hourglass-half" /> Days left</span><b>{c.daysLeft === null ? "—" : c.daysLeft}</b><em>at today's spending</em></div>}
                    <div><span><i className="fa-solid fa-chart-line" /> Spent{c.isMeta ? " (synced)" : ""}</span><b>{money(c.spend)}</b><em>{c.isMeta ? "from Campaigns data" : "from the ledger"}</em></div>
                    {c.isMeta ? <div><span><i className="fa-solid fa-infinity" /> Lifetime spend</span><b>{c.lifetime ? money(c.lifetime) : "—"}</b><em>as per Meta</em></div>
                      : <div><span><i className="fa-solid fa-indian-rupee-sign" /> Paid</span><b>{money(c.credit)}</b><em>all recharges</em></div>}
                  </div>
                </div>

                {!c.isMeta ? <div className="vk-bar" style={{ marginTop: 12 }}><span style={{ width: `${pctLeft}%`, background: barColor }} /></div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card"><Empty icon="fa-wallet" text="No ad account found. Connect an account in the Ad Accounts module — the card will appear here automatically." /></div>
      )}

      <details className="lg-howto">
        <summary><i className="fa-solid fa-shield-halved" /> Why no bank details are stored</summary>
        <div className="lg-howto-body">
          <p className="settings-copy" style={{ marginTop: 6 }}>
            Money goes directly from your bank to Meta/Google — the panel is never in between. So no card number, bank account number or IFSC is stored here — only the amount, date and method of each payment. Nothing sensitive can leak from the panel.
          </p>
        </div>
      </details>

      {recharge ? (
        <FormModal
          tab={rechargeTab} rows={[]} editingId={null}
          initial={{ amount: "", date: todayISO(), payMode: "", reference: "", note: "" }}
          icon="fa-plus" title={`Recharge · ${recharge.acc.name}`} submitLabel="Add payment"
          onSave={doRecharge} onClose={() => setRecharge(null)}
        />
      ) : null}
    </>
  );
}
