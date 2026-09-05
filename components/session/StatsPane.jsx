"use client";
import { useState } from "react";
import { T, localDate } from "@/lib/legacy/shared";
import { beltAdjustedRepScore, calcSet1RM, calcStoredSet1RM, decodeStageScore, isAssistExercise } from "@/lib/legacy/standards";
import { Sparkline } from "./Sparkline";
import { effectiveExerciseWeight, effectiveStoredExerciseWeight } from "@/lib/legacy/cable-stack";
import { isStoredBeltLoad, storedBeltLoad } from "@/lib/legacy/belt-load";
import { historicalSetLabel, historySetLoad } from "@/lib/legacy/history-set-display";
import { buildExerciseSessionHistory, selectTopSet } from "@/lib/legacy/exercise-session-history";

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

function PreviousSessions({ history, exercise, sessionId }) {
  const { rows, columnCount } = buildExerciseSessionHistory(history, exercise.name, sessionId);
  if (!rows.length) {
    return (
      <Section label="PREVIOUS SESSIONS">
        <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 10 }}>No previous sessions yet.</div>
      </Section>
    );
  }

  const topSets = rows.map(({ session, sets }) => {
    const set = selectTopSet(sets, candidate => historySetLoad(candidate, session, exercise));
    return set ? { session, set, reps: set.reps, load: historySetLoad(set, session, exercise) } : null;
  }).filter(Boolean);
  const best = selectTopSet(topSets, entry => entry.load);
  const summaryRow = (entry, heading, key = heading) => {
    const label = historicalSetLabel(entry.set, entry.session, exercise);
    return (
      <div className="history-top-set" key={key}>
        <span className="history-top-date">{heading}</span>
        <span className="history-top-value">{label.value}{label.detail && <span className="history-top-detail"> · {label.detail}</span>}</span>
      </div>
    );
  };

  const dateWidth = 78;
  const setWidth = 104;
  const border = `1px solid ${T.cardBorder}`;
  return (
    <Section label="TOP SETS">
      {best && <div className="history-best">{summaryRow(best, "BEST")}
        <div className="history-best-date">{displayDate(best.session.date)}</div>
      </div>}
      {topSets.slice(0, 3).map((entry, index) => summaryRow(entry, displayDate(entry.session.date), entry.session.id || index))}
      <details className="history-full-log">
        <summary>All sessions · {rows.length}</summary>
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
      </details>
    </Section>
  );
}

function StatsPane({ exercise, history, statHistory, sessionId }) {
  const [tipState, setTip] = useState(null);
  const tip = tipState?.exerciseName === exercise?.name ? tipState : null;

  if (!exercise) return null;
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');
  
  const showTip = (e, content) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ exerciseName: exercise.name, content, x: r.left + r.width / 2, y: r.top - 4 });
  };
  const hideTip = () => setTip(null);

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
      const orm = calcStoredSet1RM(st.exercise || exercise.name, recordedWeight, r, st.bands_json, st.grip, sess, st.load_type);
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
      const belt = exercise.beltLoad ? Math.max(0, Number(s.weight) || 0) : 0;
      const score = belt > 0 ? beltAdjustedRepScore(r, belt) : r;
      if (r > 0 && score > todayOrm) todayOrm = score;
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
