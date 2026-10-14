"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "./Toast";
import AutoSync from "./AutoSync";

/* ============================================================
   MARKETING PANEL — SIDEBAR MODULE CATALOGUE
   Grouped exactly like the Marketing panel.
   Add a new module = add one line here.
   ============================================================ */
const MARKETING_NAV = [
  { section: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "fa-gauge-high", href: "/dashboard" },
  ]},
  { section: "Marketing", items: [
    { key: "ad-accounts", label: "Ad Accounts", icon: "fa-rectangle-ad", href: "/ad-accounts" },
    { key: "campaigns", label: "Campaigns", icon: "fa-bullhorn", href: "/campaigns" },
    { key: "create-ad", label: "Create Ad", icon: "fa-wand-magic-sparkles", href: "/create-ad", perm: "campaigns" },
    { key: "ad-wallet", label: "Ad Wallet", icon: "fa-wallet", href: "/ad-wallet" },
    { key: "lead-capture", label: "Lead Capture", icon: "fa-user-plus", href: "/lead-capture" },
  ]},
  { section: "System", items: [
    { key: "comparison", label: "Comparison", icon: "fa-code-compare", href: "/comparison" },
    { key: "analytics", label: "Reports", icon: "fa-file-invoice", href: "/reports" },
    { key: "settings", label: "Settings", icon: "fa-gear", href: "/settings" },
  ]},
];

function displayNameFromEmail(email) {
  const local = String(email || "admin").split("@")[0] || "admin";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Admin";
}

function initials(name) {
  return String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "A";
}

