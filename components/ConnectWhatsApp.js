"use client";

/* WhatsApp Embedded Signup — client ka "Login with Facebook" */
import { useEffect, useState } from "react";

export default function ConnectWhatsApp({ appId, configId }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.fbAsyncInit = function () {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
    };
    if (!document.getElementById("fb-sdk")) {
      const s = document.createElement("script");
      s.id = "fb-sdk"; s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true; s.defer = true; s.crossOrigin = "anonymous";
      document.body.appendChild(s);
    }
    const onMsg = (event) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") window.__waSignup = data.data;
      } catch { /* doosre messages */ }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [appId]);

  const launch = () => {
    if (!window.FB) { setStatus({ t: "err", m: "Facebook is still loading — please try again in a second." }); return; }
    setBusy(true);
    setStatus({ t: "work", m: "Opening the signup window…" });
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (!code) { setBusy(false); setStatus({ t: "err", m: "Signup was not completed or was cancelled." }); return; }
      const info = window.__waSignup || {};
      setStatus({ t: "work", m: "Connecting your number…" });
      fetch("/api/embedded-signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone_number_id: info.phone_number_id, waba_id: info.waba_id }),
      }).then((r) => r.json()).then((d) => {
        setBusy(false);
        if (d.success) setStatus({ t: "ok", m: `Done! Your WhatsApp number is connected — the VakilKaro assistant will now reply on it. WABA: ${d.waba_id || info.waba_id || "-"}` });
        else setStatus({ t: "err", m: `Could not connect: ${d.error || "unknown error"}` });
      }).catch((e) => { setBusy(false); setStatus({ t: "err", m: `Server error: ${e.message}` }); });
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
  };

  return (
    <div className="cw-wrap">
      <div className="cw-card">
        <span className="cw-logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.2z"/></svg></span>
        <h1>Connect your WhatsApp</h1>
        <p>Connect your WhatsApp Business number with VakilKaro. One Facebook login and your number is ready — messages, AI replies and automation.</p>
        <button type="button" className="cw-btn" onClick={launch} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" /></svg>
          {busy ? "Please wait…" : "Login with Facebook"}
        </button>
        {status ? <div className={`cw-status ${status.t}`}>{status.m}</div> : null}
        <div className="cw-note">Your number stays in your own WhatsApp Business Account. You can remove access at any time.</div>
      </div>
    </div>
  );
}
