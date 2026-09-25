import { EXERCISE_MUSCLES, getMuscleImpact } from './legacy/standards.js';
import { sessionExerciseDurations } from './legacy/duration-estimates.js';

// Training insights for the progress page: where volume goes, which lifts are
// moving or stuck, how hard sets are, and how regularly workouts happen —
// turned into a short, prioritized list of things to change.
//
// Input sessions are completed, non-deload workouts (buildProgress already
// filters them). All windows are counted back from `today`.

const DAY = 86400000;
const WINDOW_DAYS = 28;

// Weekly hard-set ranges. Most muscles grow well on ~10–20 sets a week; small
// or heavily-assisted muscles need less direct work.
const MUSCLES = [
  { id: 'chest', label: 'Chest', target: [10, 20] },
  { id: 'shoulders', label: 'Side/front delts', target: [8, 20] },
  { id: 'rear_delts', label: 'Rear delts', target: [6, 16] },
  { id: 'triceps', label: 'Triceps', target: [8, 18] },
  { id: 'biceps', label: 'Biceps', target: [8, 18] },
  { id: 'forearms', label: 'Forearms', target: [4, 14] },
  { id: 'lats', label: 'Lats', target: [10, 20] },
  { id: 'upper_back', label: 'Upper back', target: [10, 20] },
  { id: 'lower_back', label: 'Lower back', target: [4, 12] },
  { id: 'core', label: 'Core', target: [6, 16] },
  { id: 'quads', label: 'Quads', target: [10, 20] },
  { id: 'hamstrings', label: 'Hamstrings', target: [8, 18] },
  { id: 'glutes', label: 'Glutes', target: [8, 18] },
  { id: 'calves', label: 'Calves', target: [6, 16] },
];
const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['lats', 'upper_back', 'rear_delts', 'biceps'];

const dayNumber = date => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
const round1 = value => Math.round(value * 10) / 10;

const isWorkingSet = row => row && row.set_type !== 'warmup' && row.completed !== false && !row.userSkipped
  && Number(row.reps) > 0;

/** Fractional weekly sets per muscle: primary movers count fully, secondary
 * movers by their contribution ratio (e.g. triceps on bench ≈ 0.5 set). */
function muscleSets(sessions, fromDay, toDay) {
  const totals = Object.fromEntries(MUSCLES.map(muscle => [muscle.id, 0]));
  for (const session of sessions) {
    const day = dayNumber(session.date);
    if (day <= fromDay || day > toDay) continue;
    for (const row of session.sets || []) {
      if (!isWorkingSet(row)) continue;
      const mapping = EXERCISE_MUSCLES[row.exercise];
      if (!mapping) continue;
      for (const muscle of mapping.primary || []) if (muscle in totals) totals[muscle] += getMuscleImpact(row.exercise, muscle, true);
      for (const muscle of mapping.secondary || []) if (muscle in totals) totals[muscle] += getMuscleImpact(row.exercise, muscle, false);
    }
  }
  return totals;
}

function muscleFocus(sessions, todayDay) {
  const firstDay = Math.min(...sessions.map(session => dayNumber(session.date)));
  // Early on, average over the weeks actually trained instead of four.
  const weeks = Math.max(1, Math.min(WINDOW_DAYS, todayDay - firstDay + 1) / 7);
  const current = muscleSets(sessions, todayDay - WINDOW_DAYS, todayDay);
  const previous = muscleSets(sessions, todayDay - 2 * WINDOW_DAYS, todayDay - WINDOW_DAYS);
  const hasPrevious = sessions.some(session => {
    const day = dayNumber(session.date);
    return day <= todayDay - WINDOW_DAYS && day > todayDay - 2 * WINDOW_DAYS;
  });
  return MUSCLES.map(muscle => {
    const perWeek = round1(current[muscle.id] / weeks);
    const before = hasPrevious ? round1(previous[muscle.id] / (WINDOW_DAYS / 7)) : null;
    const [low, high] = muscle.target;
    const status = perWeek < low ? 'low' : perWeek > high ? 'high' : 'ok';
    return { ...muscle, perWeek, before, status };
  });
}

/** Status from each lift's per-session e1RM (or progress score). */
function liftStatus(name, points, todayDay) {
  const values = points.map(point => point.value);
  const best = Math.max(...values);
  const bestIndex = values.indexOf(best);
  const last = points.at(-1);
  const sessionsSinceBest = points.length - 1 - bestIndex;
  const daysSinceBest = todayDay - dayNumber(points[bestIndex].date);
  const daysSinceLast = todayDay - dayNumber(last.date);
  const windowStart = todayDay - 56;
  const baseline = points.find(point => dayNumber(point.date) >= windowStart && point !== last);
  const change = baseline ? round1((last.value - baseline.value) / baseline.value * 100) : null;
  const fromBest = round1((last.value - best) / best * 100);
  let status = 'steady';
  if (points.length < 3) status = 'new';
  else if (daysSinceLast > WINDOW_DAYS) status = 'paused';
  else if (fromBest <= -5 && sessionsSinceBest >= 2) status = 'down';
  else if (sessionsSinceBest >= 3 && daysSinceBest >= 21) status = 'stalled';
  else if (sessionsSinceBest === 0 && points.length >= 2) status = 'progressing';
  return {
    name, status, value: last.value, best, bestDate: points[bestIndex].date, change, fromBest,
    sessions: points.length, sessionsSinceBest, daysSinceBest, daysSinceLast,
  };
}

