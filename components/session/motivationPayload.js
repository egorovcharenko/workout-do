import { api } from "@/lib/db/api";
import { EXERCISE_MUSCLES, calcStoredSet1RM } from "@/lib/legacy/standards";
import { effectiveExerciseWeight, effectiveStoredExerciseWeight } from "@/lib/legacy/cable-stack";

// ─── file: workout-session-motivation-payload.js ───

function buildMotivatePayload(exercise, sid, sessionDate, history, statHistory) {
  const subNames = [exercise.name];
  const today = sessionDate;
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const current = [];
  exercise.sets.forEach(s => {
    if (!s.completed) return;
    const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
    let weight_lb;
    if (exercise.assist) {
      weight_lb = Math.max(0, (s.bodyweight || 0) - bandSum);
    } else if (exercise.isBandsOnly) {
      weight_lb = bandSum;
    } else if (exercise.bandAddon) {
      weight_lb = (s.weight || 0) + bandSum;
    } else {
      weight_lb = s.weight || 0;
    }
    current.push({
      sub: exercise.name,
      type: s.kind === "warmup" ? "warmup" : "working",
      set_number: s.setNumber,
      reps: parseInt(s.reps) || 0,
      weight_lb,
    });
  });

  const previous = [];
  for (const sess of (history || []).slice(0, 4)) {
    const sessSets = (sess.sets || []).filter(st => subNames.includes(st.exercise));
    if (sessSets.length) previous.push({
      date: sess.date,
      sets: sessSets.map(st => ({ sub: st.exercise, type: st.set_type, reps: st.reps, weight_lb: st.weight_lb })),
    });
    if (previous.length >= 2) break;
  }

  const muscles = [];
  subNames.forEach(name => {
    const m = EXERCISE_MUSCLES[name];
    if (m) muscles.push(...(m.primary || []), ...(m.secondary || []));
  });

  const statsLoaded = Object.keys(statHistory.orm || {}).length > 0;
  const ormOf = (w, r) => r > 1 ? w * (1 + r / 30) : w;

  const prs = subNames.map(subName => {
    const histSessions = (history || []).filter(s =>
      (s.sets || []).some(st => st.exercise === subName && st.set_type === 'working')
    );
    let histMaxWt = 0, histMaxReps = 0, histMaxOrm = 0;
    const histByDate = {};
    // Reps-only: older rows saved bodyweight in weight_lb, so weight/volume
    // history is meaningless (new rows save 0) — keep only reps and the
    // reps-based 1RM score, or the trend reads as a permanent volume crash.
    const repsOnly = !!exercise.repsOnly;
    histSessions.forEach(sess => {
      let mw = 0, mr = 0, mo = 0, sv = 0;
      sess.sets.forEach(st => {
        if (st.exercise !== subName || st.set_type !== 'working') return;
        const recordedWeight = +st.weight_lb || 0;
        const w = effectiveStoredExerciseWeight(subName, recordedWeight, sess);
        const r = parseInt(st.reps) || 0;
        if (!repsOnly) { if (w > mw) mw = w; if (mw > histMaxWt) histMaxWt = mw; }
        if (r > mr) mr = r; if (mr > histMaxReps) histMaxReps = mr;
          const o = calcStoredSet1RM(subName, recordedWeight, r, st.bands_json, st.grip, sess);
          if (o > mo) mo = o;
          if (mo > histMaxOrm) histMaxOrm = mo;
          if (!repsOnly) sv += w * r;
      });
      histByDate[sess.date] = { date: sess.date, orm: mo, wt: mw, reps: mr, vol: sv };
    });

    const ormHist  = ((statHistory.orm  || {})[subName] || []);
    const wtHist   = ((statHistory.wt   || {})[subName] || []);
    const repsHist = ((statHistory.reps || {})[subName] || []);
    const volHist  = ((statHistory.vol  || {})[subName] || []);
    const statMaxOrm  = ormHist.length  ? Math.max(...ormHist.map(d => +d.orm  || 0)) : 0;
    const statMaxWt   = wtHist.length   ? Math.max(...wtHist.map(d => +d.wt    || 0)) : 0;
    const statMaxReps = repsHist.length ? Math.max(...repsHist.map(d => +d.reps|| 0)) : 0;
    const byDate = { ...histByDate };
    ormHist.forEach (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).orm  = +d.orm  || 0; });
    wtHist.forEach  (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).wt   = +d.wt   || 0; });
    repsHist.forEach(d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).reps = +d.reps || 0; });
    volHist.forEach (d => { (byDate[d.date] = byDate[d.date] || { date: d.date }).vol  = +d.vol  || 0; });

    const prevMaxOrm  = Math.max(histMaxOrm,  statMaxOrm);
    const prevMaxWt   = Math.max(histMaxWt,   statMaxWt);
    const prevMaxReps = Math.max(histMaxReps, statMaxReps);
    const allHist = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    if (allHist.length === 0) return null;

    const workingSets = exercise.sets.filter(s => s.kind === "work" && s.completed);
    const currentEffectiveWeight = (s) => {
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const recordedWeight = exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
           : exercise.isBandsOnly ? bs
           : exercise.bandAddon ? (s.weight || 0) + bs
           : (s.weight || 0);
      return effectiveExerciseWeight(subName, recordedWeight);
    };
    const curWt   = workingSets.reduce((m, s) => Math.max(m, (() => {
      return currentEffectiveWeight(s);
    })()), 0);
    const curReps = workingSets.reduce((m, s) => Math.max(m, parseInt(s.reps) || 0), 0);
    const curOrm  = workingSets.reduce((m, s) => {
      const reps = parseInt(s.reps) || 0;
      if (exercise.repsOnly) return reps > 0 ? Math.max(m, reps) : m;
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const w = currentEffectiveWeight(s);
      const isAssist = exercise.assist;
      const o = isAssist ? (reps > 1 ? (w * reps / 30.0) - bs : -bs) : ormOf(w, reps);
      return reps > 0 && w > 0 ? Math.max(m, o) : m;
    }, 0);
    const curVol = workingSets.reduce((sum, s) => {
      const reps = parseInt(s.reps) || 0;
      const w = currentEffectiveWeight(s);
      return sum + (reps > 0 && w > 0 ? w * reps : 0);
    }, 0);

    const trimmed = allHist.slice(-12);

    const lastDate = allHist[allHist.length - 1].date;
    const daysSinceLast = Math.round((todayMs - Date.parse(lastDate + 'T00:00:00Z')) / 86400000);
    const recent = allHist.filter(h => todayMs - Date.parse(h.date + 'T00:00:00Z') <= 28 * 86400000);
    const prior  = allHist.filter(h => {
      const ago = todayMs - Date.parse(h.date + 'T00:00:00Z');
      return ago > 28 * 86400000 && ago <= 56 * 86400000;
    });
    const avg = arr => arr.length ? arr.reduce((s, x) => s + (+x.vol || 0), 0) / arr.length : 0;
    const recentAvg = avg(recent), priorAvg = avg(prior);
    const volTrendPct = priorAvg > 0 ? Math.round((recentAvg - priorAvg) / priorAvg * 100) : null;

    const sameWtReps = curWt > 0 ? allHist.filter(h => h.wt === curWt).map(h => h.reps).filter(r => r > 0) : [];
    const repsAtCurWtImproved = sameWtReps.length >= 2 && curReps > Math.max(...sameWtReps);

    return {
      sub: subName,
      current_orm: curOrm,           previous_best_orm: prevMaxOrm,    is_orm_pr:    !!(curOrm && curOrm > prevMaxOrm),
      current_max_weight: curWt,     previous_best_weight: prevMaxWt,  is_weight_pr: !!(curWt && curWt > prevMaxWt),
      current_max_reps: curReps,     previous_best_reps: prevMaxReps,  is_reps_pr:   !!(curReps && curReps > prevMaxReps),
      current_volume: curVol,
      sessions_in_history: allHist.length,
      days_since_last_session: daysSinceLast,
      returning_after_layoff: daysSinceLast >= 14,
      vol_trend_pct_4wk_vs_prior: volTrendPct,
      reps_at_current_weight_improved: repsAtCurWtImproved,
      tied_previous_best_orm: !!(curOrm && prevMaxOrm && curOrm === prevMaxOrm),
      history_timeseries: trimmed,
      stats_source: statsLoaded ? "full" : "recent_history_only",
    };
  }).filter(Boolean);

  const statsFailed = !statsLoaded;

  return {
    session_id: sid,
    exercise: exercise.name,
    muscles: [...new Set(muscles)],
    stats_loaded: !statsFailed,
    current,
    previous,
    prs,
  };
}

async function requestMotivation(exercise, sid, sessionDate, history, statHistory, setMotivations) {
  setMotivations(m => ({ ...m, [exercise.id]: "__loading__" }));
  try {
    const payload = buildMotivatePayload(exercise, sid, sessionDate, history, statHistory);
    const res = await api.motivate(payload);
    if (res && res.message) {
      setMotivations(m => ({ ...m, [exercise.id]: res.message }));
    } else {
      setMotivations(m => { const c = { ...m }; delete c[exercise.id]; return c; });
    }
  } catch (e) {
    console.warn("[V2-MOTIVATE]", e);
    setMotivations(m => { const c = { ...m }; delete c[exercise.id]; return c; });
  }
}

export { buildMotivatePayload, requestMotivation };
