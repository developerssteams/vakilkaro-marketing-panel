# VakilKaro Growth Panel — Modules & Tabs

11 sidebar modules, 30 tabs. Purane 22 module-plan ki har cheez inhi ke andar hai.

## OVERVIEW

### 1. Dashboard
Single screen. Money row (spend, wallet balance, burn, days remaining) · Lead row (leads, CPL, qualified %, cost per won) · Return row (ROAS, recovered, cost per recovery, live ads) · Alerts strip · **Source split** (kis jagah se kitni leads) · **Service-wise CPL** · **Loop meter** (leads → won → pool → recovered).

## MARKETING

### 2. Ad Accounts
| Tab | Content |
|---|---|
| Accounts | Multi Meta + Google, token badge (Live/Expiring/Disconnected), Default flag, BM ID, Page, Pixel, monthly limit |
| Sync Log | Insights pull history, rows pulled, error message, retry status |

### 3. Campaigns
| Tab | Content |
|---|---|
| Live Ads | Campaign → Ad Set → Ad (3 level), spend/impressions/clicks/leads/won, live CPL + CTR columns, CPL cap, auto-pause, Meta sync state, ON/OFF status cycle |
| Create Ad | Objective → audience → placement → budget → schedule → creative → **Publish** (record Live Ads me chala jaata hai) |
| History | Auto change log — kisne kab kya create/update/delete/status change kiya |

### 4. Creatives & Copy
| Tab | Content |
|---|---|
| Ad Assets | Image/Video/Reel/Carousel/Copy, hook, CTA, landing URL, version, CTR, CPL, Draft→Review→Approved→Live |
| Message Templates | WhatsApp/Email/SMS, Meta template or DLT ID, Hindi/English/Hinglish, variables, approval state, reply rate |
| Performance | Dono ka ranked leaderboard — creative CTR/CPL aur template reply rate |

### 5. Ad Wallet
| Tab | Content |
|---|---|
| Balance | Per-account balance, daily burn, low threshold, auto-recharge, **Days Left** computed |
| Ledger | Credit/Spend/Refund/Adjustment, pay mode, UTR, campaign tag |
| Billing | GST invoice number, vendor, taxable + GST amount, GSTIN, **ITC status** |

### 6. Lead Capture
| Tab | Content |
|---|---|
| Sources | Paid/Organic/Owned/Offline, UTM source, default team, fixed monthly cost, leads/won, computed CPL + Conversion |
| Forms & Webhook | Meta form ID, field map JSON, auto-assign rule (Round Robin / Lead Quota / Fixed / Manual), last lead |
| Inbox Log | Raw lead rows, **Duplicate / Junk flag**, stage, assigned to, failed retry |

## REMARKETING

### 7. Audience
| Tab | Content |
|---|---|
| Lost Pool | Non-converted leads, bucket, quoted amount, attempts, next eligible, priority, **DND flag**, state |
| Buckets | Price High / Baad Mein / Competitor / Budget Nahi / No Response / Docs Nahi / Junk — cooldown, max attempts, auto journey, computed Recovery % |
| Segments | Custom Audience / Lookalike / Suppression, static vs dynamic, filter rule, size, overlap, **Meta push state** |

### 8. Outreach
| Tab | Content |
|---|---|
| Broadcast | One-time WhatsApp/Email/SMS, audience, template, throttle/hour, exclude DND, sent/delivered/read/replies/failed, cost, computed Delivery % + Reply % |
| Journeys | Multi-step drip — journey name, step no, day offset, channel, template, offer, A/B variant, stop-on-reply, throttle, computed Recovery % |
| Offers | Percent/Flat, bucket + service scope, min order, max uses, used count, **approval limit**, validity window |

### 9. Win-back Queue
| Tab | Content |
|---|---|
| My Queue | Daily calling list — **click-to-call + click-to-WhatsApp buttons**, disposition (Connected/Interested/Callback/Not Reachable/Final No/Wrong Number), remark, snooze, priority, owner |
| Recovered | Quoted → final order value, recovery cost, journey/offer used, days to recover, attribution (Remarketing vs Original Campaign), **Work Allocation handoff state** |

## SYSTEM

### 10. Analytics
| Tab | Content |
|---|---|
| Funnel | Impression → Click → Lead → Contacted → Qualified → Won, bar chart + CTR/lead-rate/close-rate |
| Marketing | Creative performance, source performance, staff-wise conversion, lost-reason × campaign cross-tab |
| Remarketing | Recovery rate, message funnel (sent→delivered→read→replied→converted), bucket-wise recovery, journey performance, staff-wise recovery, dead pool |
| Compare | **Cost per recovery vs fresh CPL** — volume, revenue, cost, ROAS side by side + verdict |

### 11. Settings
| Tab | Content |
|---|---|
| Thresholds | CPL threshold, wallet low, cooldown days, max attempts, throttle/day + /hour, **attribution model lock**, lead SLA, timezone |
| Automation | Cron scheduler (Meta sync, journey runs, broadcast dispatch), 6 alert rules with toggles, 3 delivery channels, Run Now, job log |
| Integrations | WA_PHONE_ID / WA_TOKEN / WA_LANG, Meta App ID + Secret + webhook verify token, payment gateway for recharge |
| Compliance | **DND registry** (add/remove, TRAI), suppression rules, full **audit log** |
| Team | Add members, 4 role presets (Growth Head / Ads Manager / Remarketing Executive / Analyst), **per-module permission matrix** (None/View/Edit/Full), profile |

---

## Old 22 → New 11 coverage

| Old module | Now lives in |
|---|---|
| 1. Dashboard | Dashboard |
| 2. Ad Accounts | Ad Accounts → Accounts |
| 3. Channels & Sources | Lead Capture → Sources |
| 4. Campaigns (Ads Manager) | Campaigns → Live Ads + Create Ad |
| 5. Creatives & Copy | Creatives & Copy → Ad Assets |
| 6. Ad Wallet & Billing | Ad Wallet → Balance / Ledger / Billing |
| 7. Lead Capture | Lead Capture → Forms & Webhook + Inbox Log |
| 8. Marketing Analytics | Analytics → Funnel + Marketing |
| 9. Audiences & Segments | Audience → Segments |
| 10. Lost-Lead Pool | Audience → Lost Pool |
| 11. Reason Buckets | Audience → Buckets |
| 12. Broadcast | Outreach → Broadcast |
| 13. Sequences (Journeys) | Outreach → Journeys |
| 14. Templates Library | Creatives & Copy → Message Templates |
| 15. Offers | Outreach → Offers |
| 16. Win-back Queue | Win-back Queue → My Queue |
| 17. Recovered | Win-back Queue → Recovered |
| 18. Remarketing Analytics | Analytics → Remarketing + Compare |
| 19. Automation & Alerts | Settings → Automation |
| 20. Growth Settings | Settings → Thresholds + Integrations + Compliance |
| 21. Users & Roles | Settings → Team |
| 22. Profile / Notifications | Settings → Team |

## Data storage

Har tab ka apna localStorage bucket: `vk_marketing_<module>__<tab>`.
Example: `vk_marketing_campaigns__live-ads`, `vk_marketing_audience__lost-pool`.

Dashboard aur Analytics inhi buckets se live calculate karte hain — koi alag pipeline nahi.
Activity log `vk_marketing_activity-log` me jaata hai (Campaigns → History aur Settings → Compliance dono wahi padhte hain).
