// ─── file: workout-ui-measurements.js ───
// UI rendering logic for the Measurements tab of Workout Tracker

import { api } from "@/lib/db/api";
import { state } from "./state";
import { renderMeasurementsCard } from "./measurementsCard";
import { render } from "./shell";

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

export {
  MEASUREMENT_METRICS,
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
};
