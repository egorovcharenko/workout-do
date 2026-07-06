"use client";

// Mechanical port of the vanilla-JS home/shell page from the old app
// (/Users/egorovcharenko/sports/workout.html). The ten UI files are
// concatenated verbatim inside initHomeApp(); only fetch()->api.* calls,
// the /workout -> /session navigation target, and the window attachments
// at the end were changed.

import { useEffect, useRef } from "react";
import { api } from "@/lib/db/api";
import {
  WORKOUTS,
  LEGACY_WORKOUT_NAMES,
  localDate,
  isDeloadActive,
  deloadDaysLeft,
  estimateTemplateWorkoutDuration,
} from "@/lib/legacy/shared";
import {
  EXERCISE_MUSCLES,
  getMuscleImpact,
  calcSet1RM,
} from "@/lib/legacy/standards";
import {
  setSessionStateCache,
  loadSkippedExercises,
} from "@/lib/legacy/session-persistence";

function initHomeApp() {
  // ─── file: workout-ui-home-sparklines.js ───
  function sparkTip(evt, text, sticky) {
    let el = document.getElementById('spark-tip');
    if (!text) { if (el) el.style.opacity = '0'; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'spark-tip';
      el.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;background:#1f2937;color:#f3f4f6;'
        + 'border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:6px 9px;font-size:12px;'
        + 'font-family:ui-monospace,Menlo,monospace;box-shadow:0 8px 24px rgba(0,0,0,0.5);white-space:nowrap;'
        + 'transform:translate(-50%,-138%);opacity:0;transition:opacity 90ms ease';
      document.body.appendChild(el);
    }
    el.textContent = text;
    const t = evt && evt.target;
    const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
    el.style.left = (r ? r.left + r.width / 2 : (evt ? evt.clientX : 0)) + 'px';
    el.style.top = (r ? r.top : (evt ? evt.clientY : 0)) + 'px';
    el.style.opacity = '1';
    if (sticky) { clearTimeout(sparkTip._t); sparkTip._t = setTimeout(() => { el.style.opacity = '0'; }, 2200); }
  }
  if (typeof window !== 'undefined') window.sparkTip = sparkTip;

  const mmdd = (d) => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[1]}/${p[2]}` : (d || ''); };

  function microSparkline(vals, color) {
    if (!vals || vals.length < 2) return '';
    const max = Math.max(...vals), min = Math.min(...vals), range = max - min || 1;
    const w = 36, h = 12, pad = 1;
    const points = vals.map((v, i) =>
      `${pad + (i / (vals.length - 1)) * (w - pad * 2)},${pad + (1 - (v - min) / range) * (h - pad * 2)}`
    ).join(' ');
    const latest = vals[vals.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;flex-shrink:0;opacity:0.9">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${w - pad}" cy="${pad + (1 - (latest - min) / range) * (h - pad * 2)}" r="1.6" fill="${color}"/>
  </svg>`;
  }

  function _renderSparklineGridLines(startMs, endMs, getX, padTop, h, padBottom) {
    const dayMs = 24 * 3600 * 1000;
    const totalDays = Math.ceil((endMs - startMs) / dayMs) || 1;

    if (totalDays <= 65) {
      const numWeeks = Math.ceil(totalDays / 7);
      const weekMarks = Array.from({length: numWeeks}, (_, i) => ({ label: `W${i + 1}`, ms: startMs + (i * 7 + 6) * dayMs }));
      return weekMarks
        .filter(mark => mark.ms <= endMs)
        .map(mark => {
          const x = getX(mark.ms);
          return `
          <line x1="${x}" y1="${padTop}" x2="${x}" y2="${h - padBottom}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
          <text x="${x}" y="${h - 2}" font-size="7px" fill="#9ca3af" text-anchor="middle">${mark.label}</text>
        `;
        }).join('');
    } else {
      const numIntervals = 4;
      const intervalMs = (endMs - startMs) / numIntervals;
      return Array.from({length: numIntervals + 1}, (_, i) => {
        const ms = startMs + i * intervalMs;
        const x = getX(ms);
        const date = new Date(ms);
        const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `
        <line x1="${x}" y1="${padTop}" x2="${x}" y2="${h - padBottom}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
        <text x="${x}" y="${h - 2}" font-size="7px" fill="#9ca3af" text-anchor="middle">${label}</text>
      `;
      }).join('');
    }
  }

  function renderMeasurementSparkline(pts, color, startMs, endMs, unit, goal) {
    if (pts.length === 0) return '';
    const w = 150, h = 50, padLeft = 28, padRight = 6, padTop = 6, padBottom = 12;

    const vals = pts.map(p => p.value);
    const goalVal = goal && goal.value != null ? goal.value : null;
    const max = Math.max(...vals, goalVal != null ? goalVal : -Infinity);
    const min = Math.min(...vals, goalVal != null ? goalVal : Infinity);
    const range = max - min || 1;
    const getX = (ms) => {
      const r = endMs - startMs || 1;
      return padLeft + ((ms - startMs) / r) * (w - padLeft - padRight);
    };
    const getY = (v) => (h - padBottom) - ((v - min) / range) * (h - padBottom - padTop);

    const gridLines = `
    <line x1="${padLeft}" y1="${padTop}" x2="${w - padRight}" y2="${padTop}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
    <text x="${padLeft - 4}" y="${padTop + 3.5}" font-size="8px" fill="#6b7280" text-anchor="end">${max.toFixed(1)}</text>
    <line x1="${padLeft}" y1="${h - padBottom}" x2="${w - padRight}" y2="${h - padBottom}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
    <text x="${padLeft - 4}" y="${h - padBottom + 3.5}" font-size="8px" fill="#6b7280" text-anchor="end">${min.toFixed(1)}</text>
  `;

    const weekLines = _renderSparklineGridLines(startMs, endMs, getX, padTop, h, padBottom);

    let goalHTML = '';
    if (goalVal != null) {
      const goalY = getY(goalVal);
      goalHTML = `
      <line x1="${padLeft}" y1="${goalY}" x2="${w - padRight}" y2="${goalY}" stroke="rgba(239,68,68,0.45)" stroke-width="0.8" stroke-dasharray="2,2" />
      <text x="${w - padRight - 4}" y="${goalY + 8.5}" font-size="7px" fill="rgba(239,68,68,0.8)" font-weight="800" text-anchor="end">${goal.label || ''}</text>
    `;
    }

    let pathHTML = '';
    let dotsHTML = '';

    if (pts.length === 1) {
      const x = getX(pts[0].ms);
      const y = getY(pts[0].value);
      const tip = `${mmdd(pts[0].date)} · ${pts[0].value.toFixed(1)} ${unit}`.replace(/'/g, "\\'");
      dotsHTML = `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}" />`
        + `<circle cx="${x}" cy="${y}" r="7" fill="transparent" style="cursor:pointer"
         onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`;
    } else {
      const pathD = pts.map(p => `L ${getX(p.ms)} ${getY(p.value)}`).join(' ').replace(/^L/, 'M');
      pathHTML = `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`;
      dotsHTML = pts.map(p => {
        const x = getX(p.ms);
        const y = getY(p.value);
        const tip = `${mmdd(p.date)} · ${p.value.toFixed(1)} ${unit}`.replace(/'/g, "\\'");
        return `<circle cx="${x}" cy="${y}" r="2" fill="${color}" />`
          + `<circle cx="${x}" cy="${y}" r="7" fill="transparent" style="cursor:pointer"
           onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`;
      }).join('');
    }

    return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;flex-shrink:0;overflow:visible">
      ${gridLines}
      ${weekLines}
      ${goalHTML}
      ${pathHTML}
      ${dotsHTML}
    </svg>
  `;
  }

  function renderPairedMeasurementSparkline(leftPts, rightPts, color, startMs, endMs, unit) {
    if (leftPts.length === 0 && rightPts.length === 0) return '';
    const w = 150, h = 50, padLeft = 28, padRight = 6, padTop = 6, padBottom = 12;

    const leftVals = leftPts.map(p => p.value);
    const rightVals = rightPts.map(p => p.value);
    const allVals = [...leftVals, ...rightVals];
    const max = Math.max(...allVals), min = Math.min(...allVals), range = max - min || 1;

    const getX = (ms) => {
      const r = endMs - startMs || 1;
      return padLeft + ((ms - startMs) / r) * (w - padLeft - padRight);
    };
    const getY = (v) => (h - padBottom) - ((v - min) / range) * (h - padBottom - padTop);

    const gridLines = `
    <line x1="${padLeft}" y1="${padTop}" x2="${w - padRight}" y2="${padTop}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
    <text x="${padLeft - 4}" y="${padTop + 3.5}" font-size="8px" fill="#6b7280" text-anchor="end">${max.toFixed(1)}</text>
    <line x1="${padLeft}" y1="${h - padBottom}" x2="${w - padRight}" y2="${h - padBottom}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2" />
    <text x="${padLeft - 4}" y="${h - padBottom + 3.5}" font-size="8px" fill="#6b7280" text-anchor="end">${min.toFixed(1)}</text>
  `;

    const weekLines = _renderSparklineGridLines(startMs, endMs, getX, padTop, h, padBottom);

    let leftPathHTML = '';
    let rightPathHTML = '';

    if (leftPts.length > 1) {
      const pathD = leftPts.map(p => `L ${getX(p.ms)} ${getY(p.value)}`).join(' ').replace(/^L/, 'M');
      leftPathHTML = `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="3,2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" />`;
    } else if (leftPts.length === 1) {
      const x = getX(leftPts[0].ms);
      const y = getY(leftPts[0].value);
      leftPathHTML = `<circle cx="${x}" cy="${y}" r="2" fill="white" stroke="${color}" stroke-width="1.2" stroke-dasharray="2,1" opacity="0.8" />`;
    }

    if (rightPts.length > 1) {
      const pathD = rightPts.map(p => `L ${getX(p.ms)} ${getY(p.value)}`).join(' ').replace(/^L/, 'M');
      rightPathHTML = `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />`;
    } else if (rightPts.length === 1) {
      const x = getX(rightPts[0].ms);
      const y = getY(rightPts[0].value);
      rightPathHTML = `<circle cx="${x}" cy="${y}" r="2" fill="${color}" />`;
    }

    const pointsByMs = {};
    leftPts.forEach(p => {
      if (!pointsByMs[p.ms]) pointsByMs[p.ms] = { date: p.date, ms: p.ms };
      pointsByMs[p.ms].left = p.value;
    });
    rightPts.forEach(p => {
      if (!pointsByMs[p.ms]) pointsByMs[p.ms] = { date: p.date, ms: p.ms };
      pointsByMs[p.ms].right = p.value;
    });

    const sortedMsList = Object.keys(pointsByMs).sort((a, b) => Number(a) - Number(b));
    const dotsHTML = sortedMsList.map(msKey => {
      const p = pointsByMs[msKey];
      const x = getX(p.ms);
      const elements = [];
      let tipParts = [];

      if (p.left != null) {
        const yL = getY(p.left);
        elements.push(`<circle cx="${x}" cy="${yL}" r="2" fill="white" stroke="${color}" stroke-width="1" opacity="0.75" />`);
        tipParts.push(`L: ${p.left.toFixed(1)}`);
      }
      if (p.right != null) {
        const yR = getY(p.right);
        elements.push(`<circle cx="${x}" cy="${yR}" r="2" fill="${color}" />`);
        tipParts.push(`R: ${p.right.toFixed(1)}`);
      }

      const tip = `${mmdd(p.date)} · ${tipParts.join(' ')} ${unit}`.replace(/'/g, "\\'");
      const centerY = p.left != null && p.right != null ? (getY(p.left) + getY(p.right)) / 2 : getY(p.left || p.right);
      elements.push(`<circle cx="${x}" cy="${centerY}" r="7" fill="transparent" style="cursor:pointer"
                   onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`);

      return elements.join('');
    }).join('');

    return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;flex-shrink:0;overflow:visible">
      ${gridLines}
      ${weekLines}
      ${leftPathHTML}
      ${rightPathHTML}
      ${dotsHTML}
    </svg>
  `;
  }

  const MUSCLE_TO_UNIFIED_GROUP = {
    chest: 'chest', shoulders: 'shoulders', rear_delts: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms',
    upper_back: 'back', lats: 'back', lower_back: 'back', core: 'core', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'calves'
  };

  const METRIC_TO_UNIFIED_GROUP = {
    chest_cm: 'chest', shoulder_cm: 'shoulders', l_arm_cm: 'arms', r_arm_cm: 'arms', neck_cm: 'back', waist_cm: 'core',
    hip_cm: 'legs', l_thigh_cm: 'legs', r_thigh_cm: 'legs', l_calf_cm: 'calves', r_calf_cm: 'calves', head_cm: 'other', weight_kg: 'other'
  };

  const UNIFIED_GROUPS = [
    { id: 'chest', label: 'Chest' }, { id: 'shoulders', label: 'Shoulders' }, { id: 'arms', label: 'Arms' }, { id: 'back', label: 'Back' },
    { id: 'core', label: 'Core' }, { id: 'legs', label: 'Legs & Glutes' }, { id: 'calves', label: 'Calves' }, { id: 'other', label: 'Other / Weight' }
  ];

  if (typeof window !== "undefined") {
    window.microSparkline = microSparkline;
    window.renderMeasurementSparkline = renderMeasurementSparkline;
    window.renderPairedMeasurementSparkline = renderPairedMeasurementSparkline;
    window.MUSCLE_TO_UNIFIED_GROUP = MUSCLE_TO_UNIFIED_GROUP;
    window.METRIC_TO_UNIFIED_GROUP = METRIC_TO_UNIFIED_GROUP;
    window.UNIFIED_GROUPS = UNIFIED_GROUPS;
  }

  // ─── file: workout-ui-home-calendar.js ───
  // Calendar rendering logic for the Home tab of Workout Tracker

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
    // not just that one did. Mains are solid; each micro is an OUTLINE badge in
    // the hue of the main it follows (rotation: Squat → arms → Deadlift → delts), so the two
    // color pairs read as the two halves of the program cycle. Unknown/legacy
    // names fall back to a solid gray badge.
    const WORKOUT_BADGES = {
      "Main: Squat": { label: "Squat", color: "#3b82f6" },
      "Main: Deadlift": { label: "Deadlift", color: "#10b981" },
      "Micro: Arms": { label: "arms", color: "#3b82f6", micro: true },
      "Micro: Delts & Traps": { label: "delts", color: "#10b981", micro: true },
      // Pre-rename session names (history rows are normalized at load; kept as a fallback).
      "Main A": { label: "Squat", color: "#3b82f6" },
      "Main B": { label: "Deadlift", color: "#10b981" },
      "Main: RDL": { label: "Deadlift", color: "#10b981" },
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

  window.changeCalendarMonth = function(delta) {
    state.calendarMonthOffset = (state.calendarMonthOffset || 0) + delta;
    render();
  };

  // ─── file: workout-ui-home-summary.js ───
  function renderWorkoutSummaryCard() {
    const history = state.history || [];
    if (!history.length) return '';

    const latest = history.find(s => (s.sets || []).some(x => x.set_type === 'working' && x.reps));
    if (!latest) return '';

    const _esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const name = _esc(latest.workout_name);
    const dateStr = _esc(latest.date);
    const durSec = latest.duration_sec || 0;
    const m = Math.floor(durSec / 60);

    const muscles = {};
    const addMus = (exName, setVol) => {
      const map = EXERCISE_MUSCLES[exName];
      if (!map) return;
      map.primary.forEach(m => {
        muscles[m] = (muscles[m] || 0) + setVol * getMuscleImpact(exName, m, true);
      });
      map.secondary.forEach(m => {
        muscles[m] = (muscles[m] || 0) + setVol * getMuscleImpact(exName, m, false);
      });
    };

    const exerciseSummary = {};
    (latest.sets || []).forEach(set => {
      if (set.set_type !== 'working' || !set.reps) return;
      const ex = set.exercise;
      const r = parseInt(set.reps) || 0;
      const w = parseFloat(set.weight_lb) || 0;
      const vol = r * w;
      addMus(ex, vol);

      if (!exerciseSummary[ex]) {
        exerciseSummary[ex] = { bestW: 0, bestR: 0, best1RM: 0, totalVol: 0, setsCount: 0, historyWeights: [] };
      }
      const sum = exerciseSummary[ex];
      sum.totalVol += vol;
      sum.setsCount++;
      const est = calcSet1RM(ex, w, r, set.bands_json, set.grip);
      const isAssist = ex === "Pull-Ups" || ex === "Dips" || ex === "Dead Hang + Scap Pulls" || ex === "Hanging Knee Raise";
      if (sum.best1RM === 0 && isAssist) sum.best1RM = -Infinity;
      if (est > sum.best1RM) {
        sum.bestW = w;
        sum.bestR = r;
        sum.best1RM = est;
      }
    });

    const muscleVolumeList = Object.entries(muscles).sort((a,b) => b[1] - a[1]);
    const totalMusVolume = muscleVolumeList.reduce((sum, item) => sum + item[1], 0) || 1;

    const sameWorkoutHistory = history
      .filter(s => s.workout_name === latest.workout_name && (s.sets || []).some(x => x.set_type === 'working' && x.reps))
      .slice(0, 5)
      .reverse();

    let maxSessionVol = 0;
    const historyData = sameWorkoutHistory.map(s => {
      let vol = 0;
      (s.sets || []).forEach(set => {
        if (set.set_type === 'working' && set.reps) {
          vol += (parseInt(set.reps) || 0) * (parseFloat(set.weight_lb) || 0);
        }
      });
      if (vol > maxSessionVol) maxSessionVol = vol;
      return { date: s.date, volume: vol };
    });

    const _assist = (n) => n === "Pull-Ups" || n === "Dips" || n === "Dead Hang + Scap Pulls" || n === "Hanging Knee Raise";
    const exList = Object.entries(exerciseSummary).map(([exName, sum]) => {
      const perSession = [];
      history.forEach(s => {
        let best = _assist(exName) ? -Infinity : 0, bw = 0, br = 0, has = false;
        (s.sets || []).forEach(set => {
          if (set.exercise === exName && set.set_type === 'working' && set.reps) {
            has = true;
            const w = parseFloat(set.weight_lb) || 0, r = parseInt(set.reps) || 0;
            const est = calcSet1RM(exName, w, r, set.bands_json, set.grip);
            if (est > best) { best = est; bw = w; br = r; }
          }
        });
        if (has) perSession.push({ date: s.date, value: best, w: bw, r: br });
      });
      perSession.reverse();
      const today1RM = perSession.length ? perSession[perSession.length - 1].value : sum.best1RM;
      const prior1RM = perSession.length > 1 ? perSession[perSession.length - 2].value : null;
      const priors = perSession.slice(0, -1);
      const priorMax = priors.length ? Math.max(...priors.map(p => p.value)) : (_assist(exName) ? -Infinity : 0);
      const prevBest = priors.length ? priors.reduce((m, p) => p.value > m.value ? p : m, priors[0]) : null;
      const isAssist = _assist(exName);
      const isPR = today1RM > priorMax && (isAssist ? today1RM > -Infinity : today1RM > 0);
      const deltaPct = (prior1RM != null && (isAssist ? prior1RM > -Infinity : prior1RM > 0))
        ? Math.round(((today1RM - prior1RM) / Math.abs(prior1RM || 1)) * 100)
        : null;
      return { exName, sum, isPR, deltaPct, prevBest, sparkPts: perSession.slice(-6) };
    });

    const totalSets = exList.reduce((n, e) => n + e.sum.setsCount, 0);
    const numLifts = exList.length;
    const upCount = exList.filter(e => e.deltaPct != null && e.deltaPct > 0).length;
    const downCount = exList.filter(e => e.deltaPct != null && e.deltaPct < 0).length;
    const latestVol = historyData.length ? historyData[historyData.length - 1].volume : 0;
    const prevVol = historyData.length > 1 ? historyData[historyData.length - 2].volume : 0;
    const netTrend = prevVol > 0 ? Math.round(((latestVol - prevVol) / prevVol) * 100) : null;

    const weekAnchorMs = Date.parse(latest.date + 'T00:00:00');
    const weekStartMs = weekAnchorMs - 6 * 86400000;
    const weeklySets = {};
    history.forEach(s => {
      const sMs = Date.parse(s.date + 'T00:00:00');
      if (isNaN(sMs) || sMs < weekStartMs || sMs > weekAnchorMs) return;
      (s.sets || []).forEach(set => {
        if (set.set_type !== 'working' || !set.reps) return;
        const map = EXERCISE_MUSCLES[set.exercise];
        if (!map) return;
        map.primary.forEach(mm => { weeklySets[mm] = (weeklySets[mm] || 0) + getMuscleImpact(set.exercise, mm, true); });
        map.secondary.forEach(mm => { weeklySets[mm] = (weeklySets[mm] || 0) + getMuscleImpact(set.exercise, mm, false); });
      });
    });

    const todaySets = {};
    (latest.sets || []).forEach(set => {
      if (set.set_type !== 'working' || !set.reps) return;
      const map = EXERCISE_MUSCLES[set.exercise];
      if (!map) return;
      map.primary.forEach(mm => { todaySets[mm] = (todaySets[mm] || 0) + getMuscleImpact(set.exercise, mm, true); });
      map.secondary.forEach(mm => { todaySets[mm] = (todaySets[mm] || 0) + getMuscleImpact(set.exercise, mm, false); });
    });

    const combinedList = [];
    const allKeys = new Set([...Object.keys(weeklySets), ...Object.keys(todaySets)]);
    allKeys.forEach(mn => {
      const weeklyVal = weeklySets[mn] || 0;
      const todayVal = todaySets[mn] || 0;
      combinedList.push({ mn, weeklyVal, todayVal });
    });
    combinedList.sort((a, b) => b.weeklyVal - a.weeklyVal || b.todayVal - a.todayVal);
    const finalList = combinedList.slice(0, 8);
    const maxWeeklySets = Math.max(1, ...finalList.map(r => r.weeklyVal));

    const MONO = 'ui-monospace,Menlo,monospace';
    const fmtW = (w) => (Math.round(w * 10) / 10);
    const mmdd = (d) => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[1]}/${p[2]}` : (d || ''); };

    const spark = (pts, exName) => {
      const data = (pts || []).filter(p => p && isFinite(p.value));
      if (data.length < 2) return '<div style="width:52px;flex-shrink:0"></div>';
      const vals = data.map(p => p.value);
      let mx = Math.max(...vals), mn = Math.min(...vals);
      const hasGoal = exName === "Barbell Bench Press";
      const goalVal = 180;
      if (hasGoal) {
        mx = Math.max(mx, goalVal);
        mn = Math.min(mn, goalVal * 0.6);
      }
      const rng = mx - mn || 1;
      const w = 52, h = 22, pad = 2;
      const xy = data.map((p, i) => ({
        x: pad + (i / (data.length - 1)) * (w - pad * 2),
        y: pad + (1 - (p.value - mn) / rng) * (h - pad * 2),
      }));
      const poly = xy.map(c => `${c.x},${c.y}`).join(' ');
      const dots = xy.map((c, i) => {
        const tip = `${mmdd(data[i].date)} · ${Math.round(data[i].value)} lb est 1RM`.replace(/'/g, "\\'");
        const isLast = i === xy.length - 1;
        return `<circle cx="${c.x}" cy="${c.y}" r="${isLast ? 2 : 1.5}" fill="#a78bfa"/>`
          + `<circle cx="${c.x}" cy="${c.y}" r="7" fill="transparent" style="cursor:pointer"`
          + ` onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`;
      }).join('');
      let goalLine = '';
      if (hasGoal) {
        const goalY = pad + (1 - (goalVal - mn) / rng) * (h - pad * 2);
        goalLine = `<line x1="${pad}" y1="${goalY}" x2="${w - pad}" y2="${goalY}" stroke="rgba(239, 68, 68, 0.45)" stroke-width="0.8" stroke-dasharray="1.5,1.5" />`;
      }
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0;overflow:visible">${goalLine}<polyline points="${poly}" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
    };

    const bars = historyData.map(h => {
      const pct = maxSessionVol ? (h.volume / maxSessionVol) * 100 : 0;
      const isLatest = h.date === latest.date;
      const dl = mmdd(h.date);
      const vStr = h.volume >= 1000 ? `${(h.volume / 1000).toFixed(1)}k` : Math.round(h.volume);
      const tip = `${dl} · ${Math.round(h.volume).toLocaleString()} lb volume`;
      return `<div title="${tip}" style="flex:1;display:flex;flex-direction:column;align-items:center;cursor:pointer">
      <span style="font-size:9px;font-family:${MONO};color:${isLatest ? '#a78bfa' : '#9CA3AF'};margin-bottom:4px;font-weight:${isLatest ? '800' : '500'}">${vStr}</span>
      <div style="height:44px;width:100%;display:flex;align-items:end;justify-content:center;margin-bottom:4px">
        <div style="width:16px;height:${Math.max(8, pct)}%;background:${isLatest ? '#a78bfa' : 'rgba(255,255,255,0.2)'};border-radius:3px"></div>
      </div>
      <span style="font-size:9px;font-family:${MONO};color:${isLatest ? '#a78bfa' : '#6B7280'};font-weight:${isLatest ? '800' : '500'}">${dl}</span>
    </div>`;
    }).join('');

    const netColor = netTrend == null ? '#6B7280' : netTrend > 0 ? '#34D399' : netTrend < 0 ? '#F87171' : '#6B7280';

    const fmtSets = (x) => { const r = Math.round(x * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
    const weeklySetsHTML = finalList.length ? finalList.map(({ mn, weeklyVal, todayVal }) => {
      const label = (MUSCLE_GROUPS[mn] && MUSCLE_GROUPS[mn].label) || mn;
      const n = fmtSets(weeklyVal);
      const t = todayVal > 0 ? fmtSets(todayVal) : '—';
      const numColor = weeklyVal >= 10 && weeklyVal <= 20 ? '#34D399' : weeklyVal > 20 ? '#FBBF24' : '#C4B5FD';
      return `<div title="${_esc(label)}: ${n} weekly sets (${t} today)" style="display:flex;align-items:center;gap:12px;padding:2px 0;cursor:default">
      <span style="width:84px;flex-shrink:0;color:#D1D5DB;font-size:12px">${_esc(label)}</span>
      <div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${(weeklyVal / maxWeeklySets) * 100}%;background:rgba(167,139,250,0.55);border-radius:99px"></div>
      </div>
      <div style="width:48px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1.2;flex-shrink:0">
        <span style="color:${numColor};font-size:12.5px;font-weight:800;font-family:${MONO}">${n}</span>
        <span style="color:#6B7280;font-size:9.5px;font-weight:600;font-family:${MONO}">${t}</span>
      </div>
    </div>`;
    }).join('') : `<div style="color:#6B7280;font-size:12px;padding:6px 0">No working sets logged.</div>`;

    const exHTML = exList.map(e => {
      const pr = e.isPR;
      const dc = e.deltaPct == null ? '#6B7280' : e.deltaPct > 0 ? '#34D399' : e.deltaPct < 0 ? '#F87171' : '#6B7280';
      const dt = e.deltaPct == null ? '' : `${e.deltaPct > 0 ? '+' : ''}${e.deltaPct}%`;
      return `<div style="background:${pr ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.01)'};border:1px solid ${pr ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)'};${pr ? 'border-left:3px solid #FBBF24;' : ''}border-radius:8px;padding:6px 10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
          ${pr ? `<span style="color:#FBBF24;font-size:10px;flex-shrink:0">★</span>` : ''}
          <span style="color:#F3F4F6;font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(e.exName)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${spark(e.sparkPts, e.exName)}
          ${dt ? `<span style="min-width:36px;text-align:right;color:${dc};font-family:${MONO};font-size:12px;font-weight:800">${dt}</span>` : `<span style="width:36px"></span>`}
        </div>
      </div>
      <div style="margin-top:3px;color:#6B7280;font-size:10.5px;font-family:${MONO}">Top <span style="color:#D1D5DB;font-weight:700">${fmtW(e.sum.bestW)}×${e.sum.bestR}</span> · 1RM ${Math.round(e.sum.best1RM)} · ${e.sum.setsCount} sets</div>
    </div>`;
    }).join('');

    return `
    <div data-noinvert style="margin-bottom:12px;overflow:hidden;background:#0B0F14;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px 12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">
        <div style="min-width:140px;flex:1">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;letter-spacing:0.08em;color:#C4B5FD;background:rgba(139,92,246,0.16);border:1px solid rgba(139,92,246,0.35);padding:4px 10px;border-radius:99px;font-family:${MONO}">✓ DONE</span>
          <h3 style="font-size:24px;font-weight:800;color:#F3F4F6;margin:6px 0 2px;letter-spacing:-0.02em;line-height:1.05">${name}</h3>
          <span style="font-size:12px;color:#6B7280;font-family:${MONO}">${dateStr}</span>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-shrink:0">
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:6px 10px;min-width:70px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#F3F4F6;font-family:${MONO};line-height:1">${m}<span style="font-size:10px;color:#6B7280;margin-left:2px">m</span></div>
            <div style="font-size:8px;font-weight:800;letter-spacing:0.08em;color:#6B7280;font-family:${MONO};margin-top:4px">DURATION</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:6px 10px;min-width:70px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#F3F4F6;font-family:${MONO};line-height:1">${totalSets}</div>
            <div style="font-size:8px;font-weight:800;letter-spacing:0.08em;color:#6B7280;font-family:${MONO};margin-top:4px">SETS</div>
            <div style="font-size:8px;color:#6B7280;margin-top:2px;line-height:1">${numLifts} lifts</div>
          </div>
        </div>

        ${historyData.length > 1 ? `
          <div style="width:180px;flex-shrink:0;display:flex;flex-direction:column;gap:6px">
            <div style="font-size:8px;font-weight:800;letter-spacing:0.08em;color:#6B7280;font-family:${MONO};text-align:right">
              VOL TREND: <span style="color:${netColor};font-weight:800">${netTrend == null ? '—' : `${netTrend > 0 ? '+' : ''}${netTrend}%`}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:end">${bars}</div>
          </div>
        ` : ''}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 6px">
        <span style="font-size:10px;font-weight:800;letter-spacing:0.1em;color:#6B7280;font-family:${MONO}">ALL EXERCISES</span>
        <span style="font-size:11px;color:#6B7280">${numLifts} lifts · est. 1RM trend${upCount || downCount ? ` (${upCount} up · ${downCount} down)` : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px">
        ${exHTML || '<div style="color:#6B7280;font-size:12px;padding:8px 0">No working sets logged.</div>'}
      </div>
    </div>
  `;
  }

  if (typeof window !== "undefined") {
    window.renderWorkoutSummaryCard = renderWorkoutSummaryCard;
  }

  // ─── file: workout-ui-home-measurements-card.js ───
  // Strength & body progress card for the home screen: per-lift estimated-1RM
  // sparklines (absolute lb, not Strength Level percentiles — those live on the
  // website via the upload button on the session complete screen) and per-metric
  // body-measurement sparklines with deltas, grouped by body area, plus
  // collapsible history and add-entry form.
  function renderMeasurementsCard() {
    const history = state.history || [];
    const measurements = state.measurements || [];
    const sortedMeasAsc = [...measurements].sort((a, b) => (a.taken_at || '').localeCompare(b.taken_at || ''));
    const endDate = new Date();
    const endMs = endDate.setHours(23, 59, 59, 999);

    let startMs = 0;
    let minMs = Date.now();
    let hasData = false;

    history.forEach(sess => {
      if (sess.date) {
        const sessMs = Date.parse(sess.date + 'T00:00:00');
        if (!isNaN(sessMs)) {
          if (sessMs < minMs) minMs = sessMs;
          hasData = true;
        }
      }
    });

    measurements.forEach(e => {
      const d = e.taken_at || e.date;
      if (d) {
        const mMs = Date.parse(d.replace(' ', 'T'));
        if (!isNaN(mMs)) {
          if (mMs < minMs) minMs = mMs;
          hasData = true;
        }
      }
    });

    if (hasData) {
      const earliestDate = new Date(minMs);
      earliestDate.setHours(0, 0, 0, 0);
      startMs = earliestDate.getTime();
    } else {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60);
      startMs = startDate.setHours(0, 0, 0, 0);
    }

    const inRange = (e, id) => {
      const d = (e.taken_at || e.date || '').replace(' ', 'T');
      const ms = Date.parse(d);
      return e[id] != null && ms >= startMs && ms <= endMs;
    };

    // Best estimated 1RM per exercise per day, from working sets.
    const exerciseDates = {};
    history.forEach(sess => {
      if (!sess.date) return;
      const sessMs = Date.parse(sess.date + 'T00:00:00');
      if (sessMs < startMs || sessMs > endMs) return;
      (sess.sets || []).forEach(st => {
        if (st.set_type !== 'working' || !st.reps) return;
        const w = parseFloat(st.weight_lb) || 0;
        const r = parseInt(st.reps) || 0;
        if (w <= 0 || r <= 0) return;
        const orm = calcSet1RM(st.exercise, w, r, st.bands_json, st.grip);
        if (!exerciseDates[st.exercise]) exerciseDates[st.exercise] = {};
        if (exerciseDates[st.exercise][sess.date] === undefined || orm > exerciseDates[st.exercise][sess.date]) {
          exerciseDates[st.exercise][sess.date] = orm;
        }
      });
    });

    const exercisesList = Object.entries(exerciseDates).map(([exName, datesObj]) => {
      const pts = Object.keys(datesObj).sort().map(date => ({
        date,
        ms: Date.parse(date + 'T00:00:00'),
        value: datesObj[date],
      }));
      const latest = pts[pts.length - 1];
      return {
        name: exName,
        latestOrm: latest.value,
        diffLb: pts.length > 1 ? Math.round(latest.value - pts[0].value) : null,
        pts,
        latestMs: latest.ms,
      };
    }).sort((a, b) => b.latestMs - a.latestMs || b.latestOrm - a.latestOrm);

    const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f43f5e", "#14b8a6"];
    const exColors = {};
    exercisesList.forEach((ex, idx) => {
      exColors[ex.name] = COLORS[idx % COLORS.length];
    });

    const groupData = UNIFIED_GROUPS.map(g => ({
      ...g,
      exercises: exercisesList.filter(ex => {
        const prim = EXERCISE_MUSCLES[ex.name]?.primary?.[0] || 'other';
        return (MUSCLE_TO_UNIFIED_GROUP[prim] || 'other') === g.id;
      }),
      metrics: (typeof MEASUREMENT_METRICS !== 'undefined' ? MEASUREMENT_METRICS : []).filter(m => (METRIC_TO_UNIFIED_GROUP[m.id] || 'other') === g.id),
    })).filter(g => g.exercises.length > 0 || g.metrics.some(m => sortedMeasAsc.some(e => inRange(e, m.id))));

    let rowsHTML = '';
    if (groupData.length === 0) {
      rowsHTML = `
      <div style="text-align:center;padding:24px 0;color:#9ca3af;font-size:12px;border:1px dashed rgba(0,0,0,0.1);border-radius:8px;margin-top:12px">
        No progress data logged yet.
      </div>`;
    } else {
      rowsHTML = groupData.map(g => {
        const visualRows = [];
        const visited = new Set();
        g.metrics.forEach(m => {
          if (visited.has(m.id)) return;

          let pairedPartner = null;
          let pairedLabel = '';
          if (m.id === 'l_arm_cm') { pairedPartner = 'r_arm_cm'; pairedLabel = 'Arms (L/R)'; }
          else if (m.id === 'r_arm_cm') { pairedPartner = 'l_arm_cm'; pairedLabel = 'Arms (L/R)'; }
          else if (m.id === 'l_thigh_cm') { pairedPartner = 'r_thigh_cm'; pairedLabel = 'Thighs (L/R)'; }
          else if (m.id === 'r_thigh_cm') { pairedPartner = 'l_thigh_cm'; pairedLabel = 'Thighs (L/R)'; }
          else if (m.id === 'l_calf_cm') { pairedPartner = 'r_calf_cm'; pairedLabel = 'Calves (L/R)'; }
          else if (m.id === 'r_calf_cm') { pairedPartner = 'l_calf_cm'; pairedLabel = 'Calves (L/R)'; }

          if (pairedPartner) {
            const leftId = m.id.startsWith('l_') ? m.id : pairedPartner;
            const rightId = m.id.startsWith('r_') ? m.id : pairedPartner;
            const leftMetric = g.metrics.find(x => x.id === leftId);
            const rightMetric = g.metrics.find(x => x.id === rightId);

            visualRows.push({
              isPaired: true,
              leftId,
              rightId,
              leftLabel: leftMetric ? leftMetric.label : 'L',
              rightLabel: rightMetric ? rightMetric.label : 'R',
              label: pairedLabel,
              color: m.color,
              direction: m.direction,
              unit: m.unit || 'cm'
            });
            visited.add(leftId);
            visited.add(rightId);
          } else {
            visualRows.push({
              isPaired: false,
              ...m
            });
            visited.add(m.id);
          }
        });

        const renderedMetrics = visualRows.map(m => {
          if (!m.isPaired) {
            const pts = sortedMeasAsc.map(e => {
              const d = e.taken_at || e.date || '';
              return { date: d.slice(0, 10), ms: Date.parse(d.replace(' ', 'T') || 0), value: e[m.id] };
            }).filter(p => p.value != null && p.ms >= startMs && p.ms <= endMs);
            if (!pts.length) return '';
            const v = pts[pts.length - 1].value;
            const pv = pts.length > 1 ? pts[0].value : null;
            const delta = _measurementDelta(v, pv, m.direction);
            const vals = pts.map(p => p.value);
            const range = vals.length > 1 ? `${Math.min(...vals).toFixed(1)} → ${Math.max(...vals).toFixed(1)}` : `${vals[0].toFixed(1)}`;
            const unit = m.unit || 'cm';

            const diffColor = delta ? delta.color : '#9ca3af';
            const diffText = delta
              ? `<span style="font-size:10px;font-weight:700;color:${diffColor};width:42px;text-align:right;flex-shrink:0">${delta.sign}${Math.abs(delta.d).toFixed(1)}</span>`
              : `<span style="font-size:10px;font-weight:700;color:#9ca3af;width:42px;text-align:right;flex-shrink:0;opacity:0.25">-</span>`;

            const sparklineHTML = renderMeasurementSparkline(pts, m.color, startMs, endMs, unit);

            return `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:8px;border:1px solid #f3f4f6;background:#ffffff;border-radius:8px;gap:12px">
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="width:7px;height:7px;border-radius:50%;background:${m.color};display:inline-block;flex-shrink:0"></span>
                  <span style="color:#111827;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.label}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-size:10px;color:#6b7280">${v != null ? v.toFixed(1) : '—'} ${unit}</span>
                  <span style="font-size:8px;color:#9ca3af;font-family:monospace">${range} range</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${sparklineHTML}
                ${diffText}
              </div>
            </div>
          `;
          } else {
            const leftPts = sortedMeasAsc.map(e => {
              const d = e.taken_at || e.date || '';
              return { date: d.slice(0, 10), ms: Date.parse(d.replace(' ', 'T') || 0), value: e[m.leftId] };
            }).filter(p => p.value != null && p.ms >= startMs && p.ms <= endMs);

            const rightPts = sortedMeasAsc.map(e => {
              const d = e.taken_at || e.date || '';
              return { date: d.slice(0, 10), ms: Date.parse(d.replace(' ', 'T') || 0), value: e[m.rightId] };
            }).filter(p => p.value != null && p.ms >= startMs && p.ms <= endMs);

            if (!leftPts.length && !rightPts.length) return '';

            const leftLatest = leftPts.length ? leftPts[leftPts.length - 1].value : null;
            const leftPrev = leftPts.length > 1 ? leftPts[0].value : null;
            const leftDelta = _measurementDelta(leftLatest, leftPrev, m.direction);

            const rightLatest = rightPts.length ? rightPts[rightPts.length - 1].value : null;
            const rightPrev = rightPts.length > 1 ? rightPts[0].value : null;
            const rightDelta = _measurementDelta(rightLatest, rightPrev, m.direction);

            const unit = m.unit || 'cm';
            const leftValStr = leftLatest != null ? leftLatest.toFixed(1) : '—';
            const rightValStr = rightLatest != null ? rightLatest.toFixed(1) : '—';

            const diffText = `
            <div style="display:flex;flex-direction:column;align-items:flex-end;width:42px;flex-shrink:0;line-height:1.2;font-size:9px;font-family:monospace">
              <div><span style="color:#6b7280;font-size:8px">L:</span>${leftDelta ? `<span style="font-weight:700;color:${leftDelta.color}">${leftDelta.sign}${Math.abs(leftDelta.d).toFixed(1)}</span>` : '<span style="color:#9ca3af;opacity:0.25">-</span>'}</div>
              <div><span style="color:#6b7280;font-size:8px">R:</span>${rightDelta ? `<span style="font-weight:700;color:${rightDelta.color}">${rightDelta.sign}${Math.abs(rightDelta.d).toFixed(1)}</span>` : '<span style="color:#9ca3af;opacity:0.25">-</span>'}</div>
            </div>
          `;

            const sparklineHTML = renderPairedMeasurementSparkline(leftPts, rightPts, m.color, startMs, endMs, unit);

            return `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:8px;border:1px solid #f3f4f6;background:#ffffff;border-radius:8px;gap:12px">
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="width:7px;height:7px;border-radius:50%;background:${m.color};display:inline-block;flex-shrink:0"></span>
                  <span style="color:#111827;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.label}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-size:10px;color:#374151">
                    L: <strong>${leftValStr}</strong> · R: <strong>${rightValStr}</strong> <span style="font-size:9px;color:#6b7280">${unit}</span>
                  </span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${sparklineHTML}
                ${diffText}
              </div>
            </div>
          `;
          }
        }).join('');

        const renderedExercises = g.exercises.map(ex => {
          const color = exColors[ex.name];
          const isRepsOnly = ex.name === 'Hanging Knee Raise';
          const unit = isRepsOnly ? 'reps' : 'lb';
          const sign = ex.diffLb > 0 ? '+' : '';
          const diffColor = ex.diffLb > 0 ? '#10b981' : ex.diffLb < 0 ? '#ef4444' : '#9ca3af';
          const diffText = ex.diffLb !== null
            ? `<span style="font-size:10px;font-weight:700;color:${diffColor};width:42px;text-align:right;flex-shrink:0">${sign}${ex.diffLb}</span>`
            : `<span style="font-size:10px;font-weight:700;color:#9ca3af;width:42px;text-align:right;flex-shrink:0;opacity:0.25">-</span>`;
          const goal = ex.name === 'Barbell Bench Press' ? { value: 180, label: 'Goal: 180 lb' } : null;
          const sparklineHTML = renderMeasurementSparkline(ex.pts, color, startMs, endMs, unit, goal);

          return `
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:8px;border:1px solid #f3f4f6;background:#ffffff;border-radius:8px;gap:12px">
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
                <span style="color:#111827;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ex.name}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-size:10px;color:#6b7280">${Math.round(ex.latestOrm)} ${unit}${isRepsOnly ? '' : ' est 1RM'}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              ${sparklineHTML}
              ${diffText}
            </div>
          </div>
        `;
        }).join('');

        let groupContent = '';
        if (renderedExercises && renderedMetrics) {
          groupContent = `
          <div style="display:flex; flex-wrap:wrap; gap:16px;">
            <div style="flex:1; min-width:280px;">
              <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Lifts · est 1RM</div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${renderedExercises}
              </div>
            </div>
            <div style="flex:1; min-width:280px;">
              <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Measurements</div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${renderedMetrics}
              </div>
            </div>
          </div>
        `;
        } else if (renderedExercises) {
          groupContent = `
          <div>
            <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Lifts · est 1RM</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px">
              ${renderedExercises}
            </div>
          </div>
        `;
        } else if (renderedMetrics) {
          groupContent = `
          <div>
            <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Measurements</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px">
              ${renderedMetrics}
            </div>
          </div>
        `;
        }

        if (!groupContent) return '';

        return `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>${g.label}</span>
            <span style="flex:1;height:1px;background:rgba(0,0,0,0.05)"></span>
          </div>
          <div style="padding-left:4px">
            ${groupContent}
          </div>
        </div>
      `;
      }).join('');
    }

    const formOpen = !!state.showMeasForm;
    const histOpen = !!state.showMeasHistory;

    const historyRows = measurements.map(e => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid #f3f4f6">
      <span style="font-size:11px;color:#6b7280;font-family:monospace;min-width:60px">${_formatMeasurementDate(e.taken_at)}</span>
      <span style="font-size:11px;font-family:monospace;color:#374151;flex:1;text-align:center">
        ${e.chest_cm != null ? `<span style="color:#ef4444">${e.chest_cm.toFixed(1)}c</span>` : '—'} ·
        ${e.waist_cm != null ? `<span style="color:#3b82f6">${e.waist_cm.toFixed(1)}w</span>` : '—'} ·
        ${e.l_arm_cm != null ? `<span style="color:#dc2626">${e.l_arm_cm.toFixed(1)}a</span>` : '—'}
      </span>
      <button onclick="deleteMeasurement('${e.id}')" style="font-size:9px;color:#9ca3af;background:none;border:1px solid #e5e7eb;border-radius:4px;padding:2px 6px;cursor:pointer">×</button>
    </div>`).join('');

    const actionSectionHTML = `
    <div style="border-top:1px solid rgba(0,0,0,0.05);padding-top:12px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <button onclick="state.showMeasHistory=!state.showMeasHistory;render()" style="font-size:11px;font-weight:700;color:#6b7280;background:none;border:1px solid #e5e7eb;border-radius:7px;padding:4px 10px;cursor:pointer">
        ${histOpen ? '✕ Close History' : `History · ${measurements.length} entries`}
      </button>
      <button onclick="state.showMeasForm=!state.showMeasForm;render()" style="font-size:11px;font-weight:700;color:${formOpen ? '#6b7280' : '#2563eb'};background:none;border:1px solid ${formOpen ? '#e5e7eb' : '#bfdbfe'};border-radius:7px;padding:4px 10px;cursor:pointer">
        ${formOpen ? '✕ Close Form' : '＋ Add Measurement'}
      </button>
    </div>
    ${histOpen ? `<div style="margin-top:10px;max-height:200px;overflow-y:auto;border:1px solid #f3f4f6;border-radius:8px;background:white">${historyRows}</div>` : ''}
    ${formOpen ? `<div style="margin-top:12px">${_renderMeasurementForm()}</div>` : ''}
  `;

    return `
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">
        <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0">Strength & Body Progress (All Time)</h3>
      </div>
      <div style="border-top:1px solid rgba(0,0,0,0.05);padding-top:8px">
        ${rowsHTML}
      </div>
      ${actionSectionHTML}
    </div>
  `;
  }

  if (typeof window !== "undefined") {
    window.renderMeasurementsCard = renderMeasurementsCard;
  }

  // ─── file: workout-ui-home.js ───
  // UI rendering logic for the Home tab of Workout Tracker

  function renderWorkoutMuscleMap(w) {
    const muscles = {};
    const add = (mapping, sets) => {
      if (!mapping) return;
      (mapping.primary || []).forEach(m => { muscles[m] = (muscles[m] || 0) + sets; });
      (mapping.secondary || []).forEach(m => { muscles[m] = (muscles[m] || 0) + sets * 0.5; });
    };
    w.exercises.forEach(ex => {
      const sets = ex.sets || 3;
      if (ex.supersetExercises) {
        ex.supersetExercises.forEach(sub => add(EXERCISE_MUSCLES[sub.name], sets));
      } else {
        add(EXERCISE_MUSCLES[ex.name], sets);
      }
    });

    const sorted = Object.entries(muscles)
      .filter(([_, sets]) => sets > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const badgeHTML = sorted.map(([id, sets]) => {
      const label = (window.MUSCLE_GROUPS && window.MUSCLE_GROUPS[id]) ? window.MUSCLE_GROUPS[id].label : id;
      let color = "#60a5fa", bg = "rgba(96,165,250,0.06)", border = "rgba(96,165,250,0.15)";
      if (["chest", "triceps"].includes(id)) {
        color = "#60a5fa"; bg = "rgba(96,165,250,0.06)"; border = "rgba(96,165,250,0.15)";
      } else if (["quads", "calves"].includes(id)) {
        color = "#34d399"; bg = "rgba(52,211,153,0.06)"; border = "rgba(52,211,153,0.15)";
      } else if (["shoulders", "rear_delts"].includes(id)) {
        color = "#f472b6"; bg = "rgba(244,114,182,0.06)"; border = "rgba(244,114,182,0.15)";
      } else if (["biceps", "forearms"].includes(id)) {
        color = "#a78bfa"; bg = "rgba(167,139,250,0.06)"; border = "rgba(167,139,250,0.15)";
      } else if (["upper_back", "lats", "lower_back", "glutes", "hamstrings"].includes(id)) {
        color = "#fbbf24"; bg = "rgba(251,191,36,0.06)"; border = "rgba(251,191,36,0.15)";
      } else if (id === "core") {
        color = "#22d3ee"; bg = "rgba(34,211,238,0.06)"; border = "rgba(34,211,238,0.15)";
      }
      return `<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${color};background:${bg};border:1px solid ${border};padding:2.5px 6px;border-radius:5px;text-align:center;white-space:nowrap;font-family:ui-monospace,Menlo,monospace">${label}</div>`;
    }).join("");

    return `<div data-noinvert style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;width:72px">${badgeHTML}</div>`;
  }

  function renderWorkoutCard(w, isSuggested, isOngoing, logged, expected, pct) {
    const kindLabel = w => w.kind === 'micro' ? 'Micro' : w.kind === 'optional' ? 'Optional' : 'Main';
    const deloadOn = isDeloadActive(window.USER_SETTINGS || {});
    const deloadPill = deloadOn
      ? `<span style="font-size:8px;font-weight:800;letter-spacing:0.5px;color:#b45309;background:#fef3c7;border:1px solid #fcd34d;padding:2px 5px;border-radius:5px;font-family:ui-monospace,Menlo,monospace;vertical-align:middle;margin-right:5px">DELOAD</span>`
      : '';
    const exerciseEntries = [];
    w.exercises.forEach(ex => {
      if (ex.supersetExercises) {
        ex.supersetExercises.forEach(sub => exerciseEntries.push(sub));
      } else {
        exerciseEntries.push(ex);
      }
    });

    const rowsHTML = exerciseEntries.map(ex => {
      const s = state.lastSession[`${ex.name}|working|1`] || state.lastSession[`${ex.name}|working|2`] || state.lastSession[`${ex.name}|working|3`];
      const weightVal = s ? (s.weight_lb || '—') : '—', repsVal = s ? (s.reps || '—') : '—';
      const valLabel = s ? `${weightVal}lb × ${repsVal}` : '—';
      const name = ex.name;
      return `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;gap:6px">
        <span style="color:${isSuggested ? '#4b5563' : '#374151'};font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
        <span style="color:${isSuggested ? '#4b5563' : '#6b7280'};font-family:ui-monospace,Menlo,monospace;flex-shrink:0">${valLabel}</span>
      </div>
    `;
    }).join("");

    const bgStyle = isSuggested
      ? `background:linear-gradient(135deg, #eff6ff, #dbeafe); border:1px solid #bfdbfe; box-shadow:0 4px 12px rgba(59,130,246,0.08)`
      : `background:white; border:1px solid #e5e7eb`;

    const infoLabel = isSuggested && isOngoing
      ? `${logged} of ${expected} sets logged (${pct}%)`
      : `${kindLabel(w)} · ~${Math.round(estimateTemplateWorkoutDuration(w) / 60)} min${isSuggested ? ' · up next' : ''}`;

    return `
    <a href="/session?w=${w.id}" style="text-decoration:none;display:block;">
      <div class="card clickable" style="padding:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;${bgStyle}">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;gap:6px">
            <span style="font-size:14px;font-weight:800;color:${isSuggested ? '#1d4ed8' : '#111827'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${deloadPill}${isSuggested && isOngoing ? '⚡ ' : ''}${w.name}
            </span>
            <span style="font-size:10px;color:${isSuggested ? '#1d4ed8' : '#9ca3af'};font-weight:700;flex-shrink:0;opacity:0.85">
              ${infoLabel}
            </span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">${rowsHTML}</div>
        </div>
        <div style="flex-shrink:0;display:flex;align-items:center;gap:10px">
          ${renderWorkoutMuscleMap(w)}
          ${!isSuggested ? `<span style="font-size:11px;color:#2563eb;font-weight:800;white-space:nowrap;margin-left:4px">Start →</span>` : ''}
        </div>
      </div>
    </a>
  `;
  }

  // Skeleton mirroring the home layout (deload strip, workout cards, calendar,
  // summary cards) so the first paint never shows default values as answers.
  function renderHomeSkeleton() {
    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const card = (h, inner) => `
    <div class="card" style="padding:14px;margin-bottom:10px">
      ${inner || `<div class="shimmer" style="height:${h}px"></div>`}
    </div>`;
    const workoutCard = (tall) => card(null, `
    <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:12px">
      <div style="flex:1"><div class="shimmer" style="height:18px;width:55%;margin-bottom:8px"></div><div class="shimmer" style="height:11px;width:35%"></div></div>
      <div class="shimmer" style="height:20px;width:72px"></div>
    </div>
    ${Array.from({ length: tall ? 4 : 2 }, () => `<div class="shimmer" style="height:12px;margin-bottom:8px"></div>`).join("")}
    ${tall ? `<div class="shimmer" style="height:40px;margin-top:10px"></div>` : ""}`);
    return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px 16px 40px; background:#f9fafb; min-height:100vh">
      <div style="display:flex;align-items:center;margin-bottom:16px">
        <div>
          <span style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${dateStr}</span>
          <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0">Workout Tracker</h2>
        </div>
      </div>
      ${card(40)}
      ${workoutCard(true)}
      ${workoutCard(false)}
      ${workoutCard(false)}
      ${workoutCard(false)}
      ${card(320)}
      ${card(220)}
    </div>
  `;
  }

  function renderHome() {
    if (!state.loaded) return renderHomeSkeleton();
    const deloadOn = isDeloadActive(window.USER_SETTINGS || {});
    const getExpectedSets = (w) => {
      let count = 0;
      w.exercises.forEach(ex => {
        const exName = ex.name;
        const cachedSkips = loadSkippedExercises(w.name, localDate());
        if (cachedSkips.has(exName)) return;
        if (ex.supersetExercises) {
          ex.supersetExercises.forEach(sub => {
            if (cachedSkips.has(sub.name)) return;
            count += deloadOn ? 1 : ex.sets;
          });
        } else {
          const warmups = ex.noWarmup || state.warmupOff?.[exName] ? 0 : 1;
          count += (deloadOn ? 1 : ex.sets) + warmups;
        }
      });
      return count;
    };

    const getLoggedCount = (w) => {
      const today = localDate();
      let count = 0;
      (state.todaySets || []).forEach(row => {
        if (row.workout === w.name && row.date === today && row.reps) count++;
      });
      return count;
    };

    const getSessionDateStr = () => {
      const today = new Date();
      return today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    };

    const activeSess = state._activeSessions && state._activeSessions[0];
    const program = WORKOUTS.filter(w => w.program);
    const byId = id => WORKOUTS.find(w => w.id === id);

    const ORDER = ['Main: Squat', 'Micro: Arms', 'Main: Deadlift', 'Micro: Delts & Traps'];
    let lastCompletedName = null;
    for (const s of (state.history || [])) {
      const name = LEGACY_WORKOUT_NAMES[s.workout_name] || s.workout_name;
      if (ORDER.includes(name)) {
        lastCompletedName = name;
        break;
      }
    }
    let nextW = byId('main-a');
    if (lastCompletedName) {
      const idx = ORDER.indexOf(lastCompletedName);
      const nextName = ORDER[(idx + 1) % ORDER.length];
      const map = { 'Main: Squat': 'main-a', 'Micro: Arms': 'micro-arms', 'Main: Deadlift': 'main-b', 'Micro: Delts & Traps': 'micro-delts' };
      nextW = byId(map[nextName]) || byId('main-a');
    }

    let activeWorkout = nextW;
    let isOngoing = false;
    let logged = 0;
    let expected = 0;
    let pct = 0;

    if (activeSess) {
      const w = WORKOUTS.find(x => x.name === activeSess.workout_name);
      if (w) {
        expected = getExpectedSets(w);
        logged = getLoggedCount(w);
        if (logged > 0 && logged < expected) {
          activeWorkout = w;
          isOngoing = true;
          pct = Math.round((logged / expected) * 100);
        }
      }
    }

    const activeIdx = program.findIndex(w => w.id === activeWorkout.id);
    const orderedProgram = [];
    if (activeIdx !== -1) {
      for (let i = 0; i < program.length; i++) {
        orderedProgram.push(program[(activeIdx + i) % program.length]);
      }
    } else {
      orderedProgram.push(...program);
    }

    const workoutsHTML = orderedProgram.map(w => {
      const isSuggested = w.id === activeWorkout.id;
      return renderWorkoutCard(w, isSuggested, isOngoing, logged, expected, pct);
    }).join('<div style="height:10px"></div>');

    const deloadCardHTML = `
    <div class="card" style="padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;${deloadOn ? 'background:#fffbeb;border:1px solid #fcd34d' : 'background:white;border:1px solid #e5e7eb'}">
      <div style="min-width:0">
        <span style="font-size:13px;font-weight:700;color:${deloadOn ? '#b45309' : '#374151'}">Deload week</span>
        <span style="font-size:11px;color:#9ca3af;display:block">${deloadOn ? `1 set @ 80% weight · auto-ends in ${deloadDaysLeft(window.USER_SETTINGS)}d` : 'Light week: 1 set @ 80% per exercise'}</span>
      </div>
      <button onclick="toggleDeload()" style="flex-shrink:0;border:0;cursor:pointer;font-weight:800;font-size:11px;letter-spacing:0.5px;padding:6px 14px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;${deloadOn ? 'background:#f59e0b;color:white' : 'background:#f3f4f6;color:#6b7280'}">${deloadOn ? 'ON' : 'OFF'}</button>
    </div>
  `;

    const workoutListHTML = `
    ${deloadCardHTML}
    <div style="display:flex;flex-direction:column;margin-bottom:8px;">
      ${workoutsHTML}
    </div>
    <div style="text-align:right;margin-bottom:16px;">
      <span style="font-size:11px; color:#9ca3af;">🧪 Test (nothing saved):
        ${program.filter(w => w.kind !== 'optional').map(w => `<a href="/session?w=${w.id}&test=1" style="color:#6b7280; text-decoration:underline;">${w.name.replace('Micro: ', '')}</a>`).join(' · ')}
      </span>
    </div>
  `;

    return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px 16px 40px; background:#f9fafb; min-height:100vh">
      <div style="display:flex;align-items:center;margin-bottom:16px">
        <div>
          <span style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${getSessionDateStr()}</span>
          <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0">Workout Tracker</h2>
        </div>
      </div>

      ${workoutListHTML}

      <div style="margin-bottom:16px;">
        ${renderCalendar()}
      </div>

      <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
        ${renderWorkoutSummaryCard()}
        ${renderMeasurementsCard()}
      </div>
    </div>
  `;
  }

  window.toggleDeload = async function() {
    const on = isDeloadActive(window.USER_SETTINGS || {});
    const body = on
      ? { deload_active: "0" }
      : { deload_active: "1", deload_started: localDate() };
    window.USER_SETTINGS = Object.assign(window.USER_SETTINGS || {}, body);
    render();
    try {
      await api.saveSettings(body);
    } catch (e) {
      console.error("[DELOAD] failed to save toggle:", e);
    }
  };

  if (typeof window !== "undefined") {
    window.renderWorkoutCard = renderWorkoutCard;
    window.renderHome = renderHome;
  }

  // ─── file: workout-ui-history.js ───
  // UI rendering logic for the History tab of Workout Tracker

  function getExDurs(s) {
    const sorted = (s.sets || []).filter(st => st.logged_at).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    const durs = {};
    const start = s.started_at ? Date.parse(s.started_at) : null;
    sorted.forEach((st, idx) => {
      const t = Date.parse(st.logged_at);
      let prev = idx === 0 ? (start && start < t && (t - start) < 7200000 ? start : t - 120000) : Date.parse(sorted[idx - 1].logged_at);
      durs[st.exercise] = (durs[st.exercise] || 0) + Math.max(0, Math.round((t - (isNaN(prev) ? t - 120000 : prev)) / 1000));
    });
    return durs;
  }

  function renderSessionList() {
    const WORKOUT_COLORS = {
      "Arms & Shoulders": "#8b5cf6",
      "Back": "#f59e0b",
      "Full Body A": "#3b82f6",
      "Full Body": "#3b82f6",
      "Full Body B": "#10b981",
    };

    const assistExerciseNames = new Set();
    WORKOUTS.forEach(w => {
      w.exercises.forEach(ex => {
        if (ex.assist) assistExerciseNames.add(ex.name);
        if (ex.supersetExercises) ex.supersetExercises.forEach(s => { if (s.assist) assistExerciseNames.add(s.name); });
      });
    });

    const history = state.history || [];
    const workoutVolTrend = {};
    [...history].reverse().forEach(s => {
      let vol = 0;
      s.sets.forEach(st => {
        if (st.set_type === 'working') vol += (st.weight_lb || 0) * (parseInt(st.reps) || 0);
      });
      if (!workoutVolTrend[s.workout_name]) workoutVolTrend[s.workout_name] = [];
      workoutVolTrend[s.workout_name].push(vol);
    });

    function historySparkline(workoutName, currentIdx) {
      const trend = workoutVolTrend[workoutName];
      if (!trend || trend.length < 2) return '';
      const vals = trend.slice(0, currentIdx + 1);
      if (vals.length < 2) return '';
      const max = Math.max(...vals), min = Math.min(...vals), range = max - min || 1;
      const w = 50, h = 18, pad = 2;
      const points = vals.map((v, i) =>
        `${pad + (i / (vals.length - 1)) * (w - pad * 2)},${pad + (1 - (v - min) / range) * (h - pad * 2)}`
      ).join(' ');
      const latest = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      const trend2 = latest >= prev ? '#16a34a' : '#ef4444';
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      <polyline points="${points}" fill="none" stroke="${trend2}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <circle cx="${pad + ((vals.length - 1) / (vals.length - 1)) * (w - pad * 2)}" cy="${pad + (1 - (latest - min) / range) * (h - pad * 2)}" r="2" fill="${trend2}"/>
    </svg>`;
    }

    const workoutSessionIdx = {};
    const byDate = {};
    history.forEach(s => {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });
    const dates = Object.keys(byDate).sort().reverse();

    const sessionList = dates.map(date => {
      const sessions = byDate[date];
      const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const sessionCards = sessions.map(s => {
        const durs = getExDurs(s);
        const dur = s.duration_sec ? formatTime(s.duration_sec) : "?";
        const color = WORKOUT_COLORS[s.workout_name] || "#6b7280";
        const byEx = {};
        let totalVol = 0;
        let totalReps = 0;
        s.sets.forEach(st => {
          if (!byEx[st.exercise]) byEx[st.exercise] = [];
          byEx[st.exercise].push(st);
          if (st.set_type === "working") {
            const r = parseInt(st.reps) || 0;
            const w = st.weight_lb || 0;
            totalReps += r;
            totalVol += w * r;
          }
        });
        const workingSetCount = s.sets.filter(st => st.set_type === "working").length;

        if (!workoutSessionIdx[s.workout_name]) workoutSessionIdx[s.workout_name] = (workoutVolTrend[s.workout_name] || []).length;
        workoutSessionIdx[s.workout_name]--;
        const sparkIdx = workoutSessionIdx[s.workout_name];
        const volSparkHTML = historySparkline(s.workout_name, sparkIdx);

        const supersetGroups = {};
        const supersetNames = {};
        WORKOUTS.forEach(w => {
          w.exercises.forEach(ex => {
            if (ex.supersetExercises) {
              ex.supersetExercises.forEach(sub => {
                supersetGroups[sub.name] = ex.name;
                if (!supersetNames[ex.name]) supersetNames[ex.name] = [];
                if (!supersetNames[ex.name].includes(sub.name)) supersetNames[ex.name].push(sub.name);
              });
            }
          });
        });

        const exEntries = [];
        const seen = new Set();
        Object.entries(byEx).forEach(([ex, sets]) => {
          if (seen.has(ex)) return;
          const groupName = supersetGroups[ex];
          if (groupName && !seen.has(groupName)) {
            seen.add(groupName);
            const subNames = supersetNames[groupName] || [];
            subNames.forEach(n => seen.add(n));
            const allSets = subNames.flatMap(n => (byEx[n] || []).filter(st => st.set_type === "working"));
            if (allSets.length > 0) {
              const totalSupersetDur = subNames.reduce((acc, n) => acc + (durs[n] || 0), 0);
              const supersetDurTag = totalSupersetDur > 0 ? `<span style="font-size:9px;background:#f3e8ff;color:#7c3aed;padding:1px 5px;border-radius:9999px;font-weight:500;margin-left:auto">${Math.round(totalSupersetDur/60)} min</span>` : '';
              const subSummaries = subNames.map(n => {
                const ws = (byEx[n] || []).filter(st => st.set_type === "working");
                const reps = ws.map(st => parseInt(st.reps) || 0).filter(r => r > 0).join('·');
                const maxW = Math.max(0, ...ws.map(st => st.weight_lb || 0));
                const subDur = durs[n] ? ` (${Math.round(durs[n]/60)}m)` : '';
                return `<span style="font-size:10px;color:#6b7280;font-family:monospace">${n.split(' ').pop()}${subDur}: ${reps}${maxW > 0 ? ` @ ${maxW}lb` : ''}</span>`;
              }).join('<br>');
              exEntries.push(`<div style="padding:3px 0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                <span style="font-size:12px;color:#7c3aed;font-weight:500">${groupName}</span>
                <span style="font-size:9px;background:#f3e8ff;color:#7c3aed;padding:1px 5px;border-radius:9999px;font-weight:500">Superset</span>
                ${supersetDurTag}
              </div>
              <div style="padding-left:8px">${subSummaries}</div>
            </div>`);
            }
          } else if (!groupName) {
            seen.add(ex);
            const workingSets = sets.filter(st => st.set_type === "working");
            if (workingSets.length === 0) return;
            const maxWeight = Math.max(...workingSets.map(st => st.weight_lb || 0));
            const repsList = workingSets.map(st => parseInt(st.reps) || 0).filter(r => r > 0);
            const weightStr = maxWeight > 0 ? `@ ${maxWeight}lb` : "";
            const repsDisplay = repsList.join('·');
            let assistTag = '';
            if (assistExerciseNames.has(ex)) {
              const amts = workingSets.map(st => {
                if (!st.bands_json) return 0;
                try {
                  const b = JSON.parse(st.bands_json);
                  return Array.isArray(b) ? b.reduce((a, x) => a + (+x || 0), 0) : 0;
                } catch (e) { return 0; }
              }).filter(a => a > 0);
              if (amts.length) {
                const minA = Math.min(...amts), maxA = Math.max(...amts);
                const range = minA === maxA ? `${minA}` : `${minA}–${maxA}`;
                assistTag = ` <span style="color:#0891b2">· ${range}lb assist</span>`;
              }
            }
            const durTag = durs[ex] ? ` <span style="color:#9ca3af;font-size:10px;font-family:monospace">(${Math.round(durs[ex]/60)}m)</span>` : '';
            exEntries.push(`<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0">
            <span style="font-size:12px;color:#374151">${ex}${durTag}</span>
            <span style="font-size:11px;color:#6b7280;font-family:monospace">${repsDisplay} ${weightStr}${assistTag}</span>
          </div>`);
          }
        });
        const exSummary = exEntries.join("");

        const volByMuscle = {};
        s.sets.forEach(st => {
          if (st.set_type !== 'working') return;
          const r = parseInt(st.reps) || 0;
          const wt = st.weight_lb || 0;
          if (r <= 0 || wt <= 0) return;
          const m = EXERCISE_MUSCLES[st.exercise];
          if (!m) return;
          const setVol = wt * r;
          (m.primary || []).forEach(mu => { volByMuscle[mu] = (volByMuscle[mu] || 0) + setVol * getMuscleImpact(st.exercise, mu, true); });
          (m.secondary || []).forEach(mu => { volByMuscle[mu] = (volByMuscle[mu] || 0) + setVol * getMuscleImpact(st.exercise, mu, false); });
        });
        const topMuscles = Object.entries(volByMuscle).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxMuscleVol = topMuscles.length ? topMuscles[0][1] : 0;
        const muscleHTML = topMuscles.length ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb">
          <div style="font-size:9px;font-weight:600;color:#9ca3af;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Muscle load</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${topMuscles.map(([m, v]) => {
              const info = MUSCLE_GROUPS[m];
              const pct = v / maxMuscleVol;
              const c = (typeof _volColor === 'function') ? _volColor(pct) : { bg: '#f3f4f6', fg: '#6b7280' };
              const volLabel = v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v);
              return `<span style="display:inline-flex;align-items:center;gap:4px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg};font-size:10px;font-weight:500;padding:1px 6px;border-radius:9999px">${info?.label || m}<span style="opacity:0.6;font-family:monospace;font-size:9px">${volLabel}</span></span>`;
            }).join('')}
          </div>
        </div>` : '';

        const volStr = totalVol >= 1000 ? (totalVol / 1000).toFixed(1) + 'k' : totalVol;

        // Deload sessions (1×1 @ 80%) neither earn nor get blamed for PR deltas.
        const prevSession = history.find((ps, pi) => pi > history.indexOf(s) && ps.workout_name === s.workout_name && !ps.is_deload);
        let highlightHTML = '';
        if (prevSession && !s.is_deload) {
          function exStats(sets) {
            const m = {};
            sets.forEach(st => {
              if (st.set_type !== 'working') return;
              const isAssist = st.exercise === "Pull-Ups" || st.exercise === "Dips" || st.exercise === "Dead Hang + Scap Pulls" || st.exercise === "Hanging Knee Raise";
              if (!m[st.exercise]) m[st.exercise] = { vol: 0, reps: 0, maxW: isAssist ? -Infinity : 0, best1RM: -Infinity };
              const r = parseInt(st.reps) || 0;
              const w = st.weight_lb || 0;
              let bandSum = 0;
              if (isAssist && st.bands_json) {
                try {
                  const b = JSON.parse(st.bands_json);
                  if (Array.isArray(b)) bandSum = b.reduce((a, x) => a + (+x || 0), 0);
                } catch(e){}
              }
              m[st.exercise].vol += w * r;
              m[st.exercise].reps += r;
              const displayW = isAssist ? -bandSum : w;
              m[st.exercise].maxW = Math.max(m[st.exercise].maxW, displayW);
              if (w > 0 && r > 0) m[st.exercise].best1RM = Math.max(m[st.exercise].best1RM, calcSet1RM(st.exercise, w, r, st.bands_json, st.grip));
            });
            return m;
          }
          const prevByEx = exStats(prevSession.sets);
          const curByEx = exStats(s.sets);
          const prs = [];
          Object.entries(curByEx).forEach(([ex, cur]) => {
            const prev = prevByEx[ex];
            if (!prev) return;
            const shortName = ex.split(' ').pop();
            const isAssist = ex === "Pull-Ups" || ex === "Dips" || ex === "Dead Hang + Scap Pulls" || ex === "Hanging Knee Raise";
            const hasPrev = isAssist ? prev.best1RM > -Infinity : prev.best1RM > 0;
            if (cur.best1RM > prev.best1RM && hasPrev) {
              const diff = Math.round(cur.best1RM - prev.best1RM);
              if (diff > 0) { prs.push(`💪 ${shortName}: +${diff}lb e1RM`); return; }
            }
            if (cur.maxW > prev.maxW) {
              prs.push(`🏆 ${shortName}: +${cur.maxW - prev.maxW}lb weight`);
            } else if (cur.vol > prev.vol && prev.vol > 0) {
              const pct = Math.round((cur.vol - prev.vol) / prev.vol * 100);
              if (pct >= 5) prs.push(`📈 ${shortName}: +${pct}% vol`);
            } else if (cur.reps > prev.reps) {
              prs.push(`🔥 ${shortName}: +${cur.reps - prev.reps} reps`);
            }
          });
          if (prs.length > 0) {
            highlightHTML = `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #d9f99d">
            <div style="display:flex;flex-wrap:wrap;gap:4px 10px">
              ${prs.map(p => `<span style="font-size:10px;color:#65a30d;font-weight:500">${p}</span>`).join('')}
            </div>
          </div>`;
          }
        }

        return `<div style="background:white;border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:600;color:#111827">${s.workout_name}</span>
            ${s.is_deload ? '<span style="font-size:9px;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;padding:1px 5px;border-radius:9999px;font-weight:700;font-family:ui-monospace,Menlo,monospace">DELOAD</span>' : ''}
            ${volSparkHTML}
          </div>
          <span style="font-size:11px;color:#9ca3af;font-family:monospace">${dur}</span>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:8px">
          <span style="font-size:11px;color:#6b7280"><strong style="color:#374151">${workingSetCount}</strong> sets</span>
          <span style="font-size:11px;color:#6b7280"><strong style="color:#374151">${totalReps}</strong> reps</span>
          ${totalVol > 0 ? `<span style="font-size:11px;color:#6b7280"><strong style="color:#374151">${volStr}</strong>lb vol</span>` : ''}
        </div>
        ${exSummary}
        ${muscleHTML}
        ${highlightHTML}
      </div>`;
      }).join("");

      return `<div style="margin-bottom:16px">
      <p style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">${dateLabel}</p>
      ${sessionCards}
    </div>`;
    }).join("");

    return sessionList || '<p style="color:#9ca3af;text-align:center;padding:32px 0">No sessions logged yet.</p>';
  }

  // ─── file: workout-ui-measurements.js ───
  // UI rendering logic for the Measurements tab of Workout Tracker

  const MEASUREMENT_METRICS = [
    { id: 'chest_cm',    label: 'Chest',     group: 'core',     direction: 'up',    color: '#ef4444' },
    { id: 'shoulder_cm', label: 'Shoulder',  group: 'core',     direction: 'up',    color: '#f59e0b' },
    { id: 'waist_cm',    label: 'Waist',     group: 'core',     direction: 'down',  color: '#3b82f6' },
    { id: 'hip_cm',      label: 'Hip',       group: 'core',     direction: 'flat',  color: '#8b5cf6' },
    { id: 'neck_cm',     label: 'Neck',      group: 'core',     direction: 'up',    color: '#0891b2' },
    { id: 'l_arm_cm',    label: 'L Arm',     group: 'limbs',    direction: 'up',    color: '#dc2626' },
    { id: 'r_arm_cm',    label: 'R Arm',     group: 'limbs',    direction: 'up',    color: '#dc2626' },
    { id: 'l_thigh_cm',  label: 'L Thigh',   group: 'limbs',    direction: 'up',    color: '#7c3aed' },
    { id: 'r_thigh_cm',  label: 'R Thigh',   group: 'limbs',    direction: 'up',    color: '#7c3aed' },
    { id: 'l_calf_cm',   label: 'L Calf',    group: 'limbs',    direction: 'up',    color: '#15803d' },
    { id: 'r_calf_cm',   label: 'R Calf',    group: 'limbs',    direction: 'up',    color: '#15803d' },
    { id: 'head_cm',     label: 'Head',      group: 'misc',     direction: 'flat',  color: '#9ca3af' },
    { id: 'weight_kg',   label: 'Weight',    group: 'misc',     direction: 'flat',  color: '#1f2937', unit: 'kg' },
  ];

  function _measurementPairedSparkline(leftVals, rightVals, color, direction) {
    const all = [...leftVals, ...rightVals].filter(v => v != null);
    if (all.length === 0) return '';
    const w = 130, h = 38, pad = 3;
    const max = Math.max(...all), min = Math.min(...all), range = max - min || 1;
    function poly(vals) {
      if (!vals.length) return '';
      return vals.map((v, i) =>
        `${pad + (i / Math.max(1, vals.length - 1)) * (w - pad * 2)},${pad + (1 - (v - min) / range) * (h - pad * 2)}`
      ).join(' ');
    }
    const lPts = poly(leftVals);
    const rPts = poly(rightVals);
    const lastIdx = (vals) => vals.length - 1;
    const cx = (vals) => pad + (lastIdx(vals) / Math.max(1, vals.length - 1)) * (w - pad * 2);
    const cy = (v) => pad + (1 - (v - min) / range) * (h - pad * 2);
    const lLast = leftVals.length ? leftVals[leftVals.length - 1] : null;
    const rLast = rightVals.length ? rightVals[rightVals.length - 1] : null;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
    ${lPts ? `<polyline points="${lPts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2" opacity="0.55"/>` : ''}
    ${rPts ? `<polyline points="${rPts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>` : ''}
    ${lLast != null ? `<circle cx="${cx(leftVals)}" cy="${cy(lLast)}" r="2.2" fill="white" stroke="${color}" stroke-width="1.4" stroke-dasharray="2,1" opacity="0.85"/>` : ''}
    ${rLast != null ? `<circle cx="${cx(rightVals)}" cy="${cy(rLast)}" r="2.5" fill="${color}"/>` : ''}
  </svg>`;
  }

  function _measurementSparkline(values, color, direction) {
    if (!values.length) return '';
    if (values.length < 2) {
      return `<div style="display:flex;align-items:center;justify-content:center;height:32px;font-size:10px;color:#9ca3af">single reading</div>`;
    }
    const w = 110, h = 36, pad = 3;
    const max = Math.max(...values), min = Math.min(...values), range = max - min || 1;
    const pts = values.map((v, i) =>
      `${pad + (i / (values.length - 1)) * (w - pad * 2)},${pad + (1 - (v - min) / range) * (h - pad * 2)}`
    ).join(' ');
    const first = values[0], last = values[values.length - 1];
    let trendColor = color;
    if (direction === 'up' && last < first) trendColor = '#dc2626';
    else if (direction === 'down' && last > first) trendColor = '#dc2626';
    else if (direction === 'flat') trendColor = '#6b7280';
    else if ((direction === 'up' && last > first) || (direction === 'down' && last < first)) trendColor = '#16a34a';
    const lastX = pad + ((values.length - 1) / (values.length - 1)) * (w - pad * 2);
    const lastY = pad + (1 - (last - min) / range) * (h - pad * 2);
    // width:100% so the sparkline shrinks to fit narrow (mobile) cells instead of
    // forcing its intrinsic 110px and overflowing the card.
    return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%">
    <polyline points="${pts}" fill="none" stroke="${trendColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${trendColor}"/>
  </svg>`;
  }

  function _formatMeasurementDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function _measurementDelta(latest, prev, direction) {
    if (latest == null || prev == null) return null;
    const d = +(latest - prev).toFixed(1);
    if (Math.abs(d) < 0.05) return { d: 0, color: '#9ca3af', sign: '·' };
    let color = '#9ca3af';
    if (direction === 'up')   color = d > 0 ? '#16a34a' : '#dc2626';
    if (direction === 'down') color = d > 0 ? '#dc2626' : '#16a34a';
    if (direction === 'flat') color = '#6b7280';
    return { d, color, sign: d > 0 ? '+' : '' };
  }

  // Self-contained measurements block: latest-snapshot graphs (sparkline + value
  // + delta per metric, grouped Core/Limbs/Other), a collapsible history list and
  // a collapsible add-entry form. Rendered inline on the home screen — no page
  // wrapper, no back button. Reads everything from state.measurements.
  function renderMeasurementsSection() {
    return renderMeasurementsCard();
  }

  // Standalone #measurements route — kept working as a deep-link fallback even
  // though the home screen now surfaces measurements inline. Wraps the shared
  // section with a back-to-home header.
  function renderMeasurements() {
    const back = `
    <div style="position:sticky;top:0;background:white;border-bottom:1px solid #f3f4f6;padding:12px 16px;z-index:10;display:flex;align-items:center;gap:12px">
      <button onclick="state.screen='home';history.replaceState(null,'','#');render()" style="color:#2563eb;font-size:14px;font-weight:500;background:none;border:none;cursor:pointer">← Back</button>
      <h2 style="font-size:18px;font-weight:700;margin:0">Measurements</h2>
    </div>`;
    return `
    <div style="max-width: 448px; margin: 0 auto; min-height: 100vh; background: #f9fafb; position: relative;">
      ${back}
      <div style="padding:16px">${renderMeasurementsSection()}</div>
    </div>
  `;
  }

  function _renderMeasurementForm() {
    const inputs = MEASUREMENT_METRICS.map(m => `
    <label style="display:flex;flex-direction:column;gap:2px">
      <span style="font-size:10px;color:#6b7280;font-weight:600">${m.label} (${m.unit || 'cm'})</span>
      <input type="number" step="0.1" id="meas-${m.id}" placeholder="—" style="font-size:13px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-family:monospace;width:100%">
    </label>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    return `
    <div class="card" style="padding:14px 16px">
      <h3 style="font-size:13px;font-weight:600;color:#111827;margin:0 0 8px">Add measurement</h3>
      <label style="display:flex;flex-direction:column;gap:2px;margin-bottom:8px">
        <span style="font-size:10px;color:#6b7280;font-weight:600">Date</span>
        <input type="date" id="meas-date" value="${today}" style="font-size:13px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-family:monospace">
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">${inputs}</div>
      <button onclick="submitMeasurement()" style="width:100%;background:#2563eb;color:white;border:none;padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Save measurement</button>
    </div>`;
  }

  // Refetch measurements and re-render whatever screen is active (home or the
  // standalone page) — so add/delete works inline on home without navigating.
  async function reloadMeasurements() {
    try {
      state.measurements = await api.measurements();
    } catch (e) {
      console.warn('[MEASUREMENTS] reload failed:', e);
    }
    render();
  }

  async function submitMeasurement() {
    const dateEl = document.getElementById('meas-date');
    const date = dateEl?.value || new Date().toISOString().slice(0, 10);
    // Anchor the entry to the chosen date at the current local time-of-day,
    // then convert to real UTC (the old code stamped local time with a "Z").
    const localDT = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`);
    const taken_at = (isNaN(localDT.getTime()) ? new Date() : localDT).toISOString();
    const payload = { taken_at, date };
    let any = false;
    for (const m of MEASUREMENT_METRICS) {
      const el = document.getElementById(`meas-${m.id}`);
      const v = parseFloat(el?.value);
      if (!isNaN(v) && v > 0) {
        payload[m.id] = v;
        any = true;
      }
    }
    if (!any) {
      alert('Enter at least one measurement.');
      return;
    }
    try {
      const res = await api.saveMeasurement(payload);
      if (!res || !res.ok) throw new Error('save failed');
      state.showMeasForm = false;
      await reloadMeasurements();
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  async function deleteMeasurement(id) {
    if (!confirm('Delete this measurement?')) return;
    try {
      await api.deleteMeasurement(id);
      await reloadMeasurements();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  }

  // ─── file: workout-ui-persistence.js ───
  // Home-page data loading for Workout Tracker. (The classic in-page logging
  // view and its auto-save were removed — live sessions run on
  // workout-session.html, which persists through workout-session-persistence.js.)

  async function loadHomeData() {
    try {
      const [histRes, activeRes, measRes, settingsRes, hintsRes] = await Promise.all([
        api.history(100),
        api.activeSessions(),
        api.measurements(),
        api.settings(),
        api.hints()
      ]);
      state.history = histRes;
      // Old sessions keep their pre-rename workout_name in the DB; normalize so
      // grouping, rotation, and per-workout trends treat them as the same workout.
      if (Array.isArray(state.history)) state.history.forEach(s => {
        if (LEGACY_WORKOUT_NAMES[s.workout_name]) s.workout_name = LEGACY_WORKOUT_NAMES[s.workout_name];
      });
      try {
        window.USER_SETTINGS = settingsRes;
        if (window.USER_SETTINGS && window.USER_SETTINGS.bodyweight) {
          state.bodyweight = parseInt(window.USER_SETTINGS.bodyweight) || 175;
        }
      } catch (_) {}
      // Last-known weight/reps per exercise, shown on the workout cards.
      try { state.lastSession = hintsRes || {}; }
      catch (_) { state.lastSession = {}; }
      state._activeSessions = activeRes;
      if (state._activeSessions && window.setSessionStateCache) {
        state._activeSessions.forEach(sess => {
          if (sess.state_json) {
            try {
              window.setSessionStateCache(sess.workout_name, sess.date, JSON.parse(sess.state_json));
            } catch (e) {
              console.error("[HOME] failed to parse active session state_json:", e);
            }
          }
        });
      }
      try { state.measurements = measRes; }
      catch (e) { state.measurements = []; }
      state.loaded = true;
      render();
    } catch (e) {
      console.error("[HOME] Error:", e);
      // Fall back to the default render rather than shimmering forever.
      state.loaded = true;
      render();
    }
  }

  // ─── file: workout-ui-utils.js ───
  // UI Utilities for Workout Tracker (home page)

  async function showMeasurements() {
    state.screen = "measurements";
    history.replaceState(null, '', '#measurements');
    render();
    if (!state.measurements) {
      try {
        state.measurements = await api.measurements();
      } catch (e) {
        console.warn('[MEASUREMENTS] load failed:', e);
        state.measurements = [];
      }
      render();
    }
  }

  function scrollToSelected() {
    document.querySelectorAll('.scroll-row').forEach(row => {
      const target = row.querySelector('[data-scroll-target]');
      if (!target || row.scrollWidth <= row.clientWidth) return;
      const rowRect = row.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenterInRow = (targetRect.left - rowRect.left) + row.scrollLeft + targetRect.width / 2;
      row.scrollLeft = Math.max(0, targetCenterInRow - rowRect.width / 2);
    });
  }

  // ─── file: workout-ui-shell.js ───
  // All trackable muscle groups with display info
  const MUSCLE_GROUPS = {
    shoulders:  { label: "Shoulders",   side: "front" },
    chest:      { label: "Chest",       side: "front" },
    biceps:     { label: "Biceps",      side: "front" },
    triceps:    { label: "Triceps",     side: "back"  },
    forearms:   { label: "Forearms",    side: "front" },
    core:       { label: "Core",        side: "front" },
    quads:      { label: "Quads",       side: "front" },
    upper_back: { label: "Upper Back",  side: "back"  },
    lats:       { label: "Lats",        side: "back"  },
    rear_delts: { label: "Rear Delts",  side: "back"  },
    lower_back: { label: "Lower Back",  side: "back"  },
    glutes:     { label: "Glutes",      side: "back"  },
    hamstrings: { label: "Hamstrings",  side: "back"  },
    calves:     { label: "Calves",      side: "back"  },
  };

  // State
  let state = {
    screen: "home", // home | measurements
    loaded: false, // true once loadHomeData resolves; home shows shimmers until then
    history: [],
    lastSession: {},
    bodyweight: 175,
  };
  function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }

  function startWorkout(w) {
    window.location.assign('/session?w=' + encodeURIComponent(w.id));
  }

  // Render
  function render() {
    const app = document.getElementById("app");
    if (state.screen === "home") app.innerHTML = renderHome();
    else if (state.screen === "measurements") app.innerHTML = renderMeasurements();
    requestAnimationFrame(scrollToSelected);
  }

  // Initial render — check URL hash for deep link
  const initHash = location.hash.replace('#', '');
  const initWorkout = initHash ? WORKOUTS.find(w => w.id === initHash) : null;
  if (initWorkout) {
    startWorkout(initWorkout);
  } else {
    render();
    loadHomeData();
  }

  // ─── window attachments ───
  // In the old page every top-level `function` declaration of a classic
  // <script> landed on window automatically, which the inline on* handlers in
  // the generated HTML rely on. Inside this module scope that no longer
  // happens, so attach them explicitly. `state`, `MUSCLE_GROUPS` and
  // `setSessionStateCache` are included because inline handlers mutate
  // `state.*`, renderWorkoutMuscleMap reads `window.MUSCLE_GROUPS`, and
  // loadHomeData reads `window.setSessionStateCache`.
  Object.assign(window, {
    // workout-ui-home-sparklines.js
    sparkTip,
    microSparkline,
    _renderSparklineGridLines,
    renderMeasurementSparkline,
    renderPairedMeasurementSparkline,
    // workout-ui-home-calendar.js
    renderCalendar,
    // workout-ui-home-summary.js
    renderWorkoutSummaryCard,
    // workout-ui-home-measurements-card.js
    renderMeasurementsCard,
    // workout-ui-home.js
    renderWorkoutMuscleMap,
    renderWorkoutCard,
    renderHomeSkeleton,
    renderHome,
    // workout-ui-history.js
    getExDurs,
    renderSessionList,
    // workout-ui-measurements.js
    _measurementPairedSparkline,
    _measurementSparkline,
    _formatMeasurementDate,
    _measurementDelta,
    renderMeasurementsSection,
    renderMeasurements,
    _renderMeasurementForm,
    reloadMeasurements,
    submitMeasurement,
    deleteMeasurement,
    // workout-ui-persistence.js
    loadHomeData,
    // workout-ui-utils.js
    showMeasurements,
    scrollToSelected,
    // workout-ui-shell.js
    formatTime,
    startWorkout,
    render,
    MUSCLE_GROUPS,
    state,
    // formerly a global from workout-session-persistence.js (classic script)
    setSessionStateCache,
  });
}

export default function HomeApp() {
  const rootRef = useRef(null);

  useEffect(() => {
    initHomeApp();
  }, []);

  return <div id="app" ref={rootRef} />;
}
