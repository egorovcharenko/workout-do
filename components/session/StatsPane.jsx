"use client";
import { useState } from "react";
import { GRIP_LABELS, T, localDate } from "@/lib/legacy/shared";
import { EXERCISE_MUSCLES, getMuscleImpact, calcSet1RM, calcStoredSet1RM, decodeStageScore, isAssistExercise, isRepsOnlyExercise } from "@/lib/legacy/standards";
import { Sparkline } from "./Sparkline";
import { effectiveExerciseWeight, effectiveStoredExerciseWeight } from "@/lib/legacy/cable-stack";
import { isStoredBeltLoad, storedBeltLoad } from "@/lib/legacy/belt-load";
import { buildExerciseSessionHistory } from "@/lib/legacy/exercise-session-history";

// ─── file: workout-session-stats-pane.js ───

const Section = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.9, marginBottom: 8 }}>
      {label}
    </div>
    {children}
  </div>
);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayDate(value) {
  const [year, month, day] = String(value || "").split("-");
  if (!year || !month || !day) return value || "—";
  const suffix = year === String(new Date().getFullYear()) ? "" : ` '${year.slice(-2)}`;
  return `${MONTHS[Number(month) - 1] || month} ${Number(day)}${suffix}`;
}

function bandLoad(set) {
  if (!set?.bands_json) return 0;
  try {
    const bands = JSON.parse(set.bands_json);
    return Array.isArray(bands) ? bands.reduce((sum, weight) => sum + (Number(weight) || 0), 0) : 0;
  } catch {
    return 0;
  }
}

function formatWeight(value) {
  const weight = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(weight) ? String(weight) : String(weight).replace(/0+$/, "").replace(/\.$/, "");
}

function historicalSetLabel(set, session, exercise) {
  const reps = parseInt(set.reps, 10) || 0;
  const repLabel = reps === 1 ? "1 rep" : `${reps} reps`;
  const grip = GRIP_LABELS[set.grip]?.label || set.grip;
  const repDetail = grip ? `${repLabel} · ${grip}` : repLabel;

  if (exercise.stages) {
    const stage = exercise.stages.find((item) => item.id === set.grip);
    return { value: stage?.label || set.grip || "Stage", detail: repLabel };
  }
  if (exercise.beltLoad) {
    const load = storedBeltLoad(set);
    return load > 0
      ? { value: `+${formatWeight(load)} lb`, detail: repDetail }
      : { value: "Bodyweight", detail: repDetail };
  }
  if (exercise.assist) {
    const assistance = bandLoad(set);
    return assistance > 0
      ? { value: `−${formatWeight(assistance)} lb`, detail: `${repLabel} · assist` }
      : { value: "Bodyweight", detail: repLabel };
  }
  if (exercise.repsOnly) return { value: repLabel, detail: "" };

  const weight = effectiveStoredExerciseWeight(
    set.exercise || exercise.name,
    Number(set.weight_lb) || 0,
    session,
  );
  return weight > 0
    ? { value: `${formatWeight(weight)} lb`, detail: repDetail }
    : { value: repLabel, detail: "" };
}

