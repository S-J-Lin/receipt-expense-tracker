"use client";

import { useEffect, useState } from "react";
import { OFFLINE_MESSAGE, ONLINE_AGAIN_MESSAGE } from "@/lib/pwa-config";

export function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    // A PWA can be launched while already offline; no `offline` event fires then.
    const initial = window.setTimeout(() => setOnline(navigator.onLine), 0);
    let timer: number | undefined;
    const goOffline = () => { setOnline(false); setRecovered(false); };
    const goOnline = () => { setOnline(true); setRecovered(true); window.clearTimeout(timer); timer = window.setTimeout(() => setRecovered(false), 4000); };
    const blockOfflineSubmit = (event: SubmitEvent) => { if (!navigator.onLine) { event.preventDefault(); setOnline(false); } };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("submit", blockOfflineSubmit, true);
    return () => { window.clearTimeout(initial); window.clearTimeout(timer); window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); document.removeEventListener("submit", blockOfflineSubmit, true); };
  }, []);

  if (online && !recovered) return null;
  return <div aria-live="assertive" className={`pwa-banner fixed inset-x-0 top-0 z-[60] px-4 pb-3 text-center text-sm font-semibold ${online ? "bg-emerald-700 text-white" : "bg-amber-300 text-amber-950"}`} role="status">
    {online ? ONLINE_AGAIN_MESSAGE : OFFLINE_MESSAGE}
  </div>;
}
