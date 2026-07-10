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
    const tip = `${mmdd(pts[0].date)} · ${pts[0].value.toFixed(1)} ${unit}${pts[0].isDeload ? ' · DELOAD' : ''}`.replace(/'/g, "\\'");
    dotsHTML = pts[0].isDeload
      ? `<circle cx="${x}" cy="${y}" r="2.5" fill="white" stroke="#d97706" stroke-width="1.2" opacity="0.8" />`
      : `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}" />`;
    dotsHTML += `<circle cx="${x}" cy="${y}" r="7" fill="transparent" style="cursor:pointer"
       onmouseenter="sparkTip(event,'${tip}')" onmouseleave="sparkTip()" onclick="sparkTip(event,'${tip}',true)"></circle>`;
  } else {
    const trainingPts = pts.filter(p => !p.isDeload);
    if (trainingPts.length > 1) {
      const pathD = trainingPts.map(p => `L ${getX(p.ms)} ${getY(p.value)}`).join(' ').replace(/^L/, 'M');
      pathHTML = `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`;
    }
    dotsHTML = pts.map(p => {
      const x = getX(p.ms);
      const y = getY(p.value);
      const tip = `${mmdd(p.date)} · ${p.value.toFixed(1)} ${unit}${p.isDeload ? ' · DELOAD' : ''}`.replace(/'/g, "\\'");
      const dot = p.isDeload
        ? `<circle cx="${x}" cy="${y}" r="2.4" fill="white" stroke="#d97706" stroke-width="1.2" opacity="0.8" />`
        : `<circle cx="${x}" cy="${y}" r="2" fill="${color}" />`;
      return dot
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

export {
  sparkTip,
  microSparkline,
  _renderSparklineGridLines,
  renderMeasurementSparkline,
  renderPairedMeasurementSparkline,
  MUSCLE_TO_UNIFIED_GROUP,
  METRIC_TO_UNIFIED_GROUP,
  UNIFIED_GROUPS,
};