function effort(sessions, todayDay) {
  const counts = { '0': 0, '1-2': 0, '3-4': 0, '5+': 0 };
  let total = 0;
  for (const session of sessions) {
    if (dayNumber(session.date) <= todayDay - WINDOW_DAYS) continue;
    for (const row of session.sets || []) {
      if (!isWorkingSet(row)) continue;
      total += 1;
      if (row.rir in counts) counts[row.rir] += 1;
    }
  }
  const rated = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { counts, rated, total };
}

function consistency(sessions, todayDay) {
  // Eight rolling 7-day buckets ending today, oldest first.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = todayDay - (7 - i) * 7;
    return { end, sessions: 0 };
  });
  for (const session of sessions) {
    const day = dayNumber(session.date);
    const index = 7 - Math.floor((todayDay - day) / 7);
    if (index >= 0 && index < 8) weeks[index].sessions += 1;
  }
  const recent = weeks.slice(4).reduce((sum, week) => sum + week.sessions, 0) / 4;
  const prior = weeks.slice(0, 4).reduce((sum, week) => sum + week.sessions, 0) / 4;
  return { weeks: weeks.map(week => week.sessions), recent: round1(recent), prior: round1(prior) };
}

/** Time from logged set to logged set (includes rest and setup), per exercise
 * over the last 4 weeks vs the 4 before, plus recent workout durations. */
function pace(sessions, todayDay) {
  const byExercise = new Map();
  const workouts = [];
  for (const session of sessions) {
    const age = todayDay - dayNumber(session.date);
    if (age >= 2 * WINDOW_DAYS || age < 0) continue;
    const durations = sessionExerciseDurations(session);
    const timed = Object.values(durations);
    if (!timed.length) continue;
    const recent = age < WINDOW_DAYS;
    for (const [name, sample] of Object.entries(durations)) {
      const entry = byExercise.get(name) || { name, recent: { sec: 0, sets: 0, sessions: 0 }, before: { sec: 0, sets: 0 } };
      const bucket = recent ? entry.recent : entry.before;
      bucket.sec += sample.durationSec; bucket.sets += sample.setCount;
      if (recent) entry.recent.sessions += 1;
      byExercise.set(name, entry);
    }
    const totalSec = timed.reduce((sum, sample) => sum + sample.durationSec, 0);
    const setCount = timed.reduce((sum, sample) => sum + sample.setCount, 0);
    const started = Date.parse(session.started_at || ''), finished = Date.parse(session.finished_at || '');
    const wallSec = Number.isFinite(started) && Number.isFinite(finished) && finished > started ? (finished - started) / 1000 : totalSec;
    workouts.push({ date: session.date, name: session.workout_name, minutes: Math.round(wallSec / 60), perSet: Math.round(totalSec / setCount) });
  }
  const exercises = [...byExercise.values()].filter(entry => entry.recent.sets > 0).map(entry => ({
    name: entry.name,
    perSet: Math.round(entry.recent.sec / entry.recent.sets),
    perSetBefore: entry.before.sets ? Math.round(entry.before.sec / entry.before.sets) : null,
    perWorkout: Math.round(entry.recent.sec / entry.recent.sessions),
    sets: entry.recent.sets,
  })).sort((a, b) => b.perWorkout - a.perWorkout);
  return { exercises, workouts: workouts.sort((a, b) => a.date.localeCompare(b.date)).slice(-8) };
}

// An exercise the athlete already knows that mainly trains this muscle.
function suggestExercise(muscleId, sessions) {
  const done = new Set(sessions.flatMap(session => (session.sets || []).map(row => row.exercise)));
  const candidates = Object.entries(EXERCISE_MUSCLES)
    .filter(([, mapping]) => (mapping.primary || []).includes(muscleId))
    .map(([name]) => name);
  return candidates.find(name => done.has(name)) || candidates[0] || null;
}

const formatValue = lift => Number.isInteger(lift.value) ? lift.value : round1(lift.value);

