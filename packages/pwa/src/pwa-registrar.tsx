"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Personal Suite service worker registration failed", error);
    });
  }, []);

  return null;
}
