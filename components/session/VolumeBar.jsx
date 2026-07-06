"use client";
import { T, localDate } from "@/lib/legacy/shared";
import { getMuscleImpact } from "@/lib/legacy/standards";

// ─── file: workout-session-volume-bar.js ───

function VolumeBar({ exerciseName, muscle, events, isPrimary, showTip, hideTip }) {
  const TARGET_MIN = 10, TARGET_MAX = 20;
  const sets = events.reduce((a, ev) => a + (ev.weightage ?? 1.0), 0);
  const DAY_MS = 86400000;
  
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ms = todayMs - i * DAY_MS;
    const d = new Date(ms);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, label: String(d.getUTCDate()), events: [], isToday: i === 0 });
  }
  events.forEach(ev => {
    const day = days.find(d => d.date === ev.date);
    if (day) day.events.push(ev);
  });

  const PALETTE = [
    { hue: 152 }, // green
    { hue: 200 }, // blue
    { hue: 30 },  // orange
    { hue: 280 }, // violet
    { hue: 340 }, // pink
    { hue: 50 },  // amber
  ];

  const exerciseOrder = [];
  events.forEach(ev => { if (!exerciseOrder.includes(ev.exercise)) exerciseOrder.push(ev.exercise); });
  const exerciseHue = {};
  exerciseOrder.forEach((name, i) => { exerciseHue[name] = PALETTE[i % PALETTE.length].hue; });

  const topScorePerEx = {};
  events.forEach(ev => {
    const sc = ev.weight * ev.reps;
    if (sc > (topScorePerEx[ev.exercise] || 0)) topScorePerEx[ev.exercise] = sc;
  });

  const maxPerDay = Math.max(4, ...days.map(d => d.events.length));
  const CHART_H = 64;
  const GAP = 1.5;
  const SLICE_H = Math.max(3, Math.floor((CHART_H - (maxPerDay - 1) * GAP) / maxPerDay));
  const countColor = sets === 0 ? T.faint
                    : sets < TARGET_MIN ? T.red
                    : sets <= TARGET_MAX ? T.green
                    : T.amber;

  const sliceStyle = (ev, isToday) => {
    const hue = exerciseHue[ev.exercise] ?? 152;
    const top = topScorePerEx[ev.exercise] || 1;
    const score = (ev.weight * ev.reps) / top;
    const hardness = Math.max(0.35, Math.min(1, score || 0.35));
    const sat = Math.round(55 + hardness * 35);
    const light = Math.round(isToday ? (44 + hardness * 12) : (38 + hardness * 14));
    const alpha = (isToday ? 1 : 0.85) * (ev.weightage < 1.0 ? 0.55 : 1.0);
    return {
      background: `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`,
      boxShadow: isToday && ev.weightage === 1.0 ? `0 0 6px hsla(${hue}, ${sat}%, 60%, 0.5)` : "none",
      border: "none",
    };
  };

  const formatSets = (s) => {
    if (Number.isInteger(s)) return String(s);
    return s.toFixed(1);
  };

  const getSliceHeight = (ev) => {
    const baseH = SLICE_H;
    if (ev.weightage < 1.0) {
      return Math.max(2, Math.floor(baseH * ev.weightage));
    }
    return baseH;
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {muscle.replace("_", " ")}{!isPrimary && ` (${Math.round(getMuscleImpact(exerciseName, muscle, false) * 100)}%)`}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800 }}>
          <span style={{ color: countColor }}>{formatSets(sets)}</span>
          <span style={{ color: T.disabled, fontWeight: 500 }}> / 10-20</span>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", height: CHART_H, gap: 3 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column-reverse",
            gap: `${GAP}px`, height: "100%", justifyContent: "flex-start",
          }}>
            {d.events.length === 0 ? (
              <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 1 }} />
            ) : (
              d.events.map((ev, j) => (
                <div key={j}
                  onMouseEnter={(e) => showTip(e, `${ev.exercise} · ${ev.weight}lb × ${ev.reps} · ${ev.date}${ev.weightage < 1.0 ? ` (secondary: ${Math.round(ev.weightage * 100)}%)` : ""}`)}
                  onMouseLeave={hideTip}
                  style={{
                    height: getSliceHeight(ev),
                    borderRadius: 2,
                    cursor: "default",
                    ...sliceStyle(ev, d.isToday),
                  }} />
              ))
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
        {days.map((d, i) => (
          <span key={i} style={{
            flex: 1, textAlign: "center",
            color: d.isToday ? T.accentLight : (d.events.length ? T.muted : T.disabled),
            fontFamily: T.mono, fontSize: 9,
            fontWeight: d.isToday ? 800 : (d.events.length ? 600 : 500),
          }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export { VolumeBar };
