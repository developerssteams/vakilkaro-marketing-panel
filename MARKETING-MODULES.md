# Marketing Section — kya banaya (Module 1–5)

## 1 · Ad Accounts

### Form validation
| Field | Rule |
|---|---|
| Account Name | 3–100 chars, unique |
| Ad Account ID | Meta → `act_123456789` · Google → `123-456-7890`. Same platform par duplicate block |
| Business Manager ID | 10–20 digits only (Meta par hi dikhta hai) |
| Page ID / Pixel ID | 10–20 digits only (Meta par hi dikhta hai) |
| Conversion ID | Google Ads par hi dikhta hai |
| Token Expiry | Past date reject |
| Monthly Limit | 0 – 1,00,00,000 |
| Owner | 2–60 chars |

Error field ke neeche laal me dikhta hai, aur input border laal ho jaata hai.

### Smart behaviour
- **Token state auto-calculate** — manual dropdown hata diya. Expiry se apne aap: Live / Expiring · Xd / Expired / Not Connected / Disconnected
- **Default single-select** — ek platform par ek hi Default. Naya set karo to purana apne aap "No" ho jaata hai
- **Platform-conditional fields** — Meta chunne par Page/Pixel/BM dikhte hain, Google chunne par Conversion ID
- **Delete guard** — jis account par campaigns ya ledger entries hain wo delete nahi hota, count ke saath error aata hai

---

## 2 · Campaigns — 4 platform cards + daily filter

Table hata di. Ab 4 cards: **Facebook · Instagram · YouTube · Website**

**CPL aur Cost/Won columns hata diye gaye hain.**

### Filter icon (dono screens par)
Chips ki jagah ab ek **filter button** — count badge ke saath, aur bagal me active filters ka summary:

`[ 🔽 Filters (2) ]   ✓ Last 7 days · Facebook · Active`

Click karo to form panel khulta hai, teen groups me:

| Group | Options |
|---|---|
| **Date range** | Today · Yesterday · Last 7 days · Last 30 days · This Month · Custom (From → To) · All time |
| **Platform** | All Platforms · Facebook · Instagram · YouTube · Website |
| **Status** | All Status · Active · Paused · Draft · Completed |

Neeche do button: **Clear** (sab default par) aur **Apply**.

- **Apply dabane tak numbers nahi badalte** — panel me chunte raho, table jhatka nahi khaayega
- Badge sirf non-default filters ginta hai (Last 30 days default hai, isliye wo count nahi hota)
- Panel ke bahar click ya Escape se band
- Custom chuna par date nahi bhari to range chup-chaap default par wapas chala jaata hai
- Platform badalte hi View Ads page doosre platform par switch ho jaata hai

**Status filter sirf ad list par lagta hai**, spend/leads par nahi — kyunki daily entries me status hota hi nahi. Ye jaan-boojh kar hai: "Paused ads" chuno to spend wahi rahega jo us period me hua tha.

### Daily Stats — naya tab### Daily Stats — naya tab
Spend/leads ab **din-wise** store hote hain (`campaigns__daily-stats`): date · campaign · channel · spend · leads · impressions · clicks · source.

Bharne ke 2 raaste:
- **Add Daily Entry** button (cards page par)
- Live Ads list me har ad ke saamne **📅 button** — campaign aur channel pehle se bhare hue
- Same date + same campaign dobara daalo to purani entry **replace** hoti hai, jodti nahi

Meta sync chalu hone par yahi table apne aap bharega — structure ready hai.

**Zero handling:** jis din entry nahi hai wo din **0** dikhta hai, row halki grey ho jaati hai aur "no entry" likha aata hai.

**Fallback:** agar daily data hai hi nahi to campaign ke totals dikhte hain, aur upar hint aata hai ki Daily Stats bharo.

### Platform filter
Date chips ke saath ek **platform dropdown**:

`All Platforms · Facebook · Instagram · YouTube · Website`

