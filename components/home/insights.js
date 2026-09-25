// "Training insights" block at the top of All-time progress: what to change
// next, muscle focus vs target ranges, lift status, balance, effort, rhythm.
// Pure template-string rendering like the rest of the home screen.

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const STATUS_LABELS = {
  progressing: 'New best', steady: 'Holding', stalled: 'Stalled', down: 'Down', new: 'Baseline', paused: 'Paused',
};
const ACTION_ICONS = { down: '↓', stalled: '■', low: '＋', high: '−', balance: '⇄', effort: '◎', consistency: '◷' };

function renderActions(actions) {
  if (!actions.length) {
    return '<p class="insights-empty">Nothing to fix right now: volume is in range and lifts are moving.</p>';
  }
  return `<ol class="insights-actions">${actions.map(action => `<li class="insights-action insights-${action.kind}">
    <span class="insights-action-icon" aria-hidden="true">${ACTION_ICONS[action.kind] || '•'}</span><span>${esc(action.text)}</span>
  </li>`).join('')}</ol>`;
}

function renderMuscles(muscles) {
  const scale = Math.max(24, ...muscles.map(muscle => muscle.perWeek));
  const pct = value => `${Math.min(100, value / scale * 100).toFixed(1)}%`;
  const rows = muscles.filter(muscle => muscle.perWeek > 0 || muscle.before > 0 || muscle.status === 'low');
  return `<ul class="insights-muscles">${rows.map(muscle => {
    const [low, high] = muscle.target;
    const trend = muscle.before == null ? '' : muscle.perWeek > muscle.before + 0.9 ? '↑' : muscle.perWeek < muscle.before - 0.9 ? '↓' : '';
    const title = `${muscle.label}: ${muscle.perWeek} sets/week (target ${low}–${high})${muscle.before != null ? `, previous 4 weeks ${muscle.before}` : ''}`;
    return `<li class="insights-muscle insights-${muscle.status}" title="${esc(title)}">
      <span class="insights-muscle-name">${esc(muscle.label)}</span>
      <span class="insights-bar" aria-hidden="true">
        <span class="insights-band" style="left:${pct(low)};width:calc(${pct(high)} - ${pct(low)})"></span>
        <span class="insights-fill" style="width:${pct(muscle.perWeek)}"></span>
      </span>
      <span class="insights-muscle-value">${muscle.perWeek}${trend ? `<span class="insights-trend">${trend}</span>` : ''}</span>
    </li>`;
  }).join('')}</ul>`;
}

