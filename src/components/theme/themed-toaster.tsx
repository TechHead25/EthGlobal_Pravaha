"use client";

import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

export function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="bottom-right" richColors closeButton theme={resolved} toastOptions={{ className: "font-sans" }} />;
}
