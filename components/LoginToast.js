"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";

export default function LoginToast({ name }) {
  const { show } = useToast();
  useEffect(() => {
    let flag = null;
    try {
      flag = window.sessionStorage.getItem("vk_login_toast");
      if (flag) window.sessionStorage.removeItem("vk_login_toast");
    } catch {}
    if (flag) {
      const first = String(name || "").split(" ")[0] || "there";
      show(`Welcome back, ${first} — signed in successfully.`, "success");
    }
  }, [show, name]);
  return null;
}
