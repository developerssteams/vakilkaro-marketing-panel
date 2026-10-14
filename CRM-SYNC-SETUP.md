# CRM se Lost Leads Sync — Setup Guide

Panel CRM ke MySQL se lost leads laata hai aur Audience → Lost Pool me daal deta hai.

**CRM me kuch nahi badalta.** Panel sirf `SELECT` karta hai — koi INSERT, UPDATE ya DELETE nahi. CRM ka code bhi chhedne ki zaroorat nahi.

---

## Step 1 · Hostinger me Remote MySQL enable karo

Ye pehla step hai. Iske bina connection timeout hoga.

1. **hPanel** → **Databases** → **Remote MySQL Databases**
2. Database select karo (CRM wala)
3. **IP address** daalo — jahan se panel chalega
   - Apna IP: `whatismyip.com` se
4. **Add**

> ⚠️ **Local pe chala rahi ho to IP roz badal sakta hai.** Router restart hua ya ISP ne badla — phir se whitelist karna padega. Panel server pe deploy karogi to fixed IP milega, ek baar ka kaam.

---

## Step 2 · Credentials nikalo

**hPanel → Databases → MySQL Databases**

Note karo:

| Kya | Kaisa dikhega |
|---|---|
| Host | `srv123.hstgr.io` — **`localhost` nahi** |
| Database | `u383361903_crm` |
| Username | `u383361903_admin` |
| Password | jo set kiya tha |

---

## Step 3 · `.env.local` me daalo

```dotenv
CRM_DB_HOST="srv123.hstgr.io"
CRM_DB_PORT="3306"
CRM_DB_NAME="u383361903_crm"
CRM_DB_USER="u383361903_admin"
CRM_DB_PASSWORD="tumhara-password"
CRM_LEADS_TABLE="leads"
```

Baaki `CRM_COL_*` abhi default rehne do — agle step me theek karenge.

**Server restart karo:**
```powershell
npm run dev
```

---

## Step 4 · Test dabao — yahi sabse kaam ka step hai

**Panel → Audience → Lost Pool → "Sync from CRM" → Test**

Teen cheezein dikhengi:

### A · Table ke saare columns
Inhi naamon ko `.env.local` me daalna hai.

### B · Saare stages, leads count ke saath
```
Price Issue        142
Not Answered        98
Less Interested     57
Won                890
New                 45
```

Jo lost ke liye chahiye wo `CRM_LOST_STATUS` me daalo — **exact naam**:
```dotenv
CRM_LOST_STATUS="Not Answered,Price Issue,Less Interested"
```

Hare chips wo hain jo already set hain.

### C · Kitni lost leads milengi

0 aaye to naam galat hai — upar wali list se copy karo.

**Har badlav ke baad server restart.**

---

## VakilKaro CRM ka structure

Tumhare CRM me lost status **`status` column me nahi** hai — `pipeline_stages` naam ki alag table me hai:

```
leads.stage_id  →  pipeline_stages.id  →  pipeline_stages.label
```

Isliye panel JOIN karta hai. Config aisa hai:

```dotenv
CRM_STAGE_TABLE="pipeline_stages"
CRM_STAGE_ID_COL="id"
CRM_STAGE_LABEL_COL="label"
CRM_COL_STAGE_ID="stage_id"
CRM_COL_PIPELINE_ID="pipeline_id"
```

Ye teeno bhare to stage-table mode chalu ho jaata hai. Khaali chhodo to simple `status` column wala mode chalta hai.

---

## Stage → Bucket mapping

Tumhare CRM ke stage naam seedha bucket ban jaate hain — **alag reason column ki zaroorat nahi**:

| CRM stage | Panel bucket |
|---|---|
| **Price Issue** | Price High |
| **Not Answered** | No Response |
| **Less Interested** | Baad Mein Karunga |
| Non-Relevant | Wrong / Junk |
| Very Interested | Baad Mein Karunga |
| Lost (generic) | keyword se dhoondha jaata hai |

Isiliye `CRM_COL_REASON` khaali chhod sakti ho — stage ka naam hi kaam kar jaata hai.

Testing me confirm hua: 6 lost leads me se **sabko bucket mila**, `needsBucket = 0`.

---

## Assigned To — staff ka column

CRM ka `assigned_to` panel me **"Assigned To"** column banke aata hai.

Lost Pool me:
- Table me column dikhta hai
- Upar **"All staff"** dropdown — har staff apni leads dekh sakta hai, aur **Unassigned** alag se
- **Unassigned** metric — kitni leads kisi ko assign nahi hain

Ye isliye kaam ka hai: jisne pehle baat ki thi wahi dobara call kare to recovery rate behtar hota hai — lead ko context yaad rehta hai.

### Staff ka naam kaise aata hai

VakilKaro CRM me `leads.assigned_to` me **staff ka ID** hota hai (jaise `6`), naam nahi.

