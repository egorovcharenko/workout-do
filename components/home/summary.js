// ─── file: workout-ui-home-summary.js ───

import {
  EXERCISE_MUSCLES,
  getMuscleImpact,
  calcSet1RM,
  isAssistExercise,
  isRepsOnlyExercise,
} from "@/lib/legacy/standards";
import { state } from "./state";
import { MUSCLE_GROUPS } from "./shell";
import { latestSessionDeltaPercent, trainingPoints } from "@/lib/deload-progress";

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

  const _assist = isAssistExercise;
  const _repsOnly = isRepsOnlyExercise;

  const exerciseSummary = {};
  (latest.sets || []).forEach(set => {
    if (set.set_type !== 'working' || !set.reps) return;
    const ex = set.exercise;
    const r = parseInt(set.reps) || 0;
    const w = parseFloat(set.weight_lb) || 0;
    // Reps-only rows carry no tonnage (older ones saved bodyweight in weight_lb).
    const vol = _repsOnly(ex) ? 0 : r * w;
    addMus(ex, vol);

    if (!exerciseSummary[ex]) {
      exerciseSummary[ex] = { bestW: 0, bestR: 0, best1RM: 0, totalVol: 0, setsCount: 0, historyWeights: [] };
    }
    const sum = exerciseSummary[ex];
    sum.totalVol += vol;
    sum.setsCount++;
    const est = calcSet1RM(ex, w, r, set.bands_json, set.grip);
    const isAssist = _assist(ex);
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
      if (set.set_type === 'working' && set.reps && !_repsOnly(set.exercise)) {
        vol += (parseInt(set.reps) || 0) * (parseFloat(set.weight_lb) || 0);
      }
    });
    if (vol > maxSessionVol) maxSessionVol = vol;
    return { date: s.date, volume: vol, isDeload: !!s.is_deload };
  });

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
      if (has) perSession.push({ date: s.date, value: best, w: bw, r: br, isDeload: !!s.is_deload });
    });
    perSession.reverse();
    const latestPoint = perSession[perSession.length - 1];
    const today1RM = latestPoint ? latestPoint.value : sum.best1RM;
    const latestIsDeload = !!latestPoint?.isDeload;
    const normalPoints = trainingPoints(perSession);
    const priors = latestIsDeload ? normalPoints : normalPoints.slice(0, -1);
    const priorMax = priors.length ? Math.max(...priors.map(p => p.value)) : (_assist(exName) ? -Infinity : 0);
    const prevBest = priors.length ? priors.reduce((m, p) => p.value > m.value ? p : m, priors[0]) : null;
    const isAssist = _assist(exName);
    const isPR = !latestIsDeload && today1RM > priorMax && (isAssist ? today1RM > -Infinity : today1RM > 0);
    const deltaPct = latestSessionDeltaPercent(perSession);
    return { exName, sum, isPR, deltaPct, prevBest, sparkPts: perSession.slice(-6), latestIsDeload };
  });

  const totalSets = exList.reduce((n, e) => n + e.sum.setsCount, 0);
  const numLifts = exList.length;
  const upCount = exList.filter(e => e.deltaPct != null && e.deltaPct > 0).length;
  const downCount = exList.filter(e => e.deltaPct != null && e.deltaPct < 0).length;
  const normalVolumes = trainingPoints(historyData);
  const latestVol = normalVolumes.length ? normalVolumes[normalVolumes.length - 1].volume : 0;
  const prevVol = normalVolumes.length > 1 ? normalVolumes[normalVolumes.length - 2].volume : 0;
  const netTrend = latest.is_deload ? null : prevVol > 0 ? Math.round(((latestVol - prevVol) / prevVol) * 100) : null;

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
    const poly = xy.filter((_, i) => !data[i].isDeload).map(c => `${c.x},${c.y}`).join(' ');
    const dots = xy.map((c, i) => {
      const unit = _repsOnly(exName) ? 'reps' : 'lb est 1RM';
      const tip = `${mmdd(data[i].date)} · ${Math.round(data[i].value)} ${unit}${data[i].isDeload ? ' · DELOAD' : ''}`.replace(/'/g, "\\'");
      const isLast = i === xy.length - 1;
      const dot = data[i].isDeload
        ? `<circle cx="${c.x}" cy="${c.y}" r="2" fill="#0B0F14" stroke="#FBBF24" stroke-width="1" opacity="0.8"/>`
        : `<circle cx="${c.x}" cy="${c.y}" r="${isLast ? 2 : 1.5}" fill="#a78bfa"/>`;
      return dot
        + `<circle cx="${c.x}" cy="${c.y}" r="7" fill="transparent" style="cursor:pointer"`
        + ` onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`;
    }).join('');
    let goalLine = '';
    if (hasGoal) {
      const goalY = pad + (1 - (goalVal - mn) / rng) * (h - pad * 2);
      goalLine = `<line x1="${pad}" y1="${goalY}" x2="${w - pad}" y2="${goalY}" stroke="rgba(239, 68, 68, 0.45)" stroke-width="0.8" stroke-dasharray="1.5,1.5" />`;
    }
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0;overflow:visible">${goalLine}${trainingPoints(data).length > 1 ? `<polyline points="${poly}" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}${dots}</svg>`;
  };

  const bars = historyData.map(h => {
    const pct = maxSessionVol ? (h.volume / maxSessionVol) * 100 : 0;
    const isLatest = h.date === latest.date;
    const dl = mmdd(h.date);
    const vStr = h.volume >= 1000 ? `${(h.volume / 1000).toFixed(1)}k` : Math.round(h.volume);
    const tip = `${dl} · ${Math.round(h.volume).toLocaleString()} lb volume${h.isDeload ? ' · DELOAD' : ''}`;
    return `<div title="${tip}" style="flex:1;display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <span style="font-size:9px;font-family:${MONO};color:${h.isDeload ? '#FBBF24' : isLatest ? '#a78bfa' : '#9CA3AF'};margin-bottom:4px;font-weight:${isLatest ? '800' : '500'}">${h.isDeload ? 'DL' : vStr}</span>
    <div style="height:44px;width:100%;display:flex;align-items:end;justify-content:center;margin-bottom:4px">
      <div style="width:16px;height:${Math.max(8, pct)}%;background:${h.isDeload ? 'rgba(251,191,36,0.28)' : isLatest ? '#a78bfa' : 'rgba(255,255,255,0.2)'};border:${h.isDeload ? '1px dashed rgba(251,191,36,0.7)' : '0'};border-radius:3px"></div>
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
        ${e.latestIsDeload ? `<span style="min-width:50px;text-align:right;color:#FBBF24;font-family:${MONO};font-size:9px;font-weight:800">DELOAD</span>` : dt ? `<span style="min-width:36px;text-align:right;color:${dc};font-family:${MONO};font-size:12px;font-weight:800">${dt}</span>` : `<span style="width:36px"></span>`}
      </div>
    </div>
    <div style="margin-top:3px;color:#6B7280;font-size:10.5px;font-family:${MONO}">${_repsOnly(e.exName)
      ? `Top <span style="color:#D1D5DB;font-weight:700">${e.sum.bestR} reps</span> · ${e.sum.setsCount} sets`
      : `Top <span style="color:#D1D5DB;font-weight:700">${fmtW(e.sum.bestW)}×${e.sum.bestR}</span> · 1RM ${Math.round(e.sum.best1RM)} · ${e.sum.setsCount} sets`}</div>
  </div>`;
  }).join('');

  return `
  <div data-noinvert style="margin-bottom:12px;overflow:hidden;background:#0B0F14;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px 12px 14px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">
      <div style="min-width:140px;flex:1">
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;letter-spacing:0.08em;color:${latest.is_deload ? '#FBBF24' : '#C4B5FD'};background:${latest.is_deload ? 'rgba(251,191,36,0.12)' : 'rgba(139,92,246,0.16)'};border:1px solid ${latest.is_deload ? 'rgba(251,191,36,0.35)' : 'rgba(139,92,246,0.35)'};padding:4px 10px;border-radius:99px;font-family:${MONO}">${latest.is_deload ? 'DELOAD WEEK' : '✓ DONE'}</span>
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
            VOL TREND: <span style="color:${latest.is_deload ? '#FBBF24' : netColor};font-weight:800">${latest.is_deload ? 'DELOAD · NOT COMPARED' : netTrend == null ? '—' : `${netTrend > 0 ? '+' : ''}${netTrend}%`}</span>
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

export { renderWorkoutSummaryCard };
