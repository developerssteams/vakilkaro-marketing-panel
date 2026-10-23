"use client";

/* ============================================================
   components/SharedSync.js — topbar me chhupa hua

   Panel khulte hi shared database se data laata hai (lib/shared-store)
   aur har 20 second me badlav le/de karta hai. Kuch dikhata nahi —
   sirf jab database se baat na ho paaye to ek chhoti laal patti.
   ============================================================ */
import { useEffect, useState } from "react";
import { startShared, sharedState } from "../lib/shared-store";

export default function SharedSync() {
  const [st, setSt] = useState({ enabled: false, error: "" });

  useEffect(() => {
    const on = () => setSt(sharedState());
    window.addEventListener("vk-shared-state", on);
    startShared().then(on);
    return () => window.removeEventListener("vk-shared-state", on);
  }, []);

  if (!st.error) return null;
  return (
    <span title={st.error}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA", whiteSpace: "nowrap" }}>
      <i className="fa-solid fa-database" /> Shared data offline
    </span>
  );
}