function renderLifts(lifts) {
  const shown = lifts.filter(lift => lift.status !== 'paused').slice(0, 10);
  if (!shown.length) return '';
  const value = lift => Number.isInteger(lift.value) ? lift.value : Math.round(lift.value * 10) / 10;
  return `<div class="insights-lifts" role="table" aria-label="Lift status">
    <div class="insights-lift insights-lift-head" role="row"><span role="columnheader">Lift</span><span role="columnheader">Est. 1RM</span><span role="columnheader">8 wk</span><span role="columnheader">Status</span></div>
    ${shown.map(lift => {
      const detail = lift.status === 'stalled' ? `${lift.sessionsSinceBest} sessions without a new best`
        : lift.status === 'down' ? `${Math.abs(lift.fromBest)}% below best of ${Math.round(lift.best)}`
        : lift.status === 'new' ? `${lift.sessions} session${lift.sessions === 1 ? '' : 's'} so far` : '';
      const change = lift.change == null ? '—' : `${lift.change > 0 ? '+' : ''}${lift.change}%`;
      return `<div class="insights-lift" role="row" title="${esc(detail)}">
        <span role="cell" class="insights-lift-name">${esc(lift.name)}</span>
        <span role="cell" class="insights-num">${value(lift)}</span>
        <span role="cell" class="insights-num ${lift.change > 0 ? 'gain' : lift.change < 0 ? 'loss' : ''}">${change}</span>
        <span role="cell"><span class="insights-chip insights-chip-${lift.status}">${STATUS_LABELS[lift.status]}</span></span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderBalance(balance) {
  if (balance.ratio == null || balance.push + balance.pull === 0) return '';
  const total = balance.push + balance.pull;
  return `<div class="insights-split" aria-label="Push ${balance.push} vs pull ${balance.pull} sets per week">
    <div class="insights-split-labels"><span>Push ${balance.push}</span><span>Pull ${balance.pull}</span></div>
    <div class="insights-split-bar" aria-hidden="true"><span style="width:${(balance.push / total * 100).toFixed(1)}%"></span></div>
  </div>`;
}

function renderEffort(rir) {
  if (!rir.rated) return `<p class="insights-note">No reps-in-reserve logged in the last 4 weeks.</p>`;
  const parts = [['0', 'Failure'], ['1-2', '1–2 left'], ['3-4', '3–4 left'], ['5+', '5+ left']];
  return `<div class="insights-effort" aria-label="Effort of rated sets">
    <div class="insights-effort-bar" aria-hidden="true">${parts.map(([key]) => rir.counts[key]
      ? `<span class="insights-rir-${key.replace('+', 'plus')}" style="flex:${rir.counts[key]}"></span>` : '').join('')}</div>
    <div class="insights-legend">${parts.map(([key, label]) => `<span><i class="insights-rir-${key.replace('+', 'plus')}"></i>${label} ${Math.round(rir.counts[key] / rir.rated * 100)}%</span>`).join('')}</div>
    <p class="insights-note">${rir.rated} of ${rir.total} working sets rated</p>
  </div>`;
}

function renderRhythm(rhythm) {
  const max = Math.max(1, ...rhythm.weeks);
  return `<div class="insights-rhythm">
    <div class="insights-weeks" aria-label="Workouts per week, last 8 weeks: ${rhythm.weeks.join(', ')}">${rhythm.weeks.map((count, i) =>
      `<span title="${count} workout${count === 1 ? '' : 's'}${i === 7 ? ' (this week)' : ''}"><i style="height:${Math.max(4, count / max * 100)}%"></i><b>${count}</b></span>`).join('')}</div>
    <p class="insights-note">Last 4 weeks ${rhythm.recent}/week · before ${rhythm.prior}/week</p>
  </div>`;
}

const clock = sec => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `0:${String(sec).padStart(2, '0')}`;

function renderPace(pace) {
  if (!pace?.exercises.length) return '<p class="insights-note">No timed sets in the last 4 weeks.</p>';
  const max = Math.max(1, ...pace.workouts.map(w => w.minutes));
  return `<div class="insights-lifts" role="table" aria-label="Time per set and exercise">
    <div class="insights-lift insights-lift-head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">Per set</span><span role="columnheader">Change</span><span role="columnheader">Per workout</span></div>
    ${pace.exercises.map(ex => {
      const delta = ex.perSetBefore == null ? null : ex.perSet - ex.perSetBefore;
      return `<div class="insights-lift" role="row" title="${esc(`${ex.sets} sets in the last 4 weeks`)}">
        <span role="cell" class="insights-lift-name">${esc(ex.name)}</span>
        <span role="cell" class="insights-num">${clock(ex.perSet)}</span>
        <span role="cell" class="insights-num ${delta < 0 ? 'gain' : delta > 0 ? 'loss' : ''}">${delta == null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}s`}</span>
        <span role="cell" class="insights-num">${Math.round(ex.perWorkout / 60)} min</span>
      </div>`;
    }).join('')}
  </div>
  ${pace.workouts.length ? `<div class="insights-rhythm"><div class="insights-weeks" aria-label="Recent workout durations">${pace.workouts.map(w =>
    `<span title="${esc(`${w.date} · ${w.minutes} min · ${clock(w.perSet)} per set`)}"><i style="height:${Math.max(4, w.minutes / max * 100)}%"></i><b>${w.minutes}</b></span>`).join('')}</div>
    <p class="insights-note">Recent workouts, minutes · per set = time from one logged set to the next, rest included</p></div>` : ''}`;
}

export function renderInsights(insights) {
  if (!insights) return '';
  return `<section class="insights" aria-label="Training insights">
    <h2 class="progress-group-title">What to change next</h2>
    ${renderActions(insights.actions)}
    <h2 class="progress-group-title">Muscle focus <span class="insights-sub">hard sets per week · last 4 weeks · shaded = target</span></h2>
    ${renderMuscles(insights.muscles)}
    ${renderBalance(insights.balance)}
    <h2 class="progress-group-title">Time <span class="insights-sub">last 4 weeks vs 4 before</span></h2>
    ${renderPace(insights.pace)}
    <h2 class="progress-group-title">Lifts</h2>
    ${renderLifts(insights.lifts)}
    <div class="insights-pair">
      <div><h2 class="progress-group-title">Effort <span class="insights-sub">last 4 weeks</span></h2>${renderEffort(insights.rir)}</div>
      <div><h2 class="progress-group-title">Rhythm <span class="insights-sub">workouts / week</span></h2>${renderRhythm(insights.rhythm)}</div>
    </div>
  </section>`;
}
