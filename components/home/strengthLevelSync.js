// ─── file: workout-ui-home-strength-level-sync.js ───
// Home-screen batch upload of finished sessions to Strength Level.
//
// The home page can see the whole saved history (state.history), so unlike
// the per-session button on the workout-complete screen this flow prepares
// EVERY finished session and hands the user one console snippet that — run in
// a logged-in my.strengthlevel.com tab — skips workouts SL already has
// (matched by date+name) and uploads only the missing ones. Payload/snippet
// logic lives in lib/legacy/strength-level-sync.js.

import { state } from "./state";
import {
  buildHistorySyncPlan,
  buildStrengthLevelHistorySnippet,
} from "@/lib/legacy/strength-level-sync";

const OVERLAY_ID = "sl-history-sync-overlay";

function closeSLHistorySync() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function copySLHistorySnippet(snippet) {
  const btn = document.getElementById("sl-history-copy-btn");
  const done = () => {
    if (btn) btn.textContent = "Copied to clipboard ✓";
    setTimeout(() => {
      if (btn) btn.textContent = "Copy sync snippet";
    }, 2000);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(snippet).then(done).catch(() => {});
  }
}

function openSLHistorySync() {
  closeSLHistorySync();
  const plan = buildHistorySyncPlan(state.history || []);
  const snippet = buildStrengthLevelHistorySnippet(plan.workouts);

  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const workoutLines = plan.workouts
    .map(
      (w) =>
        `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">
          <span style="color:#374151">${esc(w.name)}</span>
          <span style="color:#9ca3af;font-family:monospace">${esc(w.date)} · ${w.setCount} sets</span>
        </div>`,
    )
    .join("");

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSLHistorySync();
  });

  const nothing = plan.workouts.length === 0;
  overlay.innerHTML = `
    <div style="width:100%;max-width:480px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px;font-weight:800;color:#111827">Upload missing workouts to Strength Level</h3>
        <button onclick="window.closeSLHistorySync()" style="background:transparent;border:none;color:#6b7280;font-size:16px;cursor:pointer">✕</button>
      </div>
      ${
        nothing
          ? `<p style="color:#b45309;font-size:13px;line-height:1.5;margin:0">No finished, mappable sessions in the loaded history.</p>`
          : `
      <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px">
        Prepared <b style="color:#111827">${plan.workouts.length}</b> finished session${plan.workouts.length !== 1 ? "s" : ""}.
        The snippet checks what's already on Strength Level (by date + name) and uploads <b style="color:#111827">only the missing ones</b>.
        Weights are converted lb → kg.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;margin-bottom:10px;max-height:180px;overflow-y:auto;font-size:12px">
        ${workoutLines}
      </div>
      ${plan.unmapped.length ? `<p style="color:#9ca3af;font-size:11.5px;line-height:1.5;margin:0 0 8px">Skipped exercises (no Strength Level match): ${esc(plan.unmapped.join(", "))}</p>` : ""}
      ${plan.unfinished ? `<p style="color:#9ca3af;font-size:11.5px;margin:0 0 8px">${plan.unfinished} unfinished session${plan.unfinished !== 1 ? "s" : ""} left out.</p>` : ""}
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px">
        <div style="color:#9ca3af;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:0.5px;margin-bottom:8px">HOW TO RUN</div>
        <ol style="margin:0;padding-left:18px;color:#6b7280;font-size:12.5px;line-height:1.6">
          <li>Open <b style="color:#111827">my.strengthlevel.com</b> in a tab and make sure you're logged in.</li>
          <li>Open that tab's DevTools <b style="color:#111827">Console</b> (⌥⌘J), paste the copied snippet, press Enter. (First time, Chrome may ask you to type <i>allow pasting</i>.)</li>
          <li>An alert summarizes what was uploaded vs. already there; refresh your workouts page.</li>
        </ol>
      </div>
      <button id="sl-history-copy-btn" onclick="window.copySLHistorySnippet()" style="width:100%;margin-top:12px;background:#111827;border:none;color:#fff;font-family:inherit;font-size:14px;font-weight:700;padding:11px 0;border-radius:10px;cursor:pointer">Copy sync snippet</button>
      <textarea readonly onfocus="this.select()" style="width:100%;margin-top:10px;height:64px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;color:#9ca3af;font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:8px;resize:vertical;box-sizing:border-box">${esc(snippet)}</textarea>
      <p style="color:#9ca3af;font-size:10.5px;line-height:1.5;margin:10px 0 0">
        Note: this uses Strength Level's unofficial API and is against their Terms of Service. It uploads only your own data.
      </p>`
      }
    </div>`;

  document.body.appendChild(overlay);
  if (!nothing) {
    window.copySLHistorySnippet = () => copySLHistorySnippet(snippet);
    copySLHistorySnippet(snippet);
  }
}

export { openSLHistorySync, closeSLHistorySync };
