import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySessionToken } from "../lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
  redirect(userId ? "/dashboard" : "/login");
}
