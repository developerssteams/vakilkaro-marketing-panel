# Remarketing — kya chalta hai, kya atka hai

## AUDIENCE — poora ✅

| Tab | Status |
|---|---|
| Lost Pool | CRM sync, staff naam, score, priority, filters |
| Buckets | Cooldown, attempts, **live lead count** |
| Segments | Banana + filter ✅ · **Meta push ❌** |

---

## WIN-BACK QUEUE — ab poora ✅

### Build Today's Queue *(naya)*

`Win-back Queue → Build Today's Queue`

Pehle queue haath se bharni padti thi — 800 leads me se roz kisko call karna hai ye decide karna practically hota hi nahi tha.

Ab rules se banti hai:

| Check | Kya |
|---|---|
| Cooldown | Khatam ho chuka ho |
| Attempts | Bucket ki limit se kam |
| DND | Nahi |
| Pehle se queue me | Nahi |
| Recovered/Archived | Nahi |
| Bucket paused | Nahi |

Phir **score ke hisaab se sort** — quote diya tha aur haal ki lead sabse upar.

**Preview pehle dikhta hai:** kitni eligible, kaun kis wajah se chhoot rahi, kis staff ko kitni milengi, aur top 5 leads. Confirm karne par hi queue banti hai.

**Staff assign — do tareeke:**
- **Jisne pehle baat ki thi** (default) — context dono taraf yaad rehta hai, recovery behtar
- **Barabar baanto** — sirf unassigned leads baantti hai, jo already assigned hain unhe nahi chhedti

### Disposition ka loop *(naya)*

Call ke baad disposition set karo, to Lost Pool me apne aap update hota hai:

| Disposition | Lost Pool me |
|---|---|
| **Wrong Number** | Archived + DND on |
| **Final No** | Archived |
| **Interested** | Priority High, cooldown nahi — turant follow |
| **Callback** | 3 din ka cooldown |
| Connected / Not Reachable | Bucket ka cooldown |

Attempts hamesha +1.

Bina iske wahi lead kal phir queue me aa jaati, aur staff ko dobara call karna padta.

### Recovered mark karna *(naya)*

Queue me har row ke aage 🏆 button. Dabate hi modal khulta hai — Lost Pool se quote, service, bucket aur lost date **apne aap** bhar jaate hain.

Sirf **Final order value** daalni hai. Baaki:

| Field | Kaise |
|---|---|
| Days to recover | Lost date se apne aap |
| Recovery cost | Discount se apne aap (quote − order value) |
| Bucket | Lost Pool se carry |
| Offer | Dropdown se — usage counter bhi badhta hai |

**Save karte hi teen jagah update hota hai:**

1. **Recovered tab** me row banti hai
2. **Lost Pool** me status `Recovered` — *bucket ka Recovery % isi se banta hai*
3. **Queue** se lead hat jaati hai

Pehle ye teeno haath se karne padte the. Do jagah likhna matlab ek jagah reh jaana — phir bucket ka Recovery % kabhi sach nahi dikhta tha.

---

## OUTREACH — 3 me se 2 chalte hain

| Tab | Status | Kyun |
|---|---|---|
| **Broadcast** | ✅ Poora | Audience → template → send → live report |
| **Reply Inbox** | ✅ Poora | Reply → ek click → queue |
| **Journeys** | ⚠️ Define ho jaati, chalti nahi | **Scheduler chahiye** |
| **Offers** | ✅ CRUD | Approval limit, usage count |

### Journeys kyun atka hai

Journey ko roz check karna padta hai: *"aaj kis lead ka Day 5 hai?"*

Iske liye ek **scheduler** chahiye jo panel band hone par bhi chale. Local pe `npm run dev` band karo to kuch nahi chalega.

Deploy hone ke baad:
- **Vercel** → Vercel Cron (free plan me milta hai)
- **VPS** → normal crontab

**Ye deploy pe atka hai, code pe nahi.** Deploy hote hi 3-4 din ka kaam hai.

---

## Jo abhi atka hai

| Kya | Kis wajah se | Kab hoga |
|---|---|---|
| Broadcast se message jaana | **WA_TOKEN** nahi hai | Token milte hi |
| Journeys chalna | **Deploy + cron** | Vercel pe |
| Segments Meta push | Code baaki | 2 din |
| Team RBAC | **Postgres** chahiye | Migration ke saath |
| Automation cron | **Deploy** | Vercel pe |

---

## Roz ka flow — ab kya hoga

```
Subah
  Win-back Queue → Build Today's Queue → 50 leads
  Staff apna filter lagake apni list dekhe

Din bhar
  Call karo → disposition set karo
  Lost Pool apne aap update — attempts, cooldown

Reply aaye
  Outreach → Reply Inbox → ek click → queue me High priority

Bulk push
  Outreach → Broadcast → bucket chuno → template → send
  (WA token ke baad)
```
