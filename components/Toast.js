"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  return ctx || { show: () => {} };
}

let idc = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = "success") => {
    const id = ++idc;
    setToasts((list) => [...list, { id, message, type }]);
    // 7 second baad auto-close
    setTimeout(() => remove(id), 5000);
  }, [remove]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="vk-toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`vk-toast vk-toast-anim ${t.type === "error" ? "error" : ""}`} role="status">
            <i className={`fa-solid ${t.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`} />
            <span>{t.message}</span>
            <button type="button" className="vk-toast-x" onClick={() => remove(t.id)} aria-label="Dismiss">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
