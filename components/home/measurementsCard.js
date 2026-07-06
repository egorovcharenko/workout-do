// ─── file: workout-ui-home-measurements-card.js ───

import { EXERCISE_MUSCLES, calcSet1RM } from "@/lib/legacy/standards";
import { state } from "./state";
import {
  renderMeasurementSparkline,
  renderPairedMeasurementSparkline,
  MUSCLE_TO_UNIFIED_GROUP,
  METRIC_TO_UNIFIED_GROUP,
  UNIFIED_GROUPS,
} from "./sparklines";
import {
  MEASUREMENT_METRICS,
  _measurementDelta,
  _formatMeasurementDate,
  _renderMeasurementForm,
} from "./measurements";

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

export { renderMeasurementsCard };
