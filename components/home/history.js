// ─── file: workout-ui-history.js ───
// UI rendering logic for the History tab of Workout Tracker

import { WORKOUTS } from "@/lib/legacy/shared";
import {
  EXERCISE_MUSCLES,
  getMuscleImpact,
  calcSet1RM,
} from "@/lib/legacy/standards";
import { state } from "./state";
import { formatTime, MUSCLE_GROUPS } from "./shell";

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
  const repsOnlyExerciseNames = new Set();
  WORKOUTS.forEach(w => {
    w.exercises.forEach(ex => {
      if (ex.assist) assistExerciseNames.add(ex.name);
      if (ex.repsOnly) repsOnlyExerciseNames.add(ex.name);
      if (ex.supersetExercises) ex.supersetExercises.forEach(s => {
        if (s.assist) assistExerciseNames.add(s.name);
        if (s.repsOnly) repsOnlyExerciseNames.add(s.name);
      });
    });
  });

  const history = state.history || [];
  const workoutVolTrend = {};
  [...history].reverse().forEach(s => {
    let vol = 0;
    s.sets.forEach(st => {
      // Reps-only rows carry no tonnage; older ones saved bodyweight in
      // weight_lb, which would inflate the trend against new zero-weight rows.
      if (st.set_type === 'working' && !repsOnlyExerciseNames.has(st.exercise)) vol += (st.weight_lb || 0) * (parseInt(st.reps) || 0);
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
          const w = repsOnlyExerciseNames.has(st.exercise) ? 0 : (st.weight_lb || 0);
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
              const maxW = repsOnlyExerciseNames.has(n) ? 0 : Math.max(0, ...ws.map(st => st.weight_lb || 0));
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
          const maxWeight = repsOnlyExerciseNames.has(ex) ? 0 : Math.max(...workingSets.map(st => st.weight_lb || 0));
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
        const wt = repsOnlyExerciseNames.has(st.exercise) ? 0 : (st.weight_lb || 0);
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
            const c = (typeof window._volColor === 'function') ? window._volColor(pct) : { bg: '#f3f4f6', fg: '#6b7280' };
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
            const isAssist = st.exercise === "Pull-Ups" || st.exercise === "Dips" || st.exercise === "Dead Hang + Scap Pulls";
            const isRepsOnly = st.exercise === "Hanging Knee Raise";
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
            m[st.exercise].vol += isRepsOnly ? 0 : w * r;
            m[st.exercise].reps += r;
            const displayW = isRepsOnly ? 0 : isAssist ? -bandSum : w;
            m[st.exercise].maxW = Math.max(m[st.exercise].maxW, displayW);
            if ((isRepsOnly || w > 0) && r > 0) m[st.exercise].best1RM = Math.max(m[st.exercise].best1RM, calcSet1RM(st.exercise, w, r, st.bands_json, st.grip));
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
          const isAssist = ex === "Pull-Ups" || ex === "Dips" || ex === "Dead Hang + Scap Pulls";
          const isRepsOnly = ex === "Hanging Knee Raise";
          const hasPrev = isAssist ? prev.best1RM > -Infinity : prev.best1RM > 0;
          if (cur.best1RM > prev.best1RM && hasPrev) {
            const diff = Math.round(cur.best1RM - prev.best1RM);
            if (diff > 0) { prs.push(isRepsOnly ? `💪 ${shortName}: +${diff} reps` : `💪 ${shortName}: +${diff}lb e1RM`); return; }
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

export { getExDurs, renderSessionList };
