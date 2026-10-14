# Meta (Facebook + Instagram) — panel me kaise jodna hai

Token pehle se bana hua hai aur **whatsapp-ai.vakilkaro.com** app me kaam kar raha hai.
Wahi token is panel me copy karna hai — naya banane ki zaroorat nahi.

## 1 · `.env.local` me ye lines daalo

Server pe whatsapp-ai app ki `.env.local` kholo:
`htdocs/whatsapp-ai.vakilkaro.com/.env.local`

Usme se ye do lines **jaise ki taisi** copy karke is panel ki `.env.local` me paste karo:

```
META_TOKEN=EAAY5...            (poora token)
META_AD_ACCOUNTS=1590257538118233
```

Aur panel ki `.env.local` me ye theek karo:

```
META_APP_ID=1752005389283386
META_APP_SECRET=...            (developers.facebook.com → Vakilkaro-HR → App settings → Basic → App secret → Show)
```

**Purani lines hata do:** `META_SYSTEM_USER_TOKEN` aur `META_AD_ACCOUNT_IDS`.
Dono naam bhare rahe to panel `META_SYSTEM_USER_TOKEN` (purana token) ko pehle uthayega.

Pehle `META_APP_ID` me `609477093305633` pada tha — wo ad account ki ID hai, app ki nahi.

Server restart: `npm run dev` band karke dobara chalao.

## 2 · Panel me

**Ad Accounts → Connect Meta Account**

- Upar token card: token ka naam dikhega
- Neeche ad accounts ki list — tick karo
- **Connect & Sync** dabao

Account Ad Accounts me judta hai (naam, Business, Meta status, lifetime spend) aur usi waqt
uske saare campaigns **Campaigns → Facebook / Instagram** cards me aa jaate hain.

## Data apne aap aata hai (auto-sync)

Topbar me (Search ke paas) **"Live · x min pehle"** badge dikhta hai.

- Panel ka koi bhi page khula ho, **har 5 minute** me Meta se pichle 8 din ka data apne aap aata hai
- Din me ek baar 30 din ka — Meta purane din ke Results 7 din tak badalta rehta hai
- Pehli baar (ya naya account jodne pe) 90 din ka aata hai
- Har sync pe Ad Accounts ka **Lifetime Spend** aur **Meta status** bhi taaza hota hai
- Tab minimize ho ya doosre tab pe ho to nahi chalta — wapas aate hi chal jaata hai
- Do tab khule hon to ek hi sync karta hai

Badge pe click karo: on/off, 2 / 5 / 10 / 15 / 30 minute, aur "Abhi sync karo".

Badge ke rang: **hara** = sab theek · **peela** = kisi account me dikkat (payment error) · **laal** = sync fail.

Meta khud 15-30 minute late hota hai — Ads Manager me bhi "aaj" ka number thoda peeche rehta hai.
Server pe har ghante background sync (panel band ho tab bhi) deploy + Postgres ke baad hoga.

## Facebook aur Instagram — alag bhi, saath bhi

Campaigns page pe cards ke upar **Meta total** patti hai (FB vs IG spend ka split). Usse click karo →
**FB vs IG** view:

| Section | Kya |
|---|---|
| Teen box | Total, Facebook, Instagram — spend, leads, CPL, form, WhatsApp, CTR. Sasta CPL wale pe tag |
| Facebook vs Instagram table | Har metric aamne-saamne |
| Campaign-wise split | Har campaign: **Total** (= Ads Manager), FB hissa, IG hissa, dono ke CPL |
| Din-wise | Har din FB aur IG ka kharcha |

Upar switch se **FB vs IG / Sirf Facebook / Sirf Instagram** ek click me badlo.

**Ads Manager se match karna ho to** FB vs IG view ka **Total** column dekho, aur dono jagah same date range rakho.
(Panel ka "Last 30 days" = aaj + pichle 29 din.)

## Payment error

