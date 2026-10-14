// lib/session.js — server-side helper to get the logged-in user
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySessionToken, getUserById, getPermissions } from "./auth";

export async function currentUser() {
  const store = await cookies();
  const userId = verifySessionToken(store.get(AUTH_COOKIE)?.value);
  if (!userId) return null;
  return getUserById(userId);
}

export async function currentUserWithPerms() {
  const user = await currentUser();
  if (!user) return { user: null, perms: {} };
  const perms = await getPermissions(user);
  return { user, perms };
}

// module-level permission check.
// level hierarchy: none < view < edit < full
// need: 'view' (view+), 'edit' (edit+), 'full' (full only)
const LEVEL_RANK = { none: 0, view: 1, edit: 2, full: 3 };
export function can(user, perms, moduleKey, need = "view") {
  if (!user) return false;
  if (user.role_key === "superadmin") return true;
  const have = LEVEL_RANK[perms[moduleKey]] || 0;
  const want = LEVEL_RANK[need] || 1;
  return have >= want;
}
