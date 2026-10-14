// lib/modules.js — Marketing Panel master module list (future permission grid)
export const MODULE_GROUPS = [
  { section: "Overview", items: [
    { key: "dashboard", name: "Dashboard", icon: "fa-gauge-high" },
  ]},
  { section: "Marketing", items: [
    { key: "ad-accounts", name: "Ad Accounts", icon: "fa-rectangle-ad" },
    { key: "campaigns", name: "Campaigns", icon: "fa-bullhorn" },
    { key: "ad-wallet", name: "Ad Wallet", icon: "fa-wallet" },
    { key: "lead-capture", name: "Lead Capture", icon: "fa-user-plus" },
  ]},
  { section: "System", items: [
    { key: "comparison", name: "Comparison", icon: "fa-code-compare" },
    { key: "analytics", name: "Reports", icon: "fa-file-invoice" },
    { key: "settings", name: "Settings", icon: "fa-gear" },
  ]},
];

export const MODULES = MODULE_GROUPS.flatMap((g) => g.items);
export const MODULE_KEYS = MODULES.map((m) => m.key);