Ads Manager me "Payment error" ho to campaign ON dikhta hai par chalta nahi. Panel ab ise pakadta hai:
laal warning, campaign pe "Payment error" tag, aur aise campaign **Live me nahi gine jaate**.
Billing theek karte hi agle sync pe warning apne aap hat jaati hai.

## Numbers Ads Manager se kaise match hote hain

Panel ab Ads Manager ka hi hisaab lagata hai:

| Panel | Ads Manager | Kaise |
|---|---|---|
| Amount spent | Amount spent | Paise tak (₹1,202.89) |
| Results | Results | Har ad set ke **goal** se — lead form campaign me form leads, messaging campaign me chats |
| Cost per result | Cost per result | Amount spent ÷ Results |
| Budget | Budget | Campaign pe na ho to ad sets ka ("Ad set budget") |
| Leads (Form) | Leads | Alag box me |
| Messaging conversations started | Messaging conversations started | Alag box me — Results me tabhi gina jaata hai jab campaign ka goal messaging ho |
| Link clicks, CTR (link) | Link clicks, CTR (link click-through rate) | |
| Clicks (all), CTR (all) | Clicks (all), CTR (all) | |
| CPM | CPM | |

Meta June 2025 se API me bhi wahi attribution setting lagata hai jo Ads Manager me hai (jaise "7-day click or 1-day view"),
isliye Results alag se adjust nahi karne padte.

**Match kaise check karein:** Campaigns → Meta total → **FB vs IG** → "Campaign-wise split" ka **Total** column.
Ads Manager me same date range rakho. Facebook / Instagram ke hisse check karne ho to Ads Manager me
Breakdown → By delivery → Platform.

**Ek dhyan:** Facebook card me Audience Network aur Messenger bhi shamil hain (Ads Manager ke Platform breakdown me ye alag
rows hoti hain), aur Instagram card me Threads.

**Reach** panel nahi dikhata — Ads Manager reach ko unique log ginta hai, jo din jod ke nahi banta.

## Campaigns card me kya dikhta hai

| | |
|---|---|
| Spend, Leads, CPL | Chuni hui date range ka, sirf us platform ka |
| Live / Paused | Abhi ka haal |
| Impressions, Clicks, CTR, CPM | Meta insights se |
| Form Leads | Lead form wale ads |
| WhatsApp Chats | Click-to-WhatsApp wale ads |

**Leads / Results = Ads Manager ka Results column.** Dashboard aur Analytics bhi yahi use karte hain.

Ek campaign Facebook aur Instagram dono pe chalta ho to dono cards me dikhega — har card me
sirf us platform ka kharcha.

Har naye campaign pe **Service** chuno (campaign ke naam ke neeche "Service chuno" likha hoga) —
warna service-wise CPL nahi banega.

## Baaki 3 business portfolio (Official, Tm, Vakilkaro)

1. Us portfolio ka ad account Vakilkaro Official (`100381425844342`) ke saath share karo —
   Manage campaigns ON, Full access OFF
2. Official → System users → token wale system user (WA-Botuser) → Assign assets → wo ad account
3. Uski ID `META_AD_ACCOUNTS` me comma se jodo: `1590257538118233,111...,222...`
4. Restart → Connect Meta Account → naya account tick → Connect & Sync

Token badalna nahi padega.

## Galti aaye to

| Message | Matlab |
|---|---|
| "Expiry check nahi hua — META_APP_ID galat" | Data aayega, bas App ID theek karo (step 1) |
| "Ye token App X ka hai" | `META_APP_ID` me wahi X daalo |
| Account ID galat hai ya us par access nahi | Account system user ko assign nahi hai |
| `ads_management` missing | Data aayega, par panel se ad ON/OFF nahi hoga |
| Rate limit | 10-15 min baad try karo |

## Comparison module (sidebar → Comparison)

| View | Kya dikhta hai |
|---|---|
| Platform vs Platform | FB / IG / Meta / YouTube / Website / Sab — har metric, pichle barabar period se badlaav |
| Mahine vs Mahine | Pichle 3 / 6 / 12 mahine ya koi do mahine (A vs B), har mahine ka badlaav + trend line |
| Conversion Funnel | Impressions → Link clicks → Leads (Ads) → Panel me aayi → Converted |

