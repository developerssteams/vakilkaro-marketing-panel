"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message || "Unable to sign in.");
        return;
      }

      // ek-baar ka success flag — dashboard mount pe toast dikhega
      try {
        window.sessionStorage.setItem("vk_login_toast", "1");
      } catch {}

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Sign in is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="vk-toast error login-toast-static" role="alert">
          <i className="fa-solid fa-circle-exclamation" />
          <span>{error}</span>
          <button
            type="button"
            className="vk-toast-x"
            onClick={() => setError("")}
            aria-label="Close error"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      ) : null}

      <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
        <label className="lf-label" htmlFor="login">
          Email / Phone / User ID
        </label>

        <div className="lf-field">
          <i className="fa-solid fa-user" />
          <input
            className="lf-input"
            id="login"
            type="text"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            placeholder="email · phone · VK1001"
            autoComplete="username"
            required
            autoFocus
          />
        </div>

        <label className="lf-label" htmlFor="pwd">
          Password
        </label>

        <div className="lf-field">
          <i className="fa-solid fa-lock" />
          <input
            className="lf-input"
            id="pwd"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
            required
          />

          <button
            type="button"
            className="lf-eye"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
          </button>
        </div>

        <button className="lf-btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
          <i className="fa-solid fa-arrow-right-to-bracket" />
        </button>
      </form>
    </>
  );
}