Chunte hi:
- **Cards page** — sirf us platform ka card dikhta hai, baaki chhup jaate hain. Upar ek summary line: *Facebook · 6 live · 2 paused · ₹42,000 spend · 340 leads* + range chip + "Show all" button
- **View Ads page** — platform badalte hi seedha doosre platform par switch, back jaana nahi padta. "All Platforms" chuno to grid par wapas
- Card click karne par dropdown bhi wahi platform dikhane lagta hai — dono hamesha sync
- Date filter saath chalta hai: Facebook + Last 7 days = 7 din ka Facebook data

Jis platform ka daily data nahi hai wo **0** dikhata hai, khaali nahi.

### Card layout — left / right### Card layout — left / right
Har card par do rows, dono me **ek left ek right**:

```
Live          Paused
  6              2

Spend         Leads
₹42,000        340
```

Live hara, Paused amber. Spend/Leads date range ke hisaab se badalte hain.

**Cards page par koi alag stats row nahi hai** — filter ka asar seedha card ke andar ke numbers me dikhta hai. Spend label ke saath chhoti si range likhi rehti hai taaki pata rahe number kis period ka hai.

### View Ads page
- **Back button fix** — ab plain 38×38 icon button (`btn btn-ghost` class hata di jo layout bigaad rahi thi)
- **4 stat boxes**: Spend · Leads · Live · Paused — left-border colour ke saath, Leads box me us range ka CPL
- **Daily breakdown** — table ki jagah ab clean rows: left me calendar-style date tile (badi tareekh + mahina, aaj par hara "Today" tag), beech me Spend / Leads / CPL teen numbers + trend bar, right me "N ads reporting". Jis din kuch nahi hua wo row halki grey aur "No spend" pill ke saath
- **Ads on <platform>** — columns kam kiye: Campaign (naam + level chip + service ek saath), Budget, Spend, Leads, CPL, Status (sync uske neeche chhota). Numbers right-aligned, header me period likha
- **Ad list** me har ad ka **us range ka** spend/leads (total nahi) — column header me range likha hota hai
- Har ad par 📅 button us ad ki daily entry ke liye

### Live / Paused ke baare me
Ye **date-filtered nahi** hote — status aaj ka current state hai, kal ka status kahin store nahi hota. Spend aur Leads range ke hisaab se badalte hain, Live/Paused hamesha aaj ka count.

### Ad connect karne ke 2 tareeke
**Add Manually** — details khud bharo, row par `Local Only` badge.

**Link from Meta / Google** — 4 field ka modal: name, ad account, platform Campaign ID, service. Token active ho to `Synced`, warna `Pending`.

### ON / OFF toggle
Linked ad + Live token → "platform par bhi push ho gaya", sync `Synced`. Warna "abhi local only". Har toggle History tab me log.

## 3 · Creatives & Copy — ad me kaise dikhega

### Ad Preview (Ad Assets tab)
Har creative ke saamne 👁 button. Click karo to **4 surfaces** me actual layout:

- **Facebook Feed** — brand row, Sponsored label, above-copy, 1.91:1 media, domain + headline + CTA button
- **Instagram Feed** — 1:1 media, like/comment/share bar, caption
- **Story / Reel** — 9:16 vertical, progress bar, gradient bottom, swipe-up CTA
- **YouTube** — 16:9 wide, "Ad · 0:15"

Asset URL image ka hai to **actual image render hoti hai**. Warna placeholder batata hai ki URL add karo.

### Message Template Preview (Templates tab)
WhatsApp bubble jaisa preview — green header, chat background, white bubble, timestamp, aur buttons. Variables sample values se bharte hain: `{name}` → Rahul ji, `{service}` → Trademark Registration, `{amount}` → ₹5,999, `{offer}` → 20% off, `{link}` → vakilkaro.in/tm. Neeche approval badge aur template key.

