import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "../../components/LoginForm";
import { AUTH_COOKIE, verifySessionToken } from "../../lib/auth";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (userId) redirect("/dashboard");

  return (
    <div className="login-body">
      <div className="login-wrap">
        <div className="login-card login-card-php">
          <div className="login-logo login-logo-image">
            <img src="/logo.png" alt="VakilKaro" />
          </div>

          <h1 className="login-title">Sign in to your panel</h1>
          <p className="login-sub">
            Sign in with your <b>email, phone or User ID</b>. Your sidebar &amp;
            access load automatically from your role.
          </p>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
