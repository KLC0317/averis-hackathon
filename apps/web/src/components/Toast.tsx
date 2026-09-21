"use client";

import React, { createContext, useContext, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";

interface ToastMessage {
  id: string;
  text: string;
  type?: "success" | "info" | "warning";
}

interface ToastContextType {
  toast: (text: string, type?: "success" | "info" | "warning") => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (text: string, type: "success" | "info" | "warning" = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.type === "warning" ? (
              <TriangleAlert size={16} className="warning-text" />
            ) : (
              <CheckCircle2 size={16} className="success-text" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