### Creative ↔ Campaign linkage
- Campaign form me Creative dropdown **Ad Assets se apne aap bharta hai**
- Ad Assets table me **"Used In"** column — kitne campaigns me lag raha hai

---

## 4 · Ad Wallet

### Bank account — nahi rakha
Paisa aapke bank se seedha Meta/Google jaata hai, panel beech me aata hi nahi. Isliye account number aur IFSC store nahi hote — sirf **card ke last 4 digits**. Reconciliation ke liye itna kaafi hai, aur leak hone par kuch khone ko nahi.

Panel me ye baat **Balance tab par likhi hui hai**, taaki kisi ko sawaal na rahe.

### Payment Methods (naya tab)
Method name · type (Credit Card / Debit Card / UPI / NEFT / Wallet) · **last 4 digits only** (exactly 4 digits validate hote hain) · bank/issuer · linked ad account · auto-recharge on/off · auto amount.

Type UPI chuno to last4 chhup jaata hai aur UPI ID field aata hai. Auto-recharge Off ho to amount field chhup jaata hai.

### Balance tab — ab manual nahi
**Ad Accounts se accounts apne aap card ban ke aate hain.** Manually type karne ki zaroorat khatam.

Har card par:
- **Balance** = ledger ke credits − spends (calculate hota hai, store nahi)
- **Burn rate** = pichle 7 din ka spend ÷ 7
- **Days left** = balance ÷ burn, progress bar ke saath — 3 din se kam bache to bar laal
- Recharged / Spent / Last top-up
- Auto-recharge chip agar Payment Method me on hai
- **Recharge button** → modal (amount, date, payment method dropdown Payment Methods se, UTR, note) → seedha ledger me Credit entry

Balance kam hone par pura card laal tint me aa jaata hai aur `LOW` badge lagta hai.

---

## 5 · Lead Capture — day-wise view

Inbox Log ab plain table nahi, **din ke hisaab se** view hai.

### KPI strip
Today · Yesterday · This Week · This Month · Total

### Filters
Date range (Today / 7 / 30 / 90 / All) · Source · Service · Flag (Clean/Duplicate/Junk) · Assigned staff

### 3 sub-views

**Day-wise**
- **30-day bar chart** — har din ki lead count. Bar par click karo to us din ki leads khulti hain, bar kaala ho jaata hai
- **Breakdown table** — Date · Total · Meta · Google · Website · WhatsApp · Referral · Marketplace · Top Service · Quality (dup/junk badges). Aaj ki row par "Today" badge. Row click → us din ki poori list

**By Source** — source-wise leads, clean/duplicate/junk split, share % bar ke saath

**By Service** — service-wise leads, top source, share %

### Day drill-down
Us din ki saari leads: name, phone, source, campaign, service, assigned, flag, stage — aur har row par **click-to-call + click-to-WhatsApp**, edit, delete.

### Duplicate detection
Nayi lead add karte waqt agar wahi 10-digit number pehle se hai, **flag apne aap "Duplicate"** ho jaata hai aur toast batata hai.

### CSV Export
Filtered data download — 11 columns, filename me range aur date.

---

## Files

| File | Kaam |
|---|---|
| `lib/marketing-validate.js` | Validation rules engine + token state |
| `lib/marketing-config.js` | 8 modules, 23 tabs, 241 fields |
| `components/ModuleParts.js` | Formatters, FormModal, FieldInput, MetricStrip |
| `components/MarketingModuleClient.js` | Tab router + CRUD/builder/log/perf tabs |
| `components/CampaignCards.js` | 4 platform cards + drill-down + Meta link |
| `components/WalletBalance.js` | Auto account cards + recharge |
| `components/LeadDaywise.js` | Day-wise leads + chart + CSV |
| `components/AdPreview.js` | FB/IG/Story/YouTube + WhatsApp preview |

Design system, sidebar, login, auth — kuch nahi chhua. Naya CSS `globals.css` ke **ant me** append hua hai, purana koi rule badla nahi.
