import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySessionToken, getUserById, getPermissions } from "./auth";

export async function getAuthenticatedPageContext() {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!userId) redirect("/login");
  const user = await getUserById(userId);
  if (!user) redirect("/login");
  const perms = await getPermissions(user);
  return { user, perms };
}
