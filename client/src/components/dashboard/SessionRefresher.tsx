"use client";

import { useEffect } from "react";
import { apiUrl } from "@/lib/client-api";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      if (cancelled) return;
      fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" }).catch(() => {});
    };
    const id = window.setInterval(ping, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return null;
}
