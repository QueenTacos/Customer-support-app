"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches server data on an interval (and when the tab regains focus) so counts and priorities stay current. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    const onVis = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, seconds]);
  return null;
}
