import { state } from "./state";
import { renderProgressShareControls } from "./progressShare";
import { renderProgress } from "./progress";
import { MEASUREMENT_METRICS, _formatMeasurementDate, _renderMeasurementForm } from "./measurements";

function renderMeasurementsCard() {
  const measurements = state.measurements || [];
  const formOpen = !!state.showMeasForm;
  const histOpen = !!state.showMeasHistory;

  const historyRows = measurements.map(e => `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid #243040">
    <span style="font-size:13px;color:#6b7280;font-family:monospace;min-width:60px">${_formatMeasurementDate(e.taken_at)}</span>
    <span style="font-size:13px;font-family:monospace;color:#E5E7EB;flex:1;text-align:center">
      ${e.chest_cm != null ? `<span style="color:#F87171">${e.chest_cm.toFixed(1)}c</span>` : '—'} ·
      ${e.waist_cm != null ? `<span style="color:#3b82f6">${e.waist_cm.toFixed(1)}w</span>` : '—'} ·
      ${e.l_arm_cm != null ? `<span style="color:#F87171">${e.l_arm_cm.toFixed(1)}a</span>` : '—'}
    </span>
    <button onclick="deleteMeasurement('${e.id}')" style="font-size:13px;color:#9ca3af;background:none;border:1px solid #293445;border-radius:4px;padding:2px 6px;cursor:pointer">×</button>
  </div>`).join('');

  const actionSectionHTML = `
  <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:12px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <button onclick="state.showMeasHistory=!state.showMeasHistory;render()" style="font-size:13px;font-weight:700;color:#6b7280;background:none;border:1px solid #293445;border-radius:7px;padding:4px 10px;cursor:pointer">
      ${histOpen ? '✕ Close History' : `History · ${measurements.length} entries`}
    </button>
    <button onclick="state.showMeasForm=!state.showMeasForm;render()" style="font-size:13px;font-weight:700;color:${formOpen ? '#6b7280' : '#60A5FA'};background:none;border:1px solid ${formOpen ? '#293445' : '#274972'};border-radius:7px;padding:4px 10px;cursor:pointer">
      ${formOpen ? '✕ Close Form' : '＋ Add Measurement'}
    </button>
  </div>
  ${histOpen ? `<div style="margin-top:10px;max-height:200px;overflow-y:auto;border:1px solid #243040;border-radius:8px;background:#111722">${historyRows}</div>` : ''}
  ${formOpen ? `<div style="margin-top:12px">${_renderMeasurementForm()}</div>` : ''}
`;

  return renderProgress(state.history || [], measurements, {
    activeSessions: state._activeSessions || [],
    bodyweightLb: window.USER_SETTINGS?.bodyweight,
    metrics: MEASUREMENT_METRICS,
    headerControls: `<button class="progress-share-button" onclick="shareProgress()" ${state.progressShareBusy ? 'disabled' : ''}>${state.progressShareBusy ? 'Sharing…' : 'Share'}</button>`,
    controls: `${renderProgressShareControls()}<div class="progress-controls">${actionSectionHTML}</div>`,
  });
}

export { renderMeasurementsCard };
