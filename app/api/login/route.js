import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  authenticate,
  createSessionToken,
  createSession,
  logAudit,
  rateAllow,
  rateClear,
  guessDevice,
  authenticateDefaultAdmin,
} from "../../../lib/auth";

export const runtime = "nodejs";

function clientIp(request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "";
}

/* Database ki chhoti cheezein (attempts gin-na, login history) fail hon
   to bhi login na ruke — pehle yahan crash hoke "Unable to sign in" aata tha */
async function quiet(p) { try { return await p; } catch { return undefined; } }

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const login = String(body?.login || "").trim();
  const password = String(body?.password || "");
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const device = guessDevice(userAgent);

  if (!login || !password) {
    return NextResponse.json({ message: "Enter login and password." }, { status: 400 });
  }

  // Fresh-install Super Admin: works without a seeded PostgreSQL user.
  // Existing database-backed users still use the normal flow below.
  const defaultAdmin = authenticateDefaultAdmin(login, password);
  if (defaultAdmin) {
    const response = NextResponse.json({ ok: true, role: defaultAdmin.role_key });
    response.cookies.set({
      name: AUTH_COOKIE,
      value: createSessionToken(defaultAdmin.id),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  }

  // brute-force guard: 5 tries / 10 min per login input
  const allowed = await quiet(rateAllow(login.toLowerCase(), 5, 600));
  if (allowed === false) {
    await quiet(logAudit("login_blocked", { loginInput: login, ip, userAgent, device }));
    return NextResponse.json(
      { message: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  let user;
  try {
    user = await authenticate(login, password);
  } catch (e) {
    /* Database me staff ki users table hi nahi (abhi sirf admin login) */
    if (/relation .*users.* does not exist|ECONNREFUSED|ENOTFOUND|DATABASE_URL|connect/i.test(String(e?.message || e))) {
      return NextResponse.json(
        { message: "Invalid login or password. Staff logins are not set up yet — use the admin login." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { message: "Sign in is temporarily unavailable." },
      { status: 500 }
    );
  }

  if (!user) {
    await quiet(logAudit("login_failed", { loginInput: login, ip, userAgent, device }));
    return NextResponse.json({ message: "Invalid login or password." }, { status: 401 });
  }

  // success
  await quiet(rateClear(login.toLowerCase()));
  await quiet(createSession(user.id, {
    ip,
    userAgent,
    device,
    deviceLabel: device === "mobile" ? "Mobile" : device === "tablet" ? "Tablet" : "Desktop",
  }));
  await quiet(logAudit("login_ok", { userId: user.id, loginInput: login, ip, userAgent, device }));

  const response = NextResponse.json({ ok: true, role: user.role_key });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: createSessionToken(user.id),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