Naam ke bina panel me `6` dikhta — kisi kaam ka nahi. Isliye panel `users` table se JOIN karke naam laata hai:

```
leads.assigned_to  →  users.id  →  users.name
```

Config:
```dotenv
CRM_COL_STAFF="assigned_to"
CRM_STAFF_TABLE="users"
CRM_STAFF_ID_COL="id"
CRM_STAFF_NAME_COL="name"
```

**LEFT JOIN** hai — jis lead pe koi assign nahi hai wo bhi aayegi, `(unassigned)` ke saath. Warna wo leads chhoot jaatin.

Testing me: `Rahul Dhobi`, `Shreya Mandal`, `Brajbhan Singh` — asli naam aaye, koi raw ID nahi.

---

## Sync me kya-kya hota hai

```
CRM MySQL
    ↓  SELECT (sirf padhna)
Lost status wali rows
    ↓
Phone normalize    → +91, 0, spaces hat jaate hain
    ↓
Duplicate check    → ek phone ek hi baar
    ↓
Service normalize  → "Trademark" → "Trademark Registration"
    ↓
Bucket detect      → reason ke keywords se
    ↓
Score calculate    → quote + recency + email
    ↓
Lost Pool
```

### Score kaise banta hai

| Signal | Points |
|---|---|
| Quote diya tha | +40 |
| Quote ₹25,000+ | +10 |
| 30 din ke andar lost | +25 |
| 31–90 din | +15 |
| Email hai | +10 |
| City hai | +5 |
| Har attempt | −5 |

70+ = High priority, 40–69 = Medium, neeche = Low.

Quote diya tha matlab paisa discuss hua — sabse bada intent signal hai.

---

## Dobara sync karna safe hai

Merge phone number se hota hai:

- **Nayi lead** → add ho jaati hai
- **Purani lead** → sirf khaali fields bharte hain
- **Recovered ya Archived** → chhoti nahi jaati, wapas pool me nahi aati
- **Attempts, cooldown, DND** → kabhi overwrite nahi hote

Ye aakhri wala zaroori hai — warna jis lead ko kal message bheja tha wo aaj phir calling list me aa jaati.

---

## Roz sync karne ke liye

Date filter me kal ki date daal do — sirf nayi lost leads aayengi.

Baad me cron se automatic ho jayega (deploy hone ke baad).

---

## Errors

| Error | Matlab | Fix |
|---|---|---|
| Connection timeout | Remote MySQL band hai | hPanel → Remote MySQL → IP add |
| Tumhara IP allowed nahi | IP badal gaya | Naya IP whitelist karo |
| Username ya password galat | credentials galat | hPanel se dobara check |
| Is naam ka database nahi mila | DB name galat | `u123456_` prefix poora daalo |
| Ye table nahi mili | table ka naam galat | `CRM_LEADS_TABLE` check |
| Koi column nahi mila | mapping galat | Test dabao, columns ki list dekho |
| Host nahi mila | `localhost` daal diya | `srv123.hstgr.io` daalo |
| Ek bhi lost lead nahi | status value galat | Test me status list dekho |

---

## Security

- Panel **sirf SELECT** karta hai — CRM me kuch likh nahi sakta
- Column ke naam sanitize hote hain (SQL injection se bacha)
- Password sirf server pe rehta hai, browser me kabhi nahi jaata
- **Read-only MySQL user** banao to aur behtar:

```sql
CREATE USER 'panel_read'@'%' IDENTIFIED BY 'strong-password';
GRANT SELECT ON u383361903_crm.leads TO 'panel_read'@'%';
```

Isse galti se bhi CRM ka data nahi bigad sakta.


---

## Buckets ke counts

`Audience → Buckets` me teen column apne aap bharte hain:

| Column | Kahan se |
|---|---|
| **Leads in Bucket** | Lost Pool se gina jaata hai — jitni leads ka bucket ye hai |
| **Recovered** | Unme se jinka status "Recovered" ho gaya |
| **Recovery %** | Recovered ÷ Leads |

Ye pehle manual number fields the — koi bharta hi nahi tha, isliye hamesha khaali dikhte the. Ab live gine jaate hain, aur form me edit nahi ho sakte (warna number jhootha ho jaata).

Matching case-insensitive hai aur spaces ignore karta hai — `Price High`, `price high`, `  Price High  ` teeno ek hi ginte hain.

### Bucket ka naam exact rakhna

Sync `pipeline_stages.label` se bucket ka naam match karta hai:

| CRM stage | Bucket ka naam (exact) |
|---|---|
| Price Issue | `Price High` |
| Not Answered | `No Response` |
| Less Interested | `Baad Mein Karunga` |

Naam alag hua to lead ka bucket khaali reh jayega, aur cooldown/attempts kaam nahi karenge.