function PreviousSessions({ history, exercise, sessionId }) {
  const { rows, columnCount } = buildExerciseSessionHistory(history, exercise.name, sessionId);
  if (!rows.length) {
    return (
      <Section label="PREVIOUS SESSIONS">
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 10 }}>No previous sessions yet.</div>
      </Section>
    );
  }

  const dateWidth = 78;
  const setWidth = 104;
  const border = `1px solid ${T.cardBorder}`;
  return (
    <Section label={`PREVIOUS SESSIONS · ${rows.length}`}>
      <div style={{ overflowX: "auto", border, borderRadius: 9, WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: dateWidth + columnCount * setWidth, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: dateWidth }} />
            {Array.from({ length: columnCount }, (_, index) => <col key={index} style={{ width: setWidth }} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" style={{ position: "sticky", left: 0, zIndex: 2, padding: "7px 8px", borderBottom: border, background: "#111827", color: T.faint, fontFamily: T.mono, fontSize: 8, fontWeight: 800, letterSpacing: 0.7, textAlign: "left" }}>DATE</th>
              {Array.from({ length: columnCount }, (_, index) => (
                <th key={index} scope="col" style={{ padding: "7px 8px", borderBottom: border, borderLeft: border, color: T.faint, fontFamily: T.mono, fontSize: 8, fontWeight: 800, letterSpacing: 0.7, textAlign: "left" }}>
                  SET {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ session, sets }, rowIndex) => {
              const isLast = rowIndex === rows.length - 1;
              return (
                <tr key={session.id || `${session.date}-${rowIndex}`} style={{ background: rowIndex % 2 ? "rgba(255,255,255,0.012)" : "transparent" }}>
                  <th
                    scope="row"
                    title={session.workout_name || session.date}
                    style={{ position: "sticky", left: 0, zIndex: 1, padding: "9px 8px", borderBottom: isLast ? "none" : border, background: rowIndex % 2 ? "#121925" : "#111827", color: T.muted, fontFamily: T.mono, fontSize: 9, fontWeight: 700, textAlign: "left" }}>
                    {displayDate(session.date)}
                    {!!session.is_deload && <span style={{ display: "block", marginTop: 3, color: T.amber, fontSize: 7, letterSpacing: 0.5 }}>DELOAD</span>}
                  </th>
                  {Array.from({ length: columnCount }, (_, setIndex) => {
                    const set = sets[setIndex];
                    const label = set ? historicalSetLabel(set, session, exercise) : null;
                    return (
                      <td
                        key={setIndex}
                        style={{ minWidth: 0, padding: "8px", borderLeft: border, borderBottom: isLast ? "none" : border }}>
                        {label ? (
                          <>
                            <div title={label.value} style={{ color: T.strong, fontFamily: T.mono, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label.value}</div>
                            {!!label.detail && <div title={label.detail} style={{ marginTop: 2, color: T.faint, fontFamily: T.mono, fontSize: 8.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label.detail}</div>}
                          </>
                        ) : <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9 }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StatsPane({ exercise, history, statHistory, exercises, sessionId }) {
  const [tipState, setTip] = useState(null);
  const tip = tipState?.exerciseName === exercise?.name ? tipState : null;

  if (!exercise) return null;
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const windowStartMs = todayMs - 14 * 86400000;
  
  const showTip = (e, content) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ exerciseName: exercise.name, content, x: r.left + r.width / 2, y: r.top - 4 });
  };
  const hideTip = () => setTip(null);

  const muscleInfo = EXERCISE_MUSCLES[exercise.name] || { primary: [], secondary: [] };

  const muscleSets14d = {};
  (muscleInfo.primary || []).forEach(m => muscleSets14d[m] = []);
  (muscleInfo.secondary || []).forEach(m => muscleSets14d[m] = []);
  for (const sess of (history || [])) {
    if (!sess.date || sess.date === today) continue;
    const sessMs = Date.parse(sess.date + 'T00:00:00Z');
    if (sessMs <= windowStartMs || sessMs > todayMs) continue;
    for (const st of (sess.sets || [])) {
      if (st.set_type !== 'working') continue;
      const mm = EXERCISE_MUSCLES[st.exercise];
      if (!mm) continue;
      for (const muscle of (mm.primary || [])) {
        if (muscle in muscleSets14d) muscleSets14d[muscle].push({
          date: sess.date, isToday: false,
          exercise: st.exercise,
          weight: isRepsOnlyExercise(st.exercise) ? storedBeltLoad(st) : effectiveStoredExerciseWeight(st.exercise, +st.weight_lb || 0, sess),
          reps: parseInt(st.reps) || 0,
          weightage: getMuscleImpact(st.exercise, muscle, true),
        });
      }
      for (const muscle of (mm.secondary || [])) {
        if (muscle in muscleSets14d) muscleSets14d[muscle].push({
          date: sess.date, isToday: false,
          exercise: st.exercise,
          weight: isRepsOnlyExercise(st.exercise) ? storedBeltLoad(st) : effectiveStoredExerciseWeight(st.exercise, +st.weight_lb || 0, sess),
          reps: parseInt(st.reps) || 0,
          weightage: getMuscleImpact(st.exercise, muscle, false),
        });
      }
    }
  }

  const chartTodayDate = new Date(todayMs).toISOString().slice(0, 10);
  for (const e of exercises) {
    const em = EXERCISE_MUSCLES[e.name];
    if (!em || e.skipped) continue;
    for (const s of e.sets) {
      if (!s.completed || s.kind !== 'work') continue;
      const bs = (s.bands || []).reduce((a, b) => a + b, 0);
      const recordedWeight = e.assist ? Math.max(0, (s.bodyweight || 0) - bs)
                    : e.isBandsOnly ? bs
                    : e.bandAddon ? (s.weight || 0) + bs
                    : (s.weight || 0);
      const weight = effectiveExerciseWeight(e.name, recordedWeight);
      for (const muscle of (em.primary || [])) {
        if (muscle in muscleSets14d) muscleSets14d[muscle].push({
          date: chartTodayDate, isToday: true,
          exercise: e.name,
          weight,
          reps: parseInt(s.reps) || 0,
          weightage: getMuscleImpact(e.name, muscle, true),
        });
      }
      for (const muscle of (em.secondary || [])) {
        if (muscle in muscleSets14d) muscleSets14d[muscle].push({
          date: chartTodayDate, isToday: true,
          exercise: e.name,
          weight,
          reps: parseInt(s.reps) || 0,
          weightage: getMuscleImpact(e.name, muscle, false),
        });
      }
    }
  }

  Object.values(muscleSets14d).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));

  const stat = statHistory || {};
  const isRepsOnly = !!exercise.repsOnly;
  const lookupIsAssist = isAssistExercise(exercise.name);
  const histByDate = {};
  (history || []).forEach(sess => {
    if (!sess.date) return;
    const sets = (sess.sets || []).filter(st => st.exercise === exercise.name && st.set_type === 'working');
    if (!sets.length) return;
    let mo = lookupIsAssist ? -Infinity : 0, sv = 0, mw = lookupIsAssist ? -Infinity : 0, mr = 0;
    sets.forEach(st => {
      const recordedWeight = +st.weight_lb || 0, r = parseInt(st.reps) || 0;
      const w = exercise.beltLoad ? storedBeltLoad(st) : effectiveStoredExerciseWeight(st.exercise || exercise.name, recordedWeight, sess);
      const orm = calcStoredSet1RM(st.exercise || exercise.name, recordedWeight, r, st.bands_json, st.grip, sess);
      let bandSum = 0;
      if (lookupIsAssist && st.bands_json) {
        try {
          const b = JSON.parse(st.bands_json);
          if (Array.isArray(b)) bandSum = b.reduce((a, x) => a + (+x || 0), 0);
        } catch(e){}
      }
      const displayW = lookupIsAssist ? -bandSum : w;
      if (displayW > mw) mw = displayW;
      if (r > mr) mr = r;
      if (isRepsOnly) {
        // Reps remain the main score. Explicitly typed belt loads also get a
        // separate added-weight and plate-volume history.
        if (r > 0 && orm > mo) mo = orm;
        if (exercise.beltLoad && isStoredBeltLoad(st) && w > 0) {
          if (w > mw) mw = w;
          sv += w * r;
        }
      } else if (w > 0 && r > 0) {
        if (orm > mo) mo = orm;
        sv += w * r;
      }
    });
    histByDate[sess.date] = {
      date: sess.date,
      orm: mo === -Infinity ? 0 : mo,
      vol: sv,
      wt: mw === -Infinity ? 0 : mw,
      reps: mr,
      isDeload: !!sess.is_deload,
    };
  });

  const mergeMetric = (statArr, key) => {
    const byDate = {};
    (statArr || []).forEach(d => {
      byDate[d.date] = { date: d.date, [key]: +d[key] || 0, isDeload: !!d.is_deload };
    });
    Object.values(histByDate).forEach(h => {
      byDate[h.date] = { date: h.date, [key]: h[key], isDeload: h.isDeload };
    });
    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  };
  const ormHistRaw = mergeMetric((stat.orm || {})[exercise.name], "orm");
  const wtHist     = mergeMetric((stat.wt  || {})[exercise.name], "wt");
  const volHistRaw = mergeMetric((stat.vol || {})[exercise.name], "vol");

  let todayOrm = exercise.assist ? -Infinity : 0, todayVol = 0;
  (exercise.sets || []).forEach(s => {
    if (!s.completed || s.kind !== 'work') return;
    const bs = (s.bands || []).reduce((a, b) => a + b, 0);
    const recordedWeight = exercise.assist ? Math.max(0, (s.bodyweight || 0) - bs)
            : exercise.isBandsOnly ? bs
            : exercise.bandAddon ? (s.weight || 0) + bs
            : (s.weight || 0);
    const w = effectiveExerciseWeight(exercise.name, recordedWeight);
    const r = parseInt(s.reps) || 0;
    if (isRepsOnly) {
      if (r > 0 && r > todayOrm) todayOrm = r;
      if (exercise.beltLoad && r > 0 && w > 0) todayVol += w * r;
      return;
    }
    if (r > 0 && w > 0) {
      const isAssist = exercise.assist;
      let o;
      if (exercise.stages) {
        o = calcSet1RM(exercise.name, w, r, null, s.grip);
      } else if (isAssist) {
        const bw = s.bodyweight || 175;
        const totalOrm = r > 1 ? w * (1 + r / 30) : w;
        o = totalOrm - bw;
      } else {
        o = r > 1 ? w * (1 + r / 30) : w;
      }
      if (o > todayOrm) todayOrm = o;
      todayVol += w * r;
    }
  });
  const chartTodayDateStr = new Date(todayMs).toISOString().slice(0, 10);

  const ormHist = (todayOrm !== -Infinity)
    ? [...ormHistRaw.filter(d => d.date !== chartTodayDateStr), { date: chartTodayDateStr, orm: todayOrm, isDeload: !!window.SESSION_DELOAD }]
    : ormHistRaw;
  const volHist = (todayVol > 0)
    ? [...volHistRaw.filter(d => d.date !== chartTodayDateStr), { date: chartTodayDateStr, vol: todayVol, isDeload: !!window.SESSION_DELOAD }]
    : volHistRaw;
  const primaryList = (muscleInfo.primary || []);
  const secondaryList = (muscleInfo.secondary || []);

  return (
    <div
      onMouseLeave={hideTip}
      style={{
        padding: 14, borderRadius: 14,
        background: T.cardBg, border: `1px solid ${T.cardBorder}`,
        color: T.text,
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 9, fontWeight: 800, letterSpacing: 1.0, marginBottom: 4 }}>STATS</div>
        <div style={{ color: T.strong, fontSize: 16, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2 }}>{exercise.name}</div>
      </div>

      <Section label="PROGRESS · OVER LAST 30 DAYS">
        <Sparkline exerciseName={exercise.name} data={ormHist} valueKey="orm" color="#60A5FA"
          label={exercise.stages ? "STAGE" : isRepsOnly ? "TOP REPS" : "1RM EST"}
          fmt={exercise.stages
            ? (v => { const d = decodeStageScore(v); return `S${d.stage} · ${d.reps} reps`; })
            : isRepsOnly ? (v => `${Math.round(v)} reps`)
            : (v => `${Math.round(v)} lb`)}
          showTip={showTip} hideTip={hideTip} />
        {!isRepsOnly && <Sparkline exerciseName={exercise.name} data={volHist} valueKey="vol" color="#34D399" label="VOLUME" fmt={v => `${Math.round(v).toLocaleString()} lb`} showTip={showTip} hideTip={hideTip} />}
        {exercise.beltLoad && <Sparkline exerciseName={exercise.name} data={wtHist} valueKey="wt" color="#C084FC" label="ADDED LOAD" fmt={v => `+${Math.round(v)} lb`} showTip={showTip} hideTip={hideTip} />}
        {exercise.beltLoad && <Sparkline exerciseName={exercise.name} data={volHist} valueKey="vol" color="#34D399" label="PLATE VOLUME" fmt={v => `${Math.round(v).toLocaleString()} lb`} showTip={showTip} hideTip={hideTip} />}
      </Section>

      {(primaryList.length > 0 || secondaryList.length > 0) && (
        <Section label="MUSCLE LOAD · SETS/WK · 14 DAYS">
          {[...primaryList.map(m => ({ m, isPrimary: true })), ...secondaryList.map(m => ({ m, isPrimary: false }))].map(({ m, isPrimary }) => {
            const events = muscleSets14d[m] || [];
            const weekly = events.reduce((a, ev) => a + (ev.weightage || 0), 0) / 2;
            const lo = 10, hi = 20, max = 25;
            const color = weekly < lo ? "#F87171" : weekly <= hi ? "#34D399" : "#FBBF24";
            const pct = Math.min(weekly / max, 1) * 100;
            const impact = isPrimary ? null : Math.round(getMuscleImpact(exercise.name, m, false) * 100);
            return (
              <div key={m}
                onMouseEnter={(e) => showTip(e, `${events.length} sets in 14 days · target ${lo}–${hi}/wk`)}
                onMouseLeave={hideTip}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "3.5px 0" }}>
                <span style={{
                  width: 108, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: isPrimary ? T.text : T.faint, fontFamily: T.mono, fontSize: 9.5, fontWeight: isPrimary ? 800 : 600,
                  letterSpacing: 0.4, textTransform: "uppercase",
                }}>{m.replace("_", " ")}{impact != null ? ` ·${impact}%` : ""}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${lo / max * 100}%`, width: `${(hi - lo) / max * 100}%`, top: 0, bottom: 0, background: "rgba(255,255,255,0.07)" }} />
                  <div style={{ position: "absolute", left: 0, width: `${pct}%`, top: 0, bottom: 0, borderRadius: 3, background: color, opacity: isPrimary ? 0.9 : 0.55 }} />
                </div>
                <span style={{ width: 34, flexShrink: 0, textAlign: "right", color, fontFamily: T.mono, fontSize: 10.5, fontWeight: 800 }}>
                  {weekly ? weekly.toFixed(1) : "0"}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      <PreviousSessions history={history} exercise={exercise} sessionId={sessionId} />

      {tip && (
        <div style={{
          position: "fixed", left: tip.x, top: tip.y, transform: "translate(-50%, -100%)",
          background: "#1f2937", border: "1px solid rgba(255,255,255,0.08)",
          padding: "5px 8px 4px", borderRadius: 6, pointerEvents: "none", zIndex: 100,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          color: T.strong, fontFamily: T.mono, fontSize: 10, fontWeight: 600,
          whiteSpace: "nowrap",
        }}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

export { StatsPane };
