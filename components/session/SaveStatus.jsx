"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { T } from "@/lib/legacy/shared";
import { getSaveStatus, onSaveStatus } from "@/lib/legacy/session-persistence";

const subscribeOnline = (callback) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

// Small header pill: Saving… / Saved / Save failed / Offline. "Saved" fades
// after a few seconds so it only confirms, never nags.
function SaveStatus() {
  const status = useSyncExternalStore(onSaveStatus, getSaveStatus, () => "idle");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    let timer = null;
    const unsubscribe = onSaveStatus((next) => {
      clearTimeout(timer);
      setShowSaved(next === "saved");
      if (next === "saved") timer = setTimeout(() => setShowSaved(false), 3000);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  let label = null;
  let color = T.faint;
  if (!online) {
    label = status === "saving" ? "Offline · will sync" : "Offline";
    color = T.amber;
  } else if (status === "saving") {
    label = "Saving…";
  } else if (status === "error") {
    label = "Not saved · retries on next change";
    color = T.red;
  } else if (status === "saved" && showSaved) {
    label = "Saved";
    color = T.green;
  }
  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        color, fontFamily: T.mono, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
        minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
  );
}

export { SaveStatus };
