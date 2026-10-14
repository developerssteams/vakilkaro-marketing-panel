# WhatsApp Integration — Remarketing

Marketing side ka **koi bhi file nahi chhua**. Sab kuch Remarketing me joda hai.

---

## Kya bana

| File | Kaam |
|---|---|
| `lib/whatsapp-api.js` | Cloud API client — template send, templates list, number health |
| `lib/message-queue.js` | Queue with throttle, retry, delivery tracking |
| `lib/reply-inbox.js` | Replies ka buffer (server par) |
| `app/api/whatsapp/send` | Leads ko queue me daalta hai (guards ke saath) |
| `app/api/whatsapp/dispatch` | Queue se batch bhejta hai |
| `app/api/whatsapp/webhook` | Delivery status + replies leta hai |
| `app/api/whatsapp/templates` | Approved templates ki list |
| `app/api/whatsapp/status` | Queue ka live haal |
| `components/BroadcastSender.js` | 4-step send UI |
| `components/ReplyInbox.js` | Reply → Win-back Queue |

Outreach ab **4 tabs**: Broadcast · **Reply Inbox** (naya) · Journeys · Offers

---

## Message kaise jaata hai

```
Panel: audience chuno → template → preview → Send
            ↓
   /api/whatsapp/send  →  guards lagte hain  →  QUEUE
            ↓
   /api/whatsapp/dispatch  (har 15 sec)  →  20/min ki speed
            ↓
        WhatsApp Cloud API
            ↓
   webhook: delivered → read → replied
            ↓
   Reply Inbox → ek click → Win-back Queue
```

### Queue kyun, seedha kyun nahi

500 messages ek loop me bhejne se do cheezein hoti hain:
1. Meta rate-limit maar deta hai
2. Naye number par burst = **quality gir jaati hai**, aur number ban ho sakta hai

Isliye queue banti hai aur throttle se jaati hai. Ek dispatch call = ek minute ka kaam. Panel baar-baar call karta hai jab tak queue khatam na ho.

### Ek call me poori queue kyun nahi

843 messages = 43 minute. HTTP request itni der khuli nahi rehni chahiye — timeout ho jayegi aur beech ke messages atak jaayenge.

---

## Teen guards — send se pehle

| Guard | Kya rokta hai | Kyun |
|---|---|---|
| **DND** | `dnd = Yes` wale | TRAI compliance — legal-tech ke liye optional nahi |
| **Cooldown** | `nextEligible` future me | Bar-bar message = number ban |
| **Attempts** | 3 se zyada try ho chuke | 3 baar mana kiya to 4th baar bhi karega |

Plus: invalid phone, aur same lead ko same broadcast me dobara.

**Test se:** 7 leads bheje → 2 pass, 5 skip (1 DND, 1 cooldown, 1 attempts, 1 bad phone, 1 duplicate).

Message jaane ke baad us lead ka `attempts` badhta hai aur bucket ke hisaab se `nextEligible` set hota hai — warna wahi lead kal phir list me aa jaati.

---

## Template hi kyun, normal message kyun nahi

WhatsApp me do tarah ke message hote hain:

| | Kab | Kaam ka |
|---|---|---|
| **Template** | Kabhi bhi, kisi ko bhi | Meta se approve karana padta hai |
| **Text** | Sirf 24 ghante ke andar, jab customer ne khud message kiya ho | Reply dene ke liye |

Lost leads purani hoti hain — 24-ghante ki window kab ki band ho chuki. Isliye Remarketing me **hamesha template** jaata hai.

Panel sirf **APPROVED** templates dikhata hai. PENDING/REJECTED bhejne par Meta error deta hai.

---

## Variables

Panel me `{name}` `{service}` likhna aasan hai, par Meta `{{1}}` `{{2}}` maangta hai.

Isliye Template step me **mapping** hoti hai:

```
Template: "Namaste {{1}}, aapne {{2}} ke baare me pucha tha. Aaj {{3}} chal raha hai."

{{1}} → Lead ka naam
{{2}} → Service
{{3}} → Offer text
```

Preview me sample values bhar ke actual WhatsApp bubble dikhta hai — bhejne se pehle galti pakad me aa jaati hai.

---

## Delivery report

Webhook se aata hai:

| Event | Panel me |
|---|---|
| `sent` | message queue se nikla |
| `delivered` | phone tak pahuncha |
| `read` | blue tick |
| **`replied`** | **jawab aaya — sabse keemti** |
| `failed` | nahi gaya, wajah ke saath |

