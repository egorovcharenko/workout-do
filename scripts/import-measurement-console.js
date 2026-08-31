// Zero-setup fallback for import-measurement.mjs — no service-account key needed.
// Paste into the DevTools console on https://workouts.egorovcharenko.com while
// signed in. It opens the measurements add-form, fills it, and submits through
// the app's own code path (window.submitMeasurement), so the write happens as
// the signed-in user and satisfies the Firestore rules.
//
// One difference from the .mjs script: submitMeasurement() stamps taken_at with
// the CURRENT local time-of-day on the chosen date, not 22:09. The `date` field
// — which is what the charts and history list key on — is exact either way.
(async () => {
  const VALUES = {
    'meas-date': '2026-08-30',
    'meas-head_cm': 61.1,
    'meas-neck_cm': 37.4,
    'meas-shoulder_cm': 115.7,
    'meas-chest_cm': 97.2,
    'meas-waist_cm': 87.9,
    'meas-hip_cm': 96.3,
    'meas-l_arm_cm': 29.5,
    'meas-r_arm_cm': 30.0,
    'meas-l_thigh_cm': 54.5,
    'meas-r_thigh_cm': 54.6,
    'meas-l_calf_cm': 37.6,
    'meas-r_calf_cm': 37.8,
  };

  state.screen = 'home';
  state.showMeasForm = true;
  render();
  await new Promise((r) => requestAnimationFrame(r));

  const missing = [];
  for (const [id, v] of Object.entries(VALUES)) {
    const el = document.getElementById(id);
    if (!el) { missing.push(id); continue; }
    el.value = String(v);
  }
  if (missing.length) {
    console.error('Form fields not found — is the add-entry form open?', missing);
    return;
  }
  await submitMeasurement();
  console.log('Submitted. Latest entry:', state.measurements?.[0]);
})();
