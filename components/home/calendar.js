// ─── file: workout-ui-home-calendar.js ───
// Calendar rendering logic for the Home tab of Workout Tracker

import { state } from "./state";
import { render } from "./shell";

function renderCalendar() {
  const offset = state.calendarMonthOffset || 0;
  const today = new Date();
  const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = targetDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Short badge per workout so the calendar shows WHICH session happened,
  // not just that one did. The two accessory sessions use outline badges in
  // the hue of the strength session they follow, so the two
  // color pairs read as the two halves of the program cycle. Unknown/legacy
  // names fall back to a solid gray badge.
  const WORKOUT_BADGES = {
    "Squat Focus": { label: "Squat", color: "#3b82f6" },
    "Dips Focus": { label: "Dips", color: "#3b82f6", micro: true },
    "RDL Focus": { label: "RDL", color: "#10b981" },
    "Shrugs Focus": { label: "Shrugs", color: "#10b981", micro: true },
    // Pre-rename session names (history rows are normalized at load; kept as a fallback).
    "Main A": { label: "Squat", color: "#3b82f6" },
    "Main B": { label: "Deadlift", color: "#10b981" },
    "Main: RDL": { label: "Deadlift", color: "#10b981" },
    "Main: Squat": { label: "Squat", color: "#3b82f6" },
    "Main: Deadlift": { label: "RDL", color: "#10b981" },
    "Micro: Arms": { label: "Dips", color: "#3b82f6", micro: true },
    "Micro: Delts & Traps": { label: "Shrugs", color: "#10b981", micro: true },
    "Micro: Arms & Core": { label: "arms", color: "#3b82f6", micro: true },
    "Squat Day": { label: "SQ", color: "#60a5fa" },
    "Deadlift Day": { label: "DL", color: "#34d399" },
    "Full Body": { label: "FB", color: "#6b7280" },
    "Full Body B": { label: "FB", color: "#6b7280" },
  };
  const badgeHTML = (b, label, dimmed) => {
    const opacity = dimmed ? 'opacity:0.65;' : '';
    const box = b && b.micro
      ? `color:${b.color};background:transparent;border:1.5px solid ${b.color};padding:1px 2px;`
      : `color:#fff;background:${b ? b.color : "#6b7280"};padding:2px 3px;`;
    return `<span style="font-size:7px;font-weight:700;line-height:1.1;${box}${opacity}border-radius:3px;display:block;text-align:center;word-break:break-word">${label}</span>`;
  };
  const dateMap = {};
  (state.history || []).forEach(s => {
    if (!dateMap[s.date]) dateMap[s.date] = [];
    dateMap[s.date].push({ name: s.workout_name, deload: !!s.is_deload });
  });

  const dayHeaders = ["Mo","Tu","We","Th","Fr","Sa","Su"].map(d =>
    `<div style="font-size:10px;color:#9ca3af;text-align:center;font-weight:600">${d}</div>`
  ).join("");

  let cells = "";
  const emptyCellsCount = (firstDay + 6) % 7;
  for (let i = 0; i < emptyCellsCount; i++) {
    cells += `<div></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const workouts = dateMap[dateStr] || [];
    const badges = workouts.map(w => {
      const b = WORKOUT_BADGES[w.name];
      const label = (b ? b.label : w.name) + (w.deload ? '·D' : '');
      return badgeHTML(b, label, w.deload);
    }).join("");
    const bg = isToday ? "background:#eff6ff;border-radius:8px;" : "";
    const fw = isToday ? "font-weight:700;color:#2563eb;" : "color:#374151;";
    cells += `<div style="text-align:center;padding:4px 2px;${bg};min-height:48px;display:flex;flex-direction:column;justify-content:flex-start">
    <div style="font-size:11px;${fw};margin-bottom:2px">${d}</div>
    <div style="display:flex;flex-direction:column;gap:2px;align-items:stretch">${badges}</div>
  </div>`;
  }

  return `
  <div class="card" style="padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
      <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0">${monthName}</h3>
      <div style="display:flex;gap:8px">
        <button onclick="changeCalendarMonth(-1)" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#111827;cursor:pointer;width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;touch-action:manipulation;transition:all 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <button onclick="changeCalendarMonth(1)" ${offset === 0 ? 'disabled style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.2);cursor:default;width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center"' : 'style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#111827;cursor:pointer;width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;touch-action:manipulation;transition:all 0.15s" onmouseover="this.style.background=\'rgba(255,255,255,0.12)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.05)\'"'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
      ${dayHeaders}
      ${cells}
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:10px;font-size:9px;color:#9ca3af">
      <span style="margin-right:1px">cycle</span>
      <span style="font-size:8px;font-weight:700;line-height:1.1;color:#fff;background:#3b82f6;padding:2px 5px;border-radius:3px">Squat</span>
      <span>→</span>
      <span style="font-size:8px;font-weight:700;line-height:1.1;color:#3b82f6;border:1.5px solid #3b82f6;padding:1px 4px;border-radius:3px">arms</span>
      <span>→</span>
      <span style="font-size:8px;font-weight:700;line-height:1.1;color:#fff;background:#10b981;padding:2px 5px;border-radius:3px">Deadlift</span>
      <span>→</span>
      <span style="font-size:8px;font-weight:700;line-height:1.1;color:#10b981;border:1.5px solid #10b981;padding:1px 4px;border-radius:3px">delts</span>
    </div>
  </div>
`;
}

function changeCalendarMonth(delta) {
  state.calendarMonthOffset = (state.calendarMonthOffset || 0) + delta;
  render();
}

export { renderCalendar, changeCalendarMonth };