function getGreeting(date) {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export default function DashboardShell({ user, perms = {}, children, active, pageTitle, pageSub }) {
  const router = useRouter();
  const pathname = usePathname();

  const name = user?.name || "User";
  const email = user?.email || "";
  const roleName = user?.role_name || user?.role_key || "User";
  const roleIcon = user?.role_icon || "fa-user-shield";
  const branchName = user?.branch_name || "";
  const init = useMemo(() => initials(name), [name]);
  const { show } = useToast();

  // login ke turant baad ek success toast — global stack me (delete/add wali jagah)
  useEffect(() => {
    let flag = null;
    try {
      flag = window.sessionStorage.getItem("vk_login_toast");
      if (flag) window.sessionStorage.removeItem("vk_login_toast");
    } catch {}
    if (flag) {
      const first = (name || "").split(" ")[0] || "there";
      show(`Welcome back, ${first} — signed in successfully.`, "success");
    }
  }, [show, name]);

  // sidebar: sirf wahi module dikhe jiska level 'view' ya 'full' ho.
  const isSuper = user?.role_key === "superadmin";
  const visibleNav = useMemo(() => {
    return MARKETING_NAV
      .map((group) => ({
        section: group.section,
        items: group.items.filter((it) => {
          if (isSuper) return true;
          /* Create Ad ka alag permission nahi — Campaigns wala hi lagta hai */
          const lvl = perms[it.perm || it.key];
          return lvl === "view" || lvl === "full";
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [perms, isSuper]);

  const activeKey = useMemo(() => {
    if (active) return active;
    const seg = String(pathname || "/dashboard").split("/").filter(Boolean)[0] || "dashboard";
    return seg;
  }, [pathname, active]);

  const [now, setNow] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);


  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("vk_sidebar_collapsed");
    setCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    function closeMenus(event) {
      if (!event.target.closest(".dropdown-wrap")) {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("vk_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="app-body dashboard-body">

      <div className={`app ${collapsed ? "sb-collapsed" : ""}`} id="appShell">
        <button
          type="button"
          className={`mobile-sidebar-backdrop ${sidebarOpen ? "show" : ""}`}
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />

        <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`} id="sidebar" aria-label="Navigation">
          <div className="sb-top">
            <div className="sb-logo-mark">VK</div>

            <div className="sb-brand">
              <a className="sb-logo-card" href="/dashboard" title="VakilKaro">
                <img src="/logo.png" alt="VakilKaro — Law Expert" />
              </a>
            </div>

            <button
              className="sb-collapse desktop-only-flex"
              type="button"
              title="Collapse / expand"
              aria-label="Toggle sidebar"
              onClick={toggleCollapsed}
            >
              <i className={`fa-solid ${collapsed ? "fa-angles-right" : "fa-angles-left"}`} />
            </button>

            <button
              className="sb-mobile-close mobile-only"
              type="button"
              aria-label="Close"
              onClick={() => setSidebarOpen(false)}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <nav className="sb-nav">
            {visibleNav.map((group) => (
              <div key={group.section} className="sb-group">
                <div className="sb-section"><span>{group.section}</span></div>
                {group.items.map((item) => {
                  const active = activeKey === item.key;
                  return (
                    <a
                      key={item.key}
                      className={`sb-item ${active ? "on" : ""}`}
                      href={item.href}
                      data-label={item.label}
                      title={item.label}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <i className={`fa-solid ${item.icon}`} />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sb-bottom">
            <div className="sb-user">
              <span className="av sb-avatar">{init}</span>
              <div className="sb-user-info">
                <div className="sb-user-name">{name}</div>
                <div className="sb-user-role">
                  <i className={`fa-solid ${roleIcon}`} /> {roleName}{branchName ? ` · ${branchName}` : ""}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <button
              className="tb-burger mobile-only-flex"
              type="button"
              aria-label="Menu"
              onClick={() => setSidebarOpen(true)}
            >
              <i className="fa-solid fa-bars" />
            </button>

            <a className="tb-logo mobile-only-flex" href="/dashboard" aria-label="VakilKaro">
              <img src="/logo-black.png" alt="VakilKaro" />
            </a>

            <div className="tb-head">
              {pageTitle ? (
                <>
                  <div className="tb-title">{pageTitle}</div>
                  <div className="tb-sub"><span>{pageSub || ""}</span></div>
                </>
              ) : (
                <>
                  <div className="tb-title">
                    {now ? getGreeting(now) : "Welcome"}, <span className="tb-name">{name.split(" ")[0]}</span>
                  </div>
                  <div className="tb-sub">
                    <i className="fa-regular fa-calendar tb-calendar" />
                    <span>{now ? formatDate(now) : "—"}</span>
                  </div>
                </>
              )}
            </div>

            <div className="tb-spacer" />

            <AutoSync />

            <div className="tb-search tablet-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input type="text" placeholder="Search…" aria-label="Search" />
            </div>

            <div className="dropdown-wrap">
              <button
                className="tb-btn"
                type="button"
                title="Notifications"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setNotificationsOpen((open) => !open);
                  setProfileOpen(false);
                }}
              >
                <i className="fa-solid fa-bell" />
              </button>

              {notificationsOpen ? (
                <div className="vk-menu vk-notif-menu dropdown-panel notif-panel">
                  <div className="vk-notif-head"><span>Notifications</span></div>
                  <div className="empty-notif">No notifications</div>
                </div>
              ) : null}
            </div>

            <div className="dropdown-wrap">
              <button
                className="tb-user"
                type="button"
                aria-expanded={profileOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setProfileOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                <span className="av top-avatar">{init}</span>
                <span className="tb-user-meta small-screen-meta">
                  <span className="tb-user-name">{name}</span>
                  <span className="tb-user-role">{roleName}</span>
                </span>
                <i className="fa-solid fa-chevron-down tb-caret small-screen-meta" />
              </button>

              {profileOpen ? (
                <div className="vk-menu dropdown-panel profile-panel">
                  <div className="vk-menu-head">
                    <span className="av top-avatar">{init}</span>
                    <div className="vk-menu-id">
                      <div className="vk-menu-name">{name}</div>
                      <div className="vk-menu-sub">{email}</div>
                      <span className="vk-menu-badge">{roleName}</span>
                    </div>
                  </div>

                  <button className="dropdown-item vk-logout" type="button" onClick={logout} disabled={loggingOut}>
                    <i className="fa-solid fa-arrow-right-from-bracket" />
                    {loggingOut ? "Logging out..." : "Log out"}
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <div className="content" aria-label="Page content">
            {children ? children : <div className="dashboard-content-empty" />}
          </div>
        </main>
      </div>
    </div>
  );
}