Webhook set nahi hai to sirf "sent" dikhega. Panel khud ye warning deta hai.

### Reply attribution

Ek number ko kai broadcast gaye ho sakte hain. Reply hamesha **sabse haal ke** message ka jawab hota hai — isliye latest sent entry par attribute hoti hai, pehli par nahi.

*(Ye ek bug tha jo testing me pakda gaya — pehle pehli entry par lag raha tha.)*

---

## Reply Inbox — sabse important

Broadcast ke 500 me se jo 40 log jawab dete hain, **asli kaam unhi par hota hai**.

Reply aate hi:
- Ininbox me dikhti hai (naam, number, message, kis broadcast ka jawab)
- Click-to-call aur click-to-WhatsApp
- **"Queue" button** — ek click me Win-back Queue me, **High priority** ke saath
- Lost Pool se lead ka data bhi jud jaata hai (service, quoted amount, bucket)

Har 30 second me apne aap check hota hai.

---

## Retry logic

| Error | Kya hota |
|---|---|
| "Number WhatsApp par nahi hai" | **Permanent** — retry nahi |
| "Template maujood nahi" | **Permanent** |
| "Template paused" | **Permanent** |
| Timeout / rate limit | **3 baar retry**, phir failed |

Permanent errors ko retry karna time aur quota dono barbaad karta hai.

---

## .env values

`.env.example` me **saare sections** hain — Meta Ads, Google Ads, Website leads aur WhatsApp.
Apni values `.env.local` me daalni hain (`.env.example` sirf template hai).

```dotenv
WA_TOKEN=""                    # WhatsApp Manager → API Setup
WA_PHONE_ID=""                 # wahi se
WA_WABA_ID=""                  # templates list ke liye
WA_WEBHOOK_VERIFY_TOKEN=""     # koi bhi random string, Meta me bhi yahi
WA_APP_SECRET=""               # khaali chhodo to META_APP_SECRET use hoga
WA_LANG="en"
WA_COUNTRY_CODE="91"
WA_THROTTLE_PER_MINUTE="20"    # naye number par 20 se shuru
```

### Webhook setup

Meta App → WhatsApp → Configuration:
- Callback URL: `https://panel.vakilkaro.in/api/whatsapp/webhook`
- Verify token: jo `WA_WEBHOOK_VERIFY_TOKEN` me daala
- Subscribe: **messages**

Webhook signature verify hota hai — iske bina koi bhi fake "delivered" bhej ke tumhare numbers kharab dikha sakta hai.

---

## Testing

| Kya | Result |
|---|---|
| Phone normalize, variables, guards | **26 tests pass** |
| Queue lifecycle, retry, webhook | **22 tests pass** (1 bug mila aur fix hua) |
| Auth guards (401) | 4/4 |
| needsSetup messages | 3/3 |
| Webhook handshake | sahi token → challenge, galat → 403 |
| Webhook signature | bina sig → 401, sahi sig → 200 |
| Reply flow | event → inbox → drain → khaali |
| Send guards | 7 leads → 2 pass, 5 sahi skip |
| 11 pages | sab 200, zero errors |
| Marketing files | **7/7 bit-identical** |

---

## Meta ka logic — bilkul same

WhatsApp jodne me Meta Ads ka koi logic nahi badla:

| File | Status |
|---|---|
| `lib/meta-api.js` | bit-identical |
| `lib/meta-write.js` | bit-identical |
| `lib/sync-normalize.js` | bit-identical |
| `lib/platform-config.js` | sirf `whatsappConfig()` **juda** — koi purani line badli nahi |

Ek security fix zaroor kiya: **Settings → Integrations** me pehle token type karne ke input the (WA_TOKEN, META_APP_SECRET). Browser me daala hua token localStorage me plain text me jaata hai — aur us token se ad account se paisa kharch ho sakta hai aur customers ko message ja sakta hai. Ab wo tab **read-only status view** hai: kaunsa platform connected hai, kya missing hai, aur kahan se milega. Token daalne ka ek hi raasta — `.env.local`.

---

## Abhi bhi baaki

- **Journeys ka scheduler** — steps define ho jaate hain par time pe chalte nahi. Cron chahiye.
- **Auto-queue** — roz ki win-back list apne aap banna
- **Lost leads ka auto-import** — sales side se aana
- **Email/SMS** — abhi sirf WhatsApp
