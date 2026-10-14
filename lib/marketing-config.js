/* ============================================================
   lib/marketing-config.js
   Growth Panel — har module ke andar tabs, aur har tab ka apna dataset.
   Purane 22 modules yahin 11 modules ke tabs me merge hue hain.

   Tab types:
     crud    → table + add/edit modal (default)
     builder → form jo target tab ke dataset me record daalta hai
     log     → read-only activity feed
     perf    → doosre datasets se banne wala computed table
   ============================================================ */

const SERVICES = [
  "Trademark Registration", "Company Registration", "Section 8 / NGO",
  "Section 8 Microfinance", "NBFC Registration", "GST Registration",
  "FSSAI License", "LLP Registration", "ODR / Mediation", "Other",
];

const PLATFORMS = ["Meta", "Google Ads", "YouTube", "LinkedIn", "Other"];
const CHANNELS = ["WhatsApp", "Email", "SMS", "Call"];
const BUCKETS = [
  "Price High", "Baad Mein Karunga", "Competitor Se Karwa Liya",
  "Budget Nahi", "No Response", "Documents Nahi The", "Wrong / Junk",
];

export const MARKETING_MODULES = {
  /* ========================================================
     AD ACCOUNTS   (purana #2)
     ======================================================== */
  "ad-accounts": {
    title: "Ad Accounts",
    icon: "fa-rectangle-ad",
    description: "Your Meta ad accounts, token health and spend — all in one place. Data syncs automatically.",
    tabs: [
      {
        key: "accounts",
        label: "Accounts",
        icon: "fa-plug",
        singular: "Ad Account",
        description: "Each account has its own wallet, token and default flag. Token state is derived from expiry automatically.",
        metrics: [
          { label: "Accounts", kind: "count" },
          { label: "Live Tokens", kind: "tokenLive" },
          { label: "Monthly Limit", kind: "money", field: "monthlyLimit" },
          { label: "Needs Attention", kind: "tokenBad" },
        ],
        fields: [
          { key: "name", label: "Account Name", type: "text", required: true, unique: true,
            rules: [{ type: "length", min: 3, max: 100 }] },
          { key: "platform", label: "Platform", type: "select", options: PLATFORMS, required: true },
          { key: "accountId", label: "Ad Account ID", type: "text", required: true, unique: true, uniqueWith: "platform",
            hint: "Meta: act_123456789 · Google: 123-456-7890", rules: [{ type: "accountId" }] },
          { key: "bmId", label: "Business Manager ID", type: "text", rules: [{ type: "digits", min: 10, max: 20 }],
            hideWhen: (f) => f.platform === "Google Ads" },
          { key: "pageId", label: "Page ID", type: "text", rules: [{ type: "digits", min: 10, max: 20 }],
            hideWhen: (f) => f.platform === "Google Ads" },
          { key: "pageName", label: "Page / Channel Name", type: "text",
            hideWhen: (f) => f.platform === "Google Ads" },
          { key: "pixelId", label: "Pixel ID", type: "text", rules: [{ type: "digits", min: 10, max: 20 }],
            hideWhen: (f) => f.platform === "Google Ads" },
          { key: "conversionId", label: "Conversion ID", type: "text",
            hideWhen: (f) => f.platform !== "Google Ads" },
          { key: "tokenExpiry", label: "Token Expiry", type: "date", rules: [{ type: "futureDate" }],
            hint: "Filled automatically when a Meta account is connected via \"Connect Meta Account\". The token itself lives in .env, not here." },
          { key: "isDefault", label: "Default Account", type: "select", options: ["Yes", "No"], default: "No",
            hint: "Only one default per platform — setting a new one removes the old one" },
          { key: "currency", label: "Currency", type: "select", options: ["INR", "USD", "AED"], default: "INR" },
          { key: "monthlyLimit", label: "Monthly Limit", type: "number", rules: [{ type: "range", min: 0, max: 10000000 }] },
          { key: "owner", label: "Owner", type: "text", rules: [{ type: "length", min: 2, max: 60 }] },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Disabled"], default: "Active" },
          /* Sirf table me dikhte hain — Meta se apne aap bharte hain */
          { key: "lastSync", label: "Last Sync", type: "date", hideWhen: () => true },
          { key: "metaStatus", label: "Meta Status", type: "text", hideWhen: () => true },
          { key: "bmName", label: "Business", type: "text", hideWhen: () => true },
          { key: "amountSpent", label: "Lifetime Spend", type: "number", hideWhen: () => true },
        ],
        columns: ["name", "accountId", "bmName", "metaStatus", "amountSpent", "lastSync", "isDefault", "status"],
        tokenColumn: true,
        metaConnect: true,
        singleDefault: { field: "isDefault", scope: "platform" },
        deleteGuard: [
          { dataset: "campaigns__live-ads", match: "account", label: "campaigns" },
          { dataset: "ad-wallet__ledger", match: "account", label: "wallet entries" },
        ],
      },
    ],
  },

  /* ========================================================
     CAMPAIGNS   (purana #4)
     ======================================================== */
  campaigns: {
    title: "Campaigns",
    icon: "fa-bullhorn",
    description: "Control ads from platform cards — Facebook, Instagram, YouTube and Website separately.",
    tabs: [
      {
        key: "live-ads",
        label: "Live Ads",
        icon: "fa-tower-broadcast",
        type: "cards",
        singular: "Ad",
        description: "Each platform has its own card. Open a card to see all of that platform's ads.",
        platforms: [
          { key: "Facebook",  label: "Facebook",  icon: "fa-facebook", brand: "#0866FF", source: "Meta",       linkable: true },
          { key: "Instagram", label: "Instagram", icon: "fa-instagram", brand: "#E1306C", source: "Meta",      linkable: true },
          { key: "YouTube",   label: "YouTube",   icon: "fa-youtube",  brand: "#FF0000", source: "Google Ads", linkable: true },
          { key: "Website",   label: "Website",   icon: "fa-globe",    brand: "#159C95", source: "Website",    linkable: false },
        ],
        fields: [
          { key: "name", label: "Ad / Campaign Name", type: "text", required: true, rules: [{ type: "length", min: 3, max: 120 }] },
          { key: "channel", label: "Platform Card", type: "select", options: ["Facebook", "Instagram", "YouTube", "Website"], required: true },
          { key: "level", label: "Level", type: "select", options: ["Campaign", "Ad Set", "Ad"], default: "Campaign", required: true },
          { key: "parent", label: "Parent (Campaign / Ad Set)", type: "text" },
          { key: "account", label: "Ad Account", type: "select", optionsFrom: "ad-accounts__accounts", optionLabel: "name" },
          { key: "objective", label: "Objective", type: "select", options: ["Leads", "Sales", "Traffic", "Messages", "Awareness", "Remarketing"], required: true },
          { key: "service", label: "Service (mandatory)", type: "select", options: SERVICES, required: true },
          { key: "audience", label: "Audience / Segment", type: "text" },
          { key: "placement", label: "Placement", type: "select", options: ["Automatic", "Feed", "Stories", "Reels", "Search", "Display", "YouTube"], default: "Automatic" },
          { key: "dailyBudget", label: "Daily Budget", type: "number", rules: [{ type: "range", min: 0, max: 5000000 }] },
          { key: "spend", label: "Spend", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "impressions", label: "Impressions", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "clicks", label: "Clicks", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "leads", label: "Leads", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "won", label: "Won", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "revenue", label: "Revenue", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "adSetId", label: "Meta Ad Set ID", type: "text" },
          { key: "adId", label: "Meta Ad ID", type: "text" },
          { key: "leadFormId", label: "Lead Form ID", type: "text" },
          { key: "extId", label: "Meta / Google Campaign ID", type: "text", hint: "Copy from Ads Manager and paste — to link it" },
          { key: "metaSync", label: "Sync State", type: "select", options: ["Synced", "Pending", "Local Only"], default: "Local Only" },
          { key: "startDate", label: "Start Date", type: "date" },
          { key: "endDate", label: "End Date", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Draft", "Completed", "Archived"], default: "Draft" },
        ],
        columns: ["name", "level", "service", "dailyBudget", "spend", "leads", "won", "status"],
      },
      {
        key: "daily-stats",
        label: "Daily Stats",
        icon: "fa-calendar-day",
        singular: "Daily Entry",
        description: "Daily spend and leads. Days with no entry count as 0. Once Meta sync is on, this table fills automatically.",
        metrics: [
          { label: "Entries", kind: "count" },
          { label: "Total Spend", kind: "money", field: "spend" },
          { label: "Total Leads", kind: "num", field: "leads" },
          { label: "Last Entry", kind: "latest", field: "date" },
        ],
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "campaign", label: "Campaign", type: "select", optionsFrom: "campaigns__live-ads", optionLabel: "name", required: true },
          { key: "channel", label: "Platform Card", type: "select", options: ["Facebook", "Instagram", "YouTube", "Website"], required: true },
          { key: "spend", label: "Spend", type: "number", rules: [{ type: "range", min: 0, max: 5000000 }] },
          { key: "leads", label: "Leads", type: "number", rules: [{ type: "range", min: 0, max: 100000 }] },
          { key: "impressions", label: "Impressions", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "clicks", label: "Clicks", type: "number", rules: [{ type: "range", min: 0 }] },
          { key: "source", label: "Entered By", type: "select", options: ["Manual", "Meta Sync", "Google Sync"], default: "Manual" },
        ],
        columns: ["date", "campaign", "channel", "spend", "leads", "impressions", "clicks", "source"],
        computed: [{ label: "CPL", kind: "ratioMoney", num: "spend", den: "leads" }],
      },
      {
        key: "lead-forms",
        label: "Lead Forms",
        icon: "fa-rectangle-list",
        type: "leadforms",
        description: "Every running campaign's lead form — which questions (columns) it asks, their type and options. Read straight from Meta.",
      },
      {
        key: "states",
        label: "States",
        icon: "fa-map-location-dot",
        type: "states",
        description: "Which state the leads of your running campaigns come from — leads, spend and cost per lead for every state. Read straight from Meta.",
      },
    ],
  },

  /* ========================================================
     AD WALLET   (purana #6)
     ======================================================== */
  "ad-wallet": {
    title: "Ad Wallet",
    icon: "fa-wallet",
    description: "Balance and payment history of every ad account — ad money runs from here.",
    tabs: [
      {
        key: "balance",
        label: "Balance & Payments",
        icon: "fa-sack-dollar",
        type: "wallet",
        description: "Balance of every ad account and the full payment history — all in one place.",
      },
    ],
  },

  /* ========================================================
     LEAD CAPTURE   (purana #3 + #7)
     ======================================================== */
  "lead-capture": {
    title: "Lead Capture",
    icon: "fa-user-plus",
    description: "Leads by source, form mapping and inbox log — the path from ad to panel.",
    tabs: [
      {
        key: "inbox-log",
        metaLeadPull: true,
        label: "All Leads",
        icon: "fa-inbox",
        singular: "Lead",
        type: "daywise",
        dateField: "receivedAt",
        description: "Leads by day — how many came each day, from which source, for which service.",
        metrics: [
          { label: "Leads In", kind: "count" },
          { label: "Duplicates", kind: "countWhere", field: "flag", value: "Duplicate" },
          { label: "Junk", kind: "countWhere", field: "flag", value: "Junk" },
          { label: "Failed", kind: "countWhere", field: "status", value: "Failed" },
        ],
        fields: [
          { key: "name", label: "Lead Name", type: "text", required: true },
          { key: "receivedAt", label: "Received On", type: "date", required: true },
          { key: "phone", label: "Phone", type: "text", rules: [{ type: "phone" }] },
          { key: "email", label: "Email", type: "email" },
          { key: "source", label: "Source", type: "select", options: ["Meta", "Google", "Website", "WhatsApp", "Referral", "Marketplace", "Other"], required: true },
          { key: "campaign", label: "Campaign", type: "text" },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "assignedTo", label: "Assigned To", type: "text" },
          { key: "flag", label: "Flag", type: "select", options: ["Clean", "Duplicate", "Junk"], default: "Clean" },
          { key: "stage", label: "Stage", type: "select", options: ["New", "Contacted", "Qualified", "Converted", "Lost"], default: "New" },
          { key: "status", label: "Status", type: "select", options: ["Received", "Assigned", "Failed", "Retried"], default: "Received" },
        ],
        columns: ["receivedAt", "name", "phone", "source", "campaign", "service", "flag", "stage", "status"],
      },
      {
        key: "sources",
        label: "Sources",
        icon: "fa-diagram-project",
        singular: "Source",
        description: "Paid, organic, owned and offline — lead count, CPL and conversion for every source.",
        metrics: [
          { label: "Sources", kind: "count" },
          { label: "Leads", kind: "num", field: "leads" },
          { label: "Fixed Cost / mo", kind: "money", field: "monthlyCost" },
          { label: "Blended CPL", kind: "ratioMoney", num: "spend", den: "leads" },
        ],
        fields: [
          { key: "name", label: "Source Name", type: "text", required: true },
          { key: "kind", label: "Kind", type: "select", options: ["Paid", "Organic", "Owned", "Offline"], required: true },
          { key: "utmSource", label: "UTM Source", type: "text" },
          { key: "defaultTeam", label: "Default Team / Desk", type: "text" },
          { key: "monthlyCost", label: "Fixed Cost / Month", type: "number", hint: "SEO retainer, JustDial subscription" },
          { key: "spend", label: "Spend (period)", type: "number" },
          { key: "leads", label: "Leads", type: "number" },
          { key: "qualified", label: "Qualified", type: "number" },
          { key: "won", label: "Won", type: "number" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused"], default: "Active" },
        ],
        columns: ["name", "kind", "utmSource", "leads", "won", "monthlyCost", "status"],
        computed: [
          { label: "CPL", kind: "ratioMoney", num: "spend", den: "leads" },
          { label: "Conversion", kind: "ratioPct", num: "won", den: "leads" },
        ],
      },
      {
        key: "forms",
        label: "Forms & Webhook",
        icon: "fa-file-import",
        singular: "Form",
        description: "Meta Lead Ads webhook, field mapping and auto-assign rule.",
        metrics: [
          { label: "Forms Mapped", kind: "count" },
          { label: "Live Webhooks", kind: "countWhere", field: "status", value: "Live" },
          { label: "Leads Received", kind: "num", field: "received" },
          { label: "Last Lead", kind: "latest", field: "lastLeadAt" },
        ],
        fields: [
          { key: "formName", label: "Form Name", type: "text", required: true },
          { key: "formId", label: "Meta Form ID", type: "text", required: true },
          { key: "account", label: "Ad Account", type: "text" },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "fieldMap", label: "Field Map (JSON)", type: "textarea", hint: '{"full_name":"name","phone_number":"phone"}' },
          { key: "assignRule", label: "Auto-assign Rule", type: "select", options: ["Round Robin", "Lead Quota", "Fixed Owner", "Manual"], default: "Round Robin" },
          { key: "assignTo", label: "Assign To", type: "text" },
          { key: "received", label: "Leads Received", type: "number" },
          { key: "lastLeadAt", label: "Last Lead At", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Live", "Paused", "Error"], default: "Live" },
        ],
        columns: ["formName", "formId", "service", "assignRule", "received", "lastLeadAt", "status"],
      },
    ],
  },

  /* ========================================================
     AUDIENCE   (purana #9 + #10 + #11)
     ======================================================== */
  audience: {
    title: "Audience",
    icon: "fa-users-viewfinder",
    description: "Lost pool, reason buckets and Meta segments — the data to work on.",
    tabs: [
      {
        key: "lost-pool",
        label: "Lost Pool",
        crmSync: true,
        icon: "fa-layer-group",
        singular: "Lost Lead",
        description: "All non-converted leads — with score, cooldown and DND.",
        metrics: [
          { label: "In Pool", kind: "count" },
          { label: "Quoted Value", kind: "money", field: "quoted" },
          { label: "DND Flagged", kind: "countWhere", field: "dnd", value: "Yes" },
          { label: "High Priority", kind: "countWhere", field: "priority", value: "High" },
          { label: "Unassigned", kind: "countWhere", field: "lastStaff", value: "" },
        ],
        fields: [
          { key: "name", label: "Lead Name", type: "text", required: true },
          { key: "phone", label: "Phone", type: "text", required: true },
          { key: "email", label: "Email", type: "email" },
          { key: "city", label: "City", type: "text" },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "bucket", label: "Reason Bucket", type: "select", options: BUCKETS },
          { key: "lostReason", label: "Lost Reason (note)", type: "text" },
          { key: "quoted", label: "Quoted Amount", type: "number" },
          { key: "campaign", label: "Source Campaign", type: "text" },
          { key: "lastStaff", label: "Assigned To", type: "text", hint: "CRM assigned_to — whoever last spoke to them" },
          { key: "lostAt", label: "Lost Date", type: "date" },
          { key: "attempts", label: "Attempts", type: "number", default: "0" },
          { key: "nextEligible", label: "Next Eligible", type: "date" },
          { key: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
          { key: "dnd", label: "DND", type: "select", options: ["No", "Yes"], default: "No" },
          { key: "status", label: "State", type: "select", options: ["Pool", "Sequenced", "Queued", "Recovered", "Archived"], default: "Pool" },
        ],
        columns: ["name", "phone", "service", "bucket", "lastStaff", "quoted", "attempts", "priority", "status"],
      },
      {
        key: "buckets",
        label: "Buckets",
        icon: "fa-tags",
        singular: "Bucket",
        description: "Reason buckets — cooldown, max attempts and auto-journey mapping.",
        metrics: [
          { label: "Buckets", kind: "count" },
          { label: "Leads Tagged", kind: "num", field: "leadCount" },
          { label: "Recovered", kind: "num", field: "recovered" },
          { label: "Auto-mapped", kind: "countWhere", field: "autoMap", value: "Yes" },
        ],
        fields: [
          { key: "name", label: "Bucket Name", type: "text", required: true },
          { key: "description", label: "Description", type: "text" },
          { key: "cooldownDays", label: "Cooldown (days)", type: "number", default: "30" },
          { key: "maxAttempts", label: "Max Attempts", type: "number", default: "3" },
          { key: "journey", label: "Auto Journey", type: "text" },
          { key: "autoMap", label: "Auto Map", type: "select", options: ["Yes", "No"], default: "Yes" },
          { key: "leadCount", label: "Leads In Bucket", type: "number", readOnly: true, hint: "Counted automatically from Lost Pool" },
          { key: "recovered", label: "Recovered", type: "number", readOnly: true, hint: "Counted automatically" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused"], default: "Active" },
        ],
        columns: ["name", "cooldownDays", "maxAttempts", "journey", "leadCount", "recovered", "status"],
        computed: [{ label: "Recovery %", kind: "ratioPct", num: "recovered", den: "leadCount" }],
        /* Leads in Bucket / Recovered Lost Pool se live gine jaate hain —
           manual rakhne se number kabhi sach nahi rehta. */
        liveCount: { from: "audience__lost-pool", poolField: "bucket", matchOn: "name" },
      },
      {
        key: "segments",
        label: "Segments",
        icon: "fa-object-group",
        singular: "Segment",
        description: "Saved and dynamic segments — Custom Audience, Lookalike and suppression list.",
        metrics: [
          { label: "Segments", kind: "count" },
          { label: "Total Size", kind: "num", field: "size" },
          { label: "Pushed to Meta", kind: "countWhere", field: "metaPush", value: "Pushed" },
          { label: "Suppression", kind: "countWhere", field: "type", value: "Suppression" },
        ],
        fields: [
          { key: "name", label: "Segment Name", type: "text", required: true },
          { key: "type", label: "Segment Type", type: "select", options: ["Custom Audience", "Lookalike", "Suppression", "Website Visitors", "Lead List", "Engagers", "Customers"], required: true },
          { key: "mode", label: "Mode", type: "select", options: ["Static", "Dynamic"], default: "Dynamic" },
          { key: "rule", label: "Filter Rule", type: "textarea", hint: "service = NGO AND bucket = Price High AND city = Jaipur" },
          { key: "platform", label: "Platform", type: "select", options: [...PLATFORMS, "Multi-platform"] },
          { key: "size", label: "Estimated Size", type: "number" },
          { key: "overlap", label: "Overlap %", type: "number" },
          { key: "sourceOf", label: "Lookalike Source", type: "text" },
          { key: "metaPush", label: "Meta Push", type: "select", options: ["Pushed", "Pending", "Not Pushed"], default: "Not Pushed" },
          { key: "status", label: "Status", type: "select", options: ["Ready", "Building", "Paused", "Archived"], default: "Building" },
        ],
        columns: ["name", "type", "mode", "platform", "size", "metaPush", "status"],
      },
    ],
  },

  /* ========================================================
     OUTREACH   (purana #12 + #13 + #15)
     ======================================================== */
  outreach: {
    title: "Outreach",
    icon: "fa-paper-plane",
    description: "Broadcast, multi-step journeys and offers — every way to send messages.",
    tabs: [
      {
        key: "broadcast",
        label: "Broadcast",
        icon: "fa-tower-cell",
        type: "broadcast",
        singular: "Broadcast",
        description: "One-time WhatsApp blast — choose audience, apply an approved template, and see the live delivery report.",
        metrics: [
          { label: "Sent", kind: "num", field: "sent" },
          { label: "Delivered", kind: "num", field: "delivered" },
          { label: "Replies", kind: "num", field: "replies" },
          { label: "Reply Rate", kind: "ratioPct", num: "replies", den: "sent" },
        ],
        fields: [
          { key: "name", label: "Broadcast Name", type: "text", required: true },
          { key: "channel", label: "Channel", type: "select", options: [...CHANNELS, "Mixed"], required: true },
          { key: "audience", label: "Audience / Segment", type: "text", required: true },
          { key: "template", label: "Template", type: "text" },
          { key: "throttle", label: "Throttle / hour", type: "number", default: "200" },
          { key: "excludeDnd", label: "Exclude DND", type: "select", options: ["Yes", "No"], default: "Yes" },
          { key: "scheduledAt", label: "Schedule Date", type: "date" },
          { key: "sent", label: "Sent", type: "number" },
          { key: "delivered", label: "Delivered", type: "number" },
          { key: "read", label: "Read", type: "number" },
          { key: "replies", label: "Replies", type: "number" },
          { key: "failed", label: "Failed", type: "number" },
          { key: "cost", label: "Message Cost", type: "number" },
          { key: "status", label: "Status", type: "select", options: ["Draft", "Scheduled", "Running", "Completed", "Paused"], default: "Draft" },
        ],
        columns: ["name", "channel", "audience", "sent", "delivered", "replies", "scheduledAt", "status"],
        computed: [
          { label: "Delivery %", kind: "ratioPct", num: "delivered", den: "sent" },
          { label: "Reply %", kind: "ratioPct", num: "replies", den: "sent" },
        ],
      },
      {
        key: "replies",
        label: "Reply Inbox",
        icon: "fa-reply",
        type: "replies",
        description: "Whoever replied on WhatsApp is interested — add them to the Win-back Queue in one click.",
      },
      {
        key: "journeys",
        label: "Journeys",
        icon: "fa-route",
        singular: "Journey Step",
        description: "Multi-step drip: Day 0 WhatsApp → Day 3 call → Day 7 email → Day 15 offer.",
        metrics: [
          { label: "Steps", kind: "count" },
          { label: "Enrolled", kind: "num", field: "enrolled" },
          { label: "Recovered", kind: "num", field: "recovered" },
          { label: "Active Steps", kind: "countWhere", field: "status", value: "Active" },
        ],
        fields: [
          { key: "journey", label: "Journey Name", type: "text", required: true },
          { key: "bucket", label: "Bucket", type: "select", options: [...BUCKETS, "All"] },
          { key: "stepNo", label: "Step No.", type: "number", default: "1", required: true },
          { key: "dayOffset", label: "Day Offset", type: "number", default: "0", required: true },
          { key: "channel", label: "Channel", type: "select", options: CHANNELS, required: true },
          { key: "template", label: "WhatsApp Template", type: "text", hint: "Meta-approved template name" },
          { key: "offer", label: "Offer Attached", type: "text" },
          { key: "variant", label: "A/B Variant", type: "select", options: ["A", "B"], default: "A" },
          { key: "stopOnReply", label: "Stop On Reply", type: "select", options: ["Yes", "No"], default: "Yes" },
          { key: "throttle", label: "Throttle / day", type: "number", default: "200" },
          { key: "enrolled", label: "Enrolled", type: "number" },
          { key: "recovered", label: "Recovered", type: "number" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Draft", "Paused"], default: "Draft" },
        ],
        columns: ["journey", "stepNo", "dayOffset", "channel", "template", "variant", "enrolled", "status"],
        computed: [{ label: "Recovery %", kind: "ratioPct", num: "recovered", den: "enrolled" }],
      },
      {
        key: "offers",
        label: "Offers",
        icon: "fa-percent",
        singular: "Offer",
        description: "Bucket and service-wise discounts — with approval limit and usage tracking.",
        metrics: [
          { label: "Offers", kind: "count" },
          { label: "Active", kind: "countWhere", field: "status", value: "Active" },
          { label: "Total Used", kind: "num", field: "used" },
          { label: "Revenue", kind: "money", field: "revenue" },
        ],
        fields: [
          { key: "code", label: "Offer Code", type: "text", required: true },
          { key: "name", label: "Offer Name", type: "text" },
          { key: "discType", label: "Discount Type", type: "select", options: ["Percent", "Flat"], default: "Percent", required: true },
          { key: "discValue", label: "Discount Value", type: "number", required: true },
          { key: "bucket", label: "Bucket", type: "select", options: [...BUCKETS, "All"] },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "minOrder", label: "Min Order Value", type: "number" },
          { key: "maxUses", label: "Max Uses", type: "number", hint: "0 = unlimited" },
          { key: "used", label: "Used", type: "number", default: "0" },
          { key: "approvalLimit", label: "Staff Approval Limit", type: "number", hint: "Manager approval above this" },
          { key: "revenue", label: "Revenue Generated", type: "number" },
          { key: "validFrom", label: "Valid From", type: "date" },
          { key: "validTo", label: "Valid To", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Expired"], default: "Active" },
        ],
        columns: ["code", "discType", "discValue", "bucket", "used", "approvalLimit", "validTo", "status"],
      },
    ],
  },

  /* ========================================================
     WIN-BACK QUEUE   (purana #16 + #17)
     ======================================================== */
  "win-back-queue": {
    title: "Win-back Queue",
    icon: "fa-rotate-left",
    description: "Staff's daily calling work and its outcome — side by side.",
    tabs: [
      {
        key: "my-queue",
        queueBuilder: true,
        /* Disposition set hone par Lost Pool me attempts + cooldown update */
        dispositionSync: true,
        label: "My Queue",
        icon: "fa-phone-volume",
        singular: "Queue Item",
        description: "Who to call today — disposition, remark and snooze.",
        metrics: [
          { label: "Queue Items", kind: "count" },
          { label: "Due", kind: "countWhere", field: "status", value: "Queued" },
          { label: "Contacted", kind: "countWhere", field: "status", value: "Contacted" },
          { label: "Recovered", kind: "countWhere", field: "status", value: "Recovered" },
        ],
        fields: [
          { key: "name", label: "Lead / Customer", type: "text", required: true },
          { key: "contact", label: "Contact", type: "text", required: true },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "reason", label: "Reason Bucket", type: "select", options: BUCKETS },
          { key: "quoted", label: "Quoted Amount", type: "number" },
          { key: "dueDate", label: "Due Date", type: "date" },
          { key: "lastContact", label: "Last Contact", type: "date" },
          { key: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
          { key: "owner", label: "Assigned To", type: "text" },
          { key: "disposition", label: "Disposition", type: "select", options: ["Connected", "Interested", "Callback", "Not Reachable", "Final No", "Wrong Number"] },
          { key: "remark", label: "Remark", type: "text" },
          { key: "snoozeTo", label: "Snooze Till", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Queued", "Contacted", "Snoozed", "Recovered", "Closed"], default: "Queued" },
        ],
        columns: ["name", "contact", "reason", "dueDate", "priority", "owner", "disposition", "status"],
        call: { nameField: "name", phoneField: "contact" },
        /* Ek click me Recovered — teeno jagah update hota hai */
        markRecovered: true,
      },
      {
        key: "recovered",
        label: "Recovered",
        icon: "fa-trophy",
        singular: "Recovered Lead",
        description: "How many converted back — revenue, attribution and Work Allocation handoff.",
        metrics: [
          { label: "Recovered", kind: "count" },
          { label: "Revenue", kind: "money", field: "orderValue" },
          { label: "Recovery Cost", kind: "money", field: "recoveryCost" },
          { label: "Avg Days", kind: "avg", field: "days" },
        ],
        fields: [
          { key: "name", label: "Lead Name", type: "text", required: true },
          { key: "contact", label: "Contact", type: "text" },
          { key: "service", label: "Service", type: "select", options: SERVICES },
          { key: "quoted", label: "Originally Quoted", type: "number" },
          { key: "orderValue", label: "Final Order Value", type: "number", required: true },
          { key: "recoveryCost", label: "Recovery Cost", type: "number", hint: "Discount + message cost" },
          { key: "journey", label: "Journey / Broadcast", type: "text" },
          { key: "offer", label: "Offer Used", type: "text" },
          { key: "days", label: "Days To Recover", type: "number" },
          { key: "attribution", label: "Attribution", type: "select", options: ["Remarketing", "Original Campaign"], default: "Remarketing" },
          { key: "owner", label: "Recovered By", type: "text" },
          { key: "bucket", label: "Bucket", type: "text" },
          { key: "recoveredAt", label: "Recovered On", type: "date" },
          { key: "status", label: "Work Allocation", type: "select", options: ["Pending Handoff", "Sent", "In Progress", "Closed"], default: "Pending Handoff" },
        ],
        columns: ["name", "service", "quoted", "orderValue", "journey", "days", "owner", "status"],
      },
    ],
  },
};

export const MODULE_TAB_KEYS = Object.keys(MARKETING_MODULES);

export function getModule(moduleKey) {
  return MARKETING_MODULES[moduleKey] || null;
}

export function getTab(moduleKey, tabKey) {
  const mod = MARKETING_MODULES[moduleKey];
  if (!mod) return null;
  return mod.tabs.find((t) => t.key === tabKey) || mod.tabs[0];
}

/* Har tab ka apna storage bucket. */
export function datasetKey(moduleKey, tabKey) {
  return `${moduleKey}__${tabKey}`;
}

/* Dashboard / Analytics jin datasets ko padhte hain. */
export const DATASETS = {
  accounts: "ad-accounts__accounts",
  syncLog: "ad-accounts__sync-log",
  liveAds: "campaigns__live-ads",
  dailyStats: "campaigns__daily-stats",
  adAssets: "creatives-copy__ad-assets",
  templates: "creatives-copy__templates",
  paymentMethods: "ad-wallet__payment-methods",
  walletLedger: "ad-wallet__ledger",
  billing: "ad-wallet__billing",
  sources: "lead-capture__sources",
  forms: "lead-capture__forms",
  inbox: "lead-capture__inbox-log",
  lostPool: "audience__lost-pool",
  buckets: "audience__buckets",
  segments: "audience__segments",
  broadcast: "outreach__broadcast",
  replies: "outreach__replies",
  journeys: "outreach__journeys",
  offers: "outreach__offers",
  queue: "win-back-queue__my-queue",
  recovered: "win-back-queue__recovered",
};

export const MARKETING_STORAGE_PREFIX = "vk_marketing_";
