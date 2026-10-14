# Auto-Sync + Create Ad Setup

## Panel se Meta par kya-kya ho sakta hai

| Kaam | Panel se? | Permission |
|---|---|---|
| Campaign **create** — 5 step wizard | ✅ | `ads_management` |
| **Publish & Run** — turant live | ✅ | `ads_management` |
| **Edit** — naam, budget, dates | ✅ | `ads_management` |
| **ON / OFF** — asli pause/resume | ✅ | `ads_management` |
| **Archive** | ✅ | `ads_management` |
| Spend, impressions, clicks | ✅ | `ads_read` |
| Leads ka count | ✅ | `ads_read` |
| Lead ka naam + number | ✅ | `leads_retrieval` |
| **Balance recharge** | ❌ | **Meta API me hai hi nahi** — Ads Manager se hi hoga |

> Development Mode me `ads_management` **tumhare apne ad accounts par already kaam karta hai**. App Review sirf tab chahiye jab kisi client ke account par chalana ho.

---

# Token kaise banaye

Panel **bina token ke bhi poora chalta hai** — sirf data manually bharna padta hai.
Token daalte hi wahi data Meta/Google se apne aap aane lagega. Panel me kuch badalna nahi padega.

Saare token **`.env.local`** me jaate hain (server par). Browser me kabhi nahi jaate — token leak hua to koi bhi tumhare ad account se paisa kharch kar sakta hai.

---

## Kaunsa platform, kaunsa token

| Platform | Token | App Review? | Time |
|---|---|---|---|
| **Facebook** | Meta System User | Nahi (`ads_read`) | 15–20 min |
| **Instagram** | **Wahi Meta token** | Nahi | 0 — Facebook ke saath hi |
| **YouTube** | Google Ads Developer + Refresh | Developer token approval | 1–2 hafte |
| **Website** | Koi token nahi, sirf ek secret | Nahi | 5 min |

---

# 1 · META — Facebook + Instagram

Ek hi token se **dono** cards bhar jaate hain. Insights me `publisher_platform` breakdown maanga jaata hai, jisse ek campaign ka kharcha Facebook aur Instagram me apne aap baant jaata hai.

## Step 1 — Meta App banao
1. **developers.facebook.com** → My Apps → **Create App**
2. Use case: **Other** → Type: **Business**
3. App banne ke baad **Settings → Basic** me se copy karo:
   - App ID → `META_APP_ID`
   - App Secret → `META_APP_SECRET`

## Step 2 — System User token
1. **business.facebook.com** → **Business Settings**
2. Left menu → **Users → System Users** → **Add**
3. Naam: `VakilKaro Panel` · Role: **Admin**
4. **Add Assets** → **Ad Accounts** → apne saare ad accounts select karo → permission **Manage Campaigns**
5. **Add Assets** → **Pages** → apna page → **Manage Page** *(leads ke liye, Phase 2)*
6. **Generate New Token** → Step 1 wali app select karo
7. Permissions tick karo:
   - `ads_read` — **zaroori** (spend, leads count, status)
   - `leads_retrieval` — lead ka naam/number (App Review chahiye)
   - `pages_show_list`
   - `ads_management` — panel se ON/OFF (App Review chahiye)
8. **Token Expiration: Never**
9. **Generate** → token copy karo — **ye ek hi baar dikhta hai**

## Step 3 — Ad Account IDs
Ads Manager me URL me dikhta hai: `act_123456789`

Ek se zyada account ho to comma se — **multi-account isi se chalta hai**:
```
META_AD_ACCOUNT_IDS="act_111111111,act_222222222,act_333333333"
```

## Step 4 — .env.local me daalo
```env
META_SYSTEM_USER_TOKEN="EAAG...bahut-lamba"
META_APP_ID="1234567890"
META_APP_SECRET="abc123..."
META_AD_ACCOUNT_IDS="act_111111111,act_222222222"
```

Server restart karo → Campaigns page par **"Sync Meta"** button aa jayega.

---

# 2 · GOOGLE ADS — YouTube

Ye Meta se zyada waqt leta hai kyunki developer token approve hona padta hai. **Aaj hi apply kar do**, parallel me chalta rahega.

## Step 1 — Developer Token (approval me 1–2 hafte)
1. **ads.google.com** → Tools → **API Center**
2. Apply karo — Basic Access maango
3. Approve hone tak **Test Access** milta hai (sirf test accounts par chalta hai)
4. Token copy → `GOOGLE_ADS_DEVELOPER_TOKEN`

## Step 2 — OAuth Client
1. **console.cloud.google.com** → naya project
2. **APIs & Services → Library** → "Google Ads API" enable karo
3. **Credentials → Create Credentials → OAuth client ID**
4. Type: **Desktop app**
5. Client ID → `GOOGLE_ADS_CLIENT_ID`, Client Secret → `GOOGLE_ADS_CLIENT_SECRET`

