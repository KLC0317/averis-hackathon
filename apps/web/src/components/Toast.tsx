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
  // Toast notifications removed per user preference so actions execute silently
  const noopToast = () => {};

  return (
    <ToastContext.Provider value={{ toast: noopToast }}>
      {children}
    </ToastContext.Provider>
  );
}
