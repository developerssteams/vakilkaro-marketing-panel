"use client";

/* ============================================================
   components/AdPreview.js — ek ad ko dekhna / play karna

   Campaigns → Ads → kisi ad ka thumbnail ya "Preview" button.
   Do tarah se dikhta hai:
     · Meta preview — Meta ka apna iframe, har placement ka (FB feed,
       IG feed, Reels, Story). Video wahi play hota hai.
     · Video — ad ki asli video file panel ke player me (jab Meta
       file de de). Speed, full-screen, download sab browser ka.
   Sirf dekhna — ad me kuch badalta nahi.
   ============================================================ */

import { useEffect, useState } from "react";

const PLACEMENTS = [
  ["MOBILE_FEED_STANDARD", "Facebook Feed", "fa-brands fa-facebook-f"],
  ["INSTAGRAM_STANDARD", "Instagram Feed", "fa-brands fa-instagram"],
  ["INSTAGRAM_REELS", "Instagram Reels", "fa-solid fa-clapperboard"],
  ["INSTAGRAM_STORY", "Instagram Story", "fa-solid fa-circle-play"],
  ["FACEBOOK_REELS_MOBILE", "Facebook Reels", "fa-solid fa-film"],
];
const TALL = ["INSTAGRAM_REELS", "INSTAGRAM_STORY", "FACEBOOK_REELS_MOBILE"];

export default function AdPreview({ ad, onClose }) {
  const [format, setFormat] = useState("MOBILE_FEED_STANDARD");
  const [view, setView] = useState("meta");
  const [state, setState] = useState({ loading: true });
  const [frameLoaded, setFrameLoaded] = useState(false);

  async function load(fmt) {
    setState((s) => ({ ...s, loading: true, error: "" }));
    setFrameLoaded(false);
    try {
      const r = await fetch(`/api/meta/ad-preview?${new URLSearchParams({ adId: ad.id, format: fmt })}`);
      const j = await r.json();
      if (!r.ok) setState({ loading: false, error: j.error || "Could not load preview" });
      else {
        setState({ loading: false, data: j });
        /* Meta preview na mile par video ho to seedha video dikhao */
        if (!j.preview && j.video) setView("video");
      }
    } catch { setState({ loading: false, error: "Could not reach the server" }); }
  }
  useEffect(() => { load(format); }, [ad.id, format]);

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const d = state.data;
  const tall = TALL.includes(format);
  const h = Math.min(Math.max(d?.preview?.height || (tall ? 640 : 560), 420), 720);

  return (
    <div className="ap-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ap-modal" role="dialog" aria-label="Ad preview">
        <div className="ap-head">
          <div className="ap-title">
            <span className="ap-kicker"><i className="fa-solid fa-eye" /> Ad preview</span>
            <h3>{ad.name}</h3>
          </div>
          <button type="button" className="ca-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="ap-body">
          <div className="ap-stage">
            <div className="ap-views">
              <button type="button" className={view === "meta" ? "on" : ""} onClick={() => setView("meta")}><i className="fa-brands fa-meta" /> Meta preview</button>
              <button type="button" className={view === "video" ? "on" : ""} disabled={!d?.video} onClick={() => setView("video")}
                title={d && !d.video ? (d.videoId ? "Meta did not share the video file — use Meta preview" : "This ad has no video") : ""}>
                <i className="fa-solid fa-play" /> Video
              </button>
            </div>

            {view === "meta" ? (
              <div className="ap-places">
                {PLACEMENTS.map(([k, label, icon]) => (
                  <button key={k} type="button" className={format === k ? "on" : ""} onClick={() => setFormat(k)}>
                    <i className={icon} /> {label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={`ap-phone${tall && view === "meta" ? " tall" : ""}`}>
              {state.error ? (
                <div className="ap-msg bad"><i className="fa-solid fa-triangle-exclamation" /> {state.error}</div>
              ) : view === "video" && d?.video ? (
                <video className="ap-video" src={d.video.src} poster={d.video.poster || undefined} controls autoPlay playsInline preload="metadata" />
              ) : state.loading ? (
                <div className="ap-msg"><i className="fa-solid fa-spinner fa-spin" /> Loading preview from Meta…</div>
              ) : d?.preview ? (
                <>
                  {!frameLoaded ? <div className="ap-msg ap-over"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div> : null}
                  <iframe
                    key={d.preview.src}
                    className="ap-frame"
                    src={d.preview.src}
                    title={`${ad.name} preview`}
                    style={{ height: h }}
                    scrolling="yes"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    onLoad={() => setFrameLoaded(true)}
                  />
                </>
              ) : (
                <div className="ap-msg">
                  {d?.image ? <img src={d.image} alt="" referrerPolicy="no-referrer" /> : null}
                  <span>{d?.previewError || "Meta has no preview for this placement."} Try another placement.</span>
                </div>
              )}
            </div>
            <p className="ap-note">Video plays inside the preview — tap ▶ on it. If the preview looks blank, try another placement or open it on Facebook.</p>
          </div>

          <div className="ap-side">
            {d ? (
              <>
                <div className="ap-badges">
                  {d.status ? <span className={`pill ${d.status === "ACTIVE" ? "pill-active" : "pill-default"}`}><span className="dot">●</span>{d.status === "ACTIVE" ? "Live" : d.status.replace(/_/g, " ").toLowerCase()}</span> : null}
                  {d.kind ? <span className="ap-chip"><i className={`fa-solid ${d.videoId ? "fa-film" : "fa-image"}`} /> {d.videoId ? "Video" : d.kind.replace(/_/g, " ").toLowerCase()}</span> : null}
                  {d.video?.seconds ? <span className="ap-chip"><i className="fa-regular fa-clock" /> {fmtSec(d.video.seconds)}</span> : null}
                </div>

                {d.headline ? <div className="ap-field"><span>Headline</span><b>{d.headline}</b></div> : null}
                {d.text ? <div className="ap-field"><span>Primary text</span><p>{d.text}</p></div> : null}
                {d.cta ? <div className="ap-field"><span>Button</span><b className="ap-cta">{d.cta}</b></div> : null}

                <div className="ap-links">
                  {d.links.facebook ? <a href={d.links.facebook} target="_blank" rel="noreferrer"><i className="fa-brands fa-facebook-f" /> Open post on Facebook</a> : null}
                  {d.links.instagram ? <a href={d.links.instagram} target="_blank" rel="noreferrer"><i className="fa-brands fa-instagram" /> Open on Instagram</a> : null}
                  {d.links.adsManager ? <a href={d.links.adsManager} target="_blank" rel="noreferrer"><i className="fa-solid fa-arrow-up-right-from-square" /> Open in Ads Manager</a> : null}
                  {d.video?.src ? <a href={d.video.src} target="_blank" rel="noreferrer"><i className="fa-solid fa-download" /> Video file</a> : null}
                </div>

                {ad.all ? (
                  <div className="ap-stats">
                    <div><span>Spent</span><b>₹{Number(ad.all.spend || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b></div>
                    <div><span>Results</span><b>{Number(ad.all.results || 0).toLocaleString("en-IN")}</b></div>
                    <div><span>Form / Chats</span><b>{Number(ad.all.formLeads || 0)} / {Number(ad.all.chats || 0)}</b></div>
                  </div>
                ) : null}
              </>
            ) : state.loading ? <div className="ap-msg"><i className="fa-solid fa-spinner fa-spin" /> Loading…</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtSec(s) { const m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; }