## Step 3 — Refresh Token
1. **developers.google.com/oauthplayground**
2. Upar ⚙️ → **Use your own OAuth credentials** → Client ID/Secret daalo
3. Scope: `https://www.googleapis.com/auth/adwords`
4. **Authorize** → apne Google Ads wale account se login
5. **Exchange authorization code for tokens** → **Refresh token** copy karo

## Step 4 — Customer ID
Google Ads me upar right me dikhta hai: `123-456-7890` (dash hata do)

## Step 5 — .env.local
```env
GOOGLE_ADS_DEVELOPER_TOKEN="..."
GOOGLE_ADS_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_ADS_CLIENT_SECRET="..."
GOOGLE_ADS_REFRESH_TOKEN="1//0g..."
GOOGLE_ADS_LOGIN_CUSTOMER_ID="1234567890"
GOOGLE_ADS_CUSTOMER_IDS="1234567890,9876543210"
```

> **Zaroori:** YouTube par lead tabhi ginti hai jab **conversion tracking** laga ho — ya Google Lead Form use kar rahe ho, ya website par conversion tag. Bina uske spend, views aur clicks aayenge, leads 0 rahegi.

---

# 3 · WEBSITE — sabse aasan

Website ki leads tumhari **apni** hain, koi API nahi chahiye.

## Step 1 — Secret banao
Koi bhi lambi random string:
```env
WEBSITE_LEAD_SECRET="vk-a8f3k2j9x7m4q1w6e5r8t2y9u3i7o1p5"
```

## Step 2 — Website ka form panel ko bheje
```js
await fetch("https://panel.vakilkaro.in/api/leads/website", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-vk-secret": "vk-a8f3k2j9x7m4q1w6e5r8t2y9u3i7o1p5"
  },
  body: JSON.stringify({
    name:    "Rahul Sharma",
    phone:   "9876543210",
    email:   "rahul@example.com",
    service: "Trademark Registration",
    city:    "Jaipur",
    campaign: "seo-homepage"
  })
});
```

WordPress hai to Contact Form 7 / WPForms ke webhook add-on me yahi URL aur header daal do.

## Step 3 — Panel me
Campaigns page par **"Pull Website Leads"** button aa jayega. Lead **Lead Capture → Inbox Log** me chali jayegi, duplicate check ke saath.

---

# Kya kab milega

## Turant — koi approval nahi
| Kaam | Chahiye |
|---|---|
| Website leads | `WEBSITE_LEAD_SECRET` |
| **FB + IG ka spend, leads count, live/paused** | `META_SYSTEM_USER_TOKEN` (`ads_read`) |

Tumhara main sawaal — *"aaj kitni leads aayi, kal kitni thi"* — **yahin solve ho jaata hai**, FB aur IG dono ke liye.

## Approval ke baad
| Kaam | Wait |
|---|---|
| YouTube ka data | Developer token 1–2 hafte |
| FB/IG lead ka naam-number | App Review 2–3 hafte |
| Panel se ON/OFF | Usi review me |

---

# Sync kaam kaise karta hai

```
"Sync Meta" dabao
   ↓
Server (token yahin rehta hai) → Meta Graph API
   ↓
Campaigns + har din ka spend/leads/status
   ↓
Panel me merge — same date + same campaign wali entry REPLACE hoti hai
   ↓
Cards, Daily breakdown, Ads table sab update
```

**Dobara sync karna safe hai.** Merge upsert hai, isliye spend double nahi hota. Meta ka data 24–48 ghante tak adjust hota rehta hai, isliye pichhle 3 din dobara sync karna normal baat hai.

**Ek account fail ho to baaki nahi rukte** — teen accounts me se ek ka token kharab ho to baaki do ka data phir bhi aa jayega, aur error alag se dikh jayega.

---

# Roz apne aap chalane ke liye (cron)

VPS par crontab:
```bash
# Roz subah 6 baje pichhle 3 din ka data
0 6 * * * curl -X POST https://panel.vakilkaro.in/api/sync/run \
  -H "Content-Type: application/json" \
  -d '{"provider":"meta","since":"'$(date -d '3 days ago' +\%Y-\%m-\%d)'","until":"'$(date +\%Y-\%m-\%d)'"}'
```

> Note: `/api/sync/run` abhi login cookie maangta hai. Cron se chalane ke liye ek service token add karna hoga — bata dena, jod dunga.

---

# Common galtiyan

| Error | Matlab | Fix |
|---|---|---|
| "Token expire ho gaya" | Expiration Never nahi set kiya | Naya System User token, Never |
| "ads_read permission nahi" | Token banate waqt tick nahi kiya | Dobara generate, `ads_read` tick |
| "Account ID galat hai" | `act_` prefix chhoot gaya | `act_123456789` poora daalo |
| "Developer token approve nahi hua" | Abhi Test Access hai | Basic Access ka wait |
| Leads 0 aa rahi (YouTube) | Conversion tracking nahi laga | Google Ads me conversion set karo |
| Website lead nahi aa rahi | Secret match nahi | `x-vk-secret` header check karo |
