/* ============================================================
   lib/platform-config.js  —  SERVER ONLY

   Saare tokens yahin se padhe jaate hain, .env se. Browser me
   kabhi nahi jaate: token leak hua to koi bhi tumhare ad account
   se paisa kharch kar sakta hai.

   Panel bina token ke bhi chalta hai — sirf auto-fetch band rehta
   hai, manual entry chalti rehti hai.
   ============================================================ */

export const WA_API_VERSION = process.env.WA_API_VERSION || "v21.0";
export const META_API_VERSION = "v21.0";
export const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export function metaConfig() {
  /* Do naam chalte hain — whatsapp-ai app me META_TOKEN /
     META_AD_ACCOUNTS use hota hai, panel me META_SYSTEM_USER_TOKEN /
     META_AD_ACCOUNT_IDS. Jo bhi bhara ho wo chalega, taaki ek app ki
     working value seedhi doosre me copy ho sake. */
  const token = process.env.META_SYSTEM_USER_TOKEN || process.env.META_TOKEN || "";
  const rawIds = process.env.META_AD_ACCOUNT_IDS || process.env.META_AD_ACCOUNTS || "";

  /* App ID sirf digits aur 15-16 length ki hoti hai. Galti se ad
     account ID daal di ho to bhi wo digits hi hai — isliye ye check
     sirf format pakadta hai; asli galti tokenInfo me pakdi jaati hai. */
  const appId = String(process.env.META_APP_ID || "").trim();

  return {
    token,
    appId: /^\d{10,20}$/.test(appId) ? appId : "",
    appSecret: process.env.META_APP_SECRET || "",
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    /* act_ laga ho ya na ho — dono chalega: act_111,222 */
    accountIds: rawIds.split(",").map((x) => x.trim()).filter(Boolean)
      .map((x) => (x.startsWith("act_") ? x : `act_${x}`))
      .filter((x) => /^act_\d{6,20}$/.test(x)),
    tokenVar: process.env.META_SYSTEM_USER_TOKEN ? "META_SYSTEM_USER_TOKEN" : process.env.META_TOKEN ? "META_TOKEN" : "",
    /* Leads ke liye alag token (optional). whatsapp-ai app wala
       META_TOKEN chhedna na pade — leads_retrieval + pages wala naya
       token sirf META_LEADS_TOKEN me daalo. Khaali ho to META_TOKEN. */
    leadsToken: (process.env.META_LEADS_TOKEN || "").trim() || token,
    leadsTokenVar: (process.env.META_LEADS_TOKEN || "").trim() ? "META_LEADS_TOKEN"
      : process.env.META_SYSTEM_USER_TOKEN ? "META_SYSTEM_USER_TOKEN" : process.env.META_TOKEN ? "META_TOKEN" : "",
    /* Page access token(s) seedha — comma se alag. "pageId:token" ya
       sirf "token" dono chalega. System user ko Page assign na ho
       tab bhi inse lead forms padh lete hain. */
    pageTokens: String(process.env.META_PAGE_TOKENS || process.env.META_PAGE_TOKEN || "")
      .split(",").map((x) => x.trim()).filter(Boolean)
      .map((x) => { const m = x.match(/^(\d{3,25}):(.+)$/); return m ? { pageId: m[1], token: m[2].trim() } : { pageId: "", token: x }; }),
    ready: Boolean(token),
  };
}

export function googleConfig() {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN || "";
  return {
    devToken,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refreshToken: refresh,
    loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, ""),
    customerIds: (process.env.GOOGLE_ADS_CUSTOMER_IDS || "")
      .split(",").map((x) => x.trim().replace(/-/g, "")).filter(Boolean),
    ready: Boolean(devToken && refresh),
  };
}

/* WhatsApp Cloud API — Remarketing ka Outreach isi se chalta hai. */
export function whatsappConfig() {
  const token = process.env.WA_TOKEN || "";
  const phoneId = process.env.WA_PHONE_ID || "";
  return {
    token,
    phoneId,
    wabaId: process.env.WA_WABA_ID || "",
    /* Webhook verify token — Meta ise handshake me match karta hai. */
    verifyToken: process.env.WA_WEBHOOK_VERIFY_TOKEN || "",
    /* App secret se webhook ka signature verify hota hai — iske bina
       koi bhi fake delivery status bhej sakta hai. */
    appSecret: process.env.WA_APP_SECRET || process.env.META_APP_SECRET || "",
    defaultLang: process.env.WA_LANG || "en",
    countryCode: process.env.WA_COUNTRY_CODE || "91",
    /* Meta ka rate limit 80 msg/sec tak jaata hai, par naye numbers par
       quality gir jaati hai — isliye default dheema rakha hai. */
    throttlePerMinute: Number(process.env.WA_THROTTLE_PER_MINUTE || 20),
    ready: Boolean(token && phoneId),
  };
}

export function websiteConfig() {
  return {
    /* Website form isi secret ke saath POST karega, taaki koi bhi
       random lead inject na kar sake. */
    secret: process.env.WEBSITE_LEAD_SECRET || "",
    ready: Boolean(process.env.WEBSITE_LEAD_SECRET),
  };
}

/* UI ko sirf itna pata chalta hai ki kaunsa platform ready hai —
   token ki value kabhi nahi bheji jaati. */
export function platformStatus() {
  const m = metaConfig();
  const g = googleConfig();
  const w = websiteConfig();
  const wa = whatsappConfig();
  return {
    meta: {
      ready: m.ready,
      accounts: m.accountIds.length,
      missing: m.ready ? [] : ["META_TOKEN (ya META_SYSTEM_USER_TOKEN)"],
      covers: ["Facebook", "Instagram"],
    },
    google: {
      ready: g.ready,
      accounts: g.customerIds.length,
      missing: [
        !g.devToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
        !g.refreshToken && "GOOGLE_ADS_REFRESH_TOKEN",
        !g.clientId && "GOOGLE_ADS_CLIENT_ID",
      ].filter(Boolean),
      covers: ["YouTube"],
    },
    whatsapp: {
      ready: wa.ready,
      accounts: wa.ready ? 1 : 0,
      missing: [
        !wa.token && "WA_TOKEN",
        !wa.phoneId && "WA_PHONE_ID",
        !wa.wabaId && "WA_WABA_ID",
      ].filter(Boolean),
      hasWebhook: Boolean(wa.verifyToken),
      throttle: wa.throttlePerMinute,
      covers: ["Broadcast", "Journeys", "Queue reminders"],
    },
    website: {
      ready: w.ready,
      accounts: w.ready ? 1 : 0,
      missing: w.ready ? [] : ["WEBSITE_LEAD_SECRET"],
      covers: ["Website"],
    },
  };
}