function buildActions({ lifts, muscles, balance, rir, rhythm, sessions }) {
  const actions = [];
  for (const lift of lifts.filter(item => item.status === 'down')) {
    actions.push({ severity: 3, kind: 'down', text: `${lift.name} is ${Math.abs(lift.fromBest)}% below its best (${formatValue(lift)} vs ${round1(lift.best)}). Check sleep and recovery, or take a lighter week before pushing again.` });
  }
  for (const lift of lifts.filter(item => item.status === 'stalled')) {
    actions.push({ severity: 2, kind: 'stalled', text: `${lift.name} hasn't beaten its best in ${lift.sessionsSinceBest} sessions (${Math.round(lift.daysSinceBest / 7)} weeks). Change one thing: add a set, move to a new rep range, or use a smaller jump.` });
  }
  const trainedMuscles = muscles.filter(muscle => muscle.perWeek > 0 || muscle.before > 0);
  const low = trainedMuscles.filter(item => item.status === 'low')
    .sort((a, b) => (b.target[0] - b.perWeek) - (a.target[0] - a.perWeek));
  if (low.length > 2) {
    const exercise = suggestExercise(low[0].id, sessions);
    actions.push({ severity: 2, kind: 'low', text: `${low.length} muscles are below their weekly target: ${low.slice(0, 4).map(muscle => `${muscle.label} ${muscle.perWeek}/${muscle.target[0]}`).join(', ')}${low.length > 4 ? ' and more' : ''}. Start with ${low[0].label.toLowerCase()}${exercise ? ` (e.g. ${exercise})` : ''}.` });
  } else {
    for (const muscle of low) {
      const gap = Math.ceil(muscle.target[0] - muscle.perWeek);
      const exercise = suggestExercise(muscle.id, sessions);
      actions.push({ severity: 2, kind: 'low', text: `${muscle.label}: ${muscle.perWeek} sets/week, below the ${muscle.target[0]}–${muscle.target[1]} range. Add about ${gap} set${gap === 1 ? '' : 's'} a week${exercise ? ` (e.g. ${exercise})` : ''}.` });
    }
  }
  for (const muscle of muscles.filter(item => item.status === 'high')) {
    actions.push({ severity: 1, kind: 'high', text: `${muscle.label}: ${muscle.perWeek} sets/week, above ${muscle.target[1]}. Fine if it's a priority; trim it if joints ache or lifts stall.` });
  }
  if (balance.ratio === Infinity) {
    actions.push({ severity: 2.5, kind: 'balance', text: `No pulling work in the last 4 weeks against ${balance.push} pushing sets a week. Add rows or pulldowns to protect your shoulders.` });
  } else if (balance.ratio != null && balance.ratio > 0 && (balance.ratio > 1.5 || balance.ratio < 0.67)) {
    const more = balance.ratio > 1 ? 'pushing' : 'pulling';
    const less = balance.ratio > 1 ? 'pulling' : 'pushing';
    actions.push({ severity: 2.5, kind: 'balance', text: `You do ${round1(Math.max(balance.ratio, 1 / balance.ratio))}× more ${more} than ${less} (${balance.push} vs ${balance.pull} sets/week). Add ${less} work to protect your shoulders.` });
  }
  if (rir.rated >= 10) {
    const easy = (rir.counts['3-4'] + rir.counts['5+']) / rir.rated;
    const failure = rir.counts['0'] / rir.rated;
    if (easy > 0.5) actions.push({ severity: 2, kind: 'effort', text: `${Math.round(easy * 100)}% of rated sets ended with 3+ reps left. Take working sets to 1–2 reps from failure to keep progressing.` });
    else if (failure > 0.35) actions.push({ severity: 2, kind: 'effort', text: `${Math.round(failure * 100)}% of rated sets went to failure. Leave a rep or two in the tank on most sets to recover faster.` });
  } else if (rir.total >= 20) {
    actions.push({ severity: 0, kind: 'effort', text: `Only ${rir.rated} of ${rir.total} recent sets have an RIR. Tap reps-in-reserve after sets to get effort advice.` });
  }
  if (rhythm.prior >= 1 && rhythm.recent < rhythm.prior * 0.6) {
    actions.push({ severity: 2, kind: 'consistency', text: `You're training ${rhythm.recent} times a week lately, down from ${rhythm.prior}. Protect the next few sessions in your calendar.` });
  }
  return actions.sort((a, b) => b.severity - a.severity).slice(0, 5);
}

/**
 * @param sessions completed, non-deload sessions
 * @param trends   { [exercise]: [{ date, value }] } per-session e1RM/score
 */
export function buildInsights(sessions = [], trends = {}, { today } = {}) {
  if (!sessions.length || !today) return null;
  const todayDay = dayNumber(today);
  const muscles = muscleFocus(sessions, todayDay);
  const lifts = Object.entries(trends)
    .filter(([, points]) => points?.length)
    .map(([name, points]) => liftStatus(name, points, todayDay))
    .sort((a, b) => a.daysSinceLast - b.daysSinceLast || b.value - a.value);
  const byId = Object.fromEntries(muscles.map(muscle => [muscle.id, muscle.perWeek]));
  const push = round1(PUSH.reduce((sum, id) => sum + byId[id], 0));
  const pull = round1(PULL.reduce((sum, id) => sum + byId[id], 0));
  const balance = { push, pull, ratio: pull > 0 ? push / pull : push > 0 ? Infinity : null };
  const rir = effort(sessions, todayDay);
  const rhythm = consistency(sessions, todayDay);
  const actions = buildActions({ lifts, muscles, balance, rir, rhythm, sessions });
  return { actions, muscles, lifts, balance, rir, rhythm, pace: pace(sessions, todayDay) };
}

export { MUSCLES as INSIGHT_MUSCLES };