Graph sthir hain (ghoomte nahi). Har graph pe **3D / 2D** switch — pasand yaad rehti hai.

### Hisaab kaise hota hai

| Metric | Formula |
|---|---|
| Leads | Ads Manager ka Results |
| Panel me aayi | Lead Capture me aayi leads — Junk / Duplicate nahi |
| Ad lead → Panel % | Panel me aayi ÷ Leads (kam ho to conversion % pe bharosa kam) |
| Converted | Panel leads me se jinka Stage "Converted" |
| Conversion % | Converted ÷ Panel me aayi — dono ek hi data se |
| Cost per lead | Spend ÷ Leads |
| Cost per conversion | Spend ÷ Converted |

- Converted us din gini jaati hai jab lead **aayi** thi — "Jan ki leads me se kitni bani"
- Source sirf "Meta" likha ho to wo lead Facebook / Instagram me alag nahi, sirf "Meta (FB + IG)" aur "Sab" me
- "Google" source → YouTube
- Jis mahine / period ka data nahi → "—" aur "data nahi" (0 nahi). Data beech se shuru → "adhoora", uska badlaav nahi dikhta
- Chalu mahina pichle mahine ke utne hi dinon se compare (Oct 1-5 vs Sep 1-5)
- Jan vs Feb jaisa purana comparison: hero me **"12 mahine ka data laao"**

## Sync kitni jaldi

| Kab | Kitna data |
|---|---|
| Har 1 minute | Kal + aaj |
| Har 15 minute | Pichle 8 din |
| Din me ek baar | Pichle 30 din |
| Pehli baar / upgrade | 90 din |

Har second nahi — Meta ki API limit bhar ke token block ho jaata. Panel Meta ki limit padhta hai aur 75% paar
hote hi khud ruk jaata hai (badge pe "Meta limit · x min ruko"). Interval badge pe click karke 1 se 30 minute rakh sakte ho.

## Lead Capture me Meta leads (v9)

Leads **Page** ki hoti hain, ad ki nahi. Panel teen raaste try karta hai, jo bhi chal jaaye:

| Raasta | Kya chahiye |
|---|---|
| 1 · Har lead ad → `/{ad}/leads` | Token me `ads_read` + `leads_retrieval` |
| 2 · Wahi ad, uske Page ke token se | Page token (neeche 3 me se kisi tarah) |
| 3 · Page → lead forms → leads | Page token |

Page token panel ko teen jagah se milta hai:
1. **System user ko Page assign** — Business Settings → Users → System users → WA-Botuser → Assign assets → Pages → Page → Full control. Phir token dobara Generate (permissions: `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `ads_read`).
2. **`.env.local` me `META_PAGE_TOKENS=pageId:token`** — Graph API Explorer → apna user token (upar wali permissions) → `me/accounts` → Page ka `access_token` copy. Long-lived banana ho to Access Token Debugger → "Extend".
3. Lead ads jis Page se chal rahe hain, us Page ID se panel khud token maangta hai (system user ko access ho to).

**WhatsApp app ka token mat chhedo** — naya token `META_LEADS_TOKEN` me daalo. Khaali ho to `META_TOKEN` hi use hota hai.

Leads Access on ho to: Business Settings → Integrations → **Leads access** → Page → system user + app assign.

Lead Capture ka peela banner ab Meta ka **asli error** aur token ki har permission (✓ / ✗) dikhata hai — wahi theek karo, server restart, **Pull leads from Meta**.

### v10 — Page tokens already set
Project ki `.env` file me chaaron Pages (Tm, Ngo, Mfc, Vakilkaro) ke never-expire tokens pehle se hain.
`.env.local` chhedne ki zaroorat nahi — zip upload karo, build + restart, Lead Capture → Pull leads from Meta.
~90 din baad "Data Access" khatam ho to naye tokens bana ke sirf `.env` ki META_PAGE_TOKENS line badlo.
