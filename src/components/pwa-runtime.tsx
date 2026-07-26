"use client";

import { useEffect, useState } from "react";
import { OFFLINE_MESSAGE, ONLINE_AGAIN_MESSAGE } from "@/lib/pwa-config";

export function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const goOffline = () => { setOnline(false); setRecovered(false); };
    const goOnline = () => { setOnline(true); setRecovered(true); window.setTimeout(() => setRecovered(false), 4000); };
    const blockOfflineSubmit = (event: SubmitEvent) => { if (!navigator.onLine) { event.preventDefault(); setOnline(false); } };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("submit", blockOfflineSubmit, true);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); document.removeEventListener("submit", blockOfflineSubmit, true); };
  }, []);

  if (online && !recovered) return null;
  return <div aria-live="assertive" className={`fixed inset-x-0 top-0 z-50 px-4 py-3 text-center text-sm font-semibold shadow ${online ? "bg-emerald-700 text-white" : "bg-amber-300 text-amber-950"}`} role="status">
    {online ? ONLINE_AGAIN_MESSAGE : OFFLINE_MESSAGE}
  </div>;
}
