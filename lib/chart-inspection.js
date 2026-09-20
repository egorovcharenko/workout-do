const escapeAttribute = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Values and x positions come from the same points used to draw the chart. */
export function chartInspectionAttributes(points, note = '') {
  if (!points.length) return '';
  return `data-chart-points="${escapeAttribute(JSON.stringify({ points, note }))}" tabindex="0" role="slider" aria-roledescription="interactive chart" aria-valuemin="0" aria-valuemax="${points.length - 1}" aria-valuenow="${points.length - 1}" aria-valuetext="${escapeAttribute(chartPointText(points.at(-1)))}"`;
}

export function nearestChartPoint(points, percent) {
  return points.reduce((best, point, index) => Math.abs(point.x - percent) <= Math.abs(points[best].x - percent) ? index : best, 0);
}

export function chartPointText(point) {
  return `${point.date}: ${point.values.map(item => `${item.label} ${item.value} ${item.unit}`).join('; ')}`;
}

/** Delegation covers both React recaps and the legacy home HTML after rerenders. */
export function attachChartTooltips(doc) {
  const win = doc.defaultView;
  const cache = new WeakMap();
  let active = null, selected = 0;
  const tooltip = doc.createElement('div');
  tooltip.id = 'workout-chart-tooltip';
  tooltip.className = 'workout-chart-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  doc.body.append(tooltip);
  const chartFor = target => target?.closest?.('[data-chart-points]');
  const dataFor = chart => {
    if (!cache.has(chart)) cache.set(chart, JSON.parse(chart.dataset.chartPoints));
    return cache.get(chart);
  };
  const hide = () => {
    active?.classList.remove('chart-inspecting');
    active?.removeAttribute('aria-describedby');
    active = null;
    tooltip.hidden = true;
  };
  const show = (chart, index) => {
    if (active !== chart) hide();
    const data = dataFor(chart);
    selected = Math.max(0, Math.min(data.points.length - 1, index));
    const point = data.points[selected];
    active = chart;
    chart.classList.add('chart-inspecting');
    chart.style.setProperty('--chart-point-x', `${point.x}%`);
    chart.setAttribute('aria-valuenow', String(selected));
    chart.setAttribute('aria-valuetext', chartPointText(point));
    chart.setAttribute('aria-describedby', tooltip.id);
    tooltip.replaceChildren();
    const date = doc.createElement('strong');
    date.className = 'chart-tooltip-date';
    date.textContent = new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    tooltip.append(date);
    for (const item of point.values) {
      const row = doc.createElement('div');
      row.className = `chart-tooltip-value ${item.kind === 'weight' ? 'chart-tooltip-weight' : item.kind === 'measurement' ? 'chart-tooltip-measurement' : ''}`;
      const label = doc.createElement('span');
      label.textContent = item.label;
      const value = doc.createElement('strong');
      value.textContent = `${item.value} ${item.unit}`;
      row.append(label, value);
      tooltip.append(row);
    }
    if (data.note) {
      const note = doc.createElement('small');
      note.textContent = data.note;
      tooltip.append(note);
    }
    tooltip.hidden = false;
    const rect = chart.getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const x = rect.left + rect.width * point.x / 100;
    tooltip.style.left = `${Math.max(8, Math.min(win.innerWidth - width - 8, x - width / 2))}px`;
    const above = rect.top - height - 8;
    tooltip.style.top = `${Math.max(8, Math.min(win.innerHeight - height - 8, above >= 8 ? above : rect.bottom + 8))}px`;
  };
  const pointer = event => {
    const chart = chartFor(event.target);
    if (!chart) { hide(); return; }
    const rect = chart.getBoundingClientRect();
    const index = nearestChartPoint(dataFor(chart).points, (event.clientX - rect.left) / rect.width * 100);
    show(chart, index);
  };
  const leave = event => {
    if (event.pointerType !== 'touch' && active && chartFor(event.relatedTarget) !== active) hide();
  };
  const focus = event => {
    const chart = chartFor(event.target);
    if (chart) show(chart, Number(chart.getAttribute('aria-valuenow')));
  };
  const key = event => {
    if (event.key === 'Escape') { hide(); return; }
    const chart = chartFor(event.target);
    if (!chart || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = Number(chart.getAttribute('aria-valuenow'));
    show(chart, event.key === 'Home' ? 0 : event.key === 'End' ? dataFor(chart).points.length - 1 : index + (event.key === 'ArrowLeft' ? -1 : 1));
  };
  const events = { pointermove: pointer, pointerdown: pointer, pointerout: leave, pointercancel: hide,
    focusin: focus, focusout: hide, keydown: key, scroll: hide, visibilitychange: hide };
  for (const [type, handler] of Object.entries(events)) doc.addEventListener(type, handler, true);
  win.addEventListener('resize', hide);
  const observer = new win.MutationObserver(() => { if (active && !active.isConnected) hide(); });
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    hide();
    observer.disconnect();
    for (const [type, handler] of Object.entries(events)) doc.removeEventListener(type, handler, true);
    win.removeEventListener('resize', hide);
    tooltip.remove();
  };
}
