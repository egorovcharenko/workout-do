"use client";
import { T, localDate } from "@/lib/legacy/shared";

// ─── file: workout-session-sparkline.js ───

function Sparkline({ exerciseName, data, valueKey, color, label, fmt, showTip, hideTip }) {
  const DAY_MS = 86400000;
  
  const today = localDate();
  const todayMs = Date.parse(today + 'T00:00:00Z');

  const days = [];
  for (let i = 29; i >= 0; i--) {
    const ms = todayMs - i * DAY_MS;
    const d = new Date(ms);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: String(d.getUTCDate()),
      isToday: i === 0,
      isFuture: false,
      value: null,
    });
  }
  (data || []).forEach(d => {
    const day = days.find(x => x.date === d.date);
    if (day) day.value = +d[valueKey] || 0;
  });

  const isAssist = exerciseName === "Pull-Ups" || exerciseName === "Dips" || exerciseName === "Dead Hang + Scap Pulls";
  const isValidVal = (v) => v != null && (isAssist ? v > -1000 : v > 0);

  const historicalVals = days.filter(d => isValidVal(d.value)).map(d => d.value);
  if (historicalVals.length === 0) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
          <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 10 }}>—</span>
        </div>
        <div style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center", color: T.disabled, fontFamily: T.mono, fontSize: 10, border: `1px dashed ${T.cardBorder}`, borderRadius: 4 }}>no data in last 30 days</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9 }}>{days[0].date.slice(5)}</span>
          <span style={{ color: T.accentLight, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>Today</span>
        </div>
      </div>
    );
  }

  const first = historicalVals[0], last = historicalVals[historicalVals.length - 1];
  const lastDay = [...days].reverse().find(d => isValidVal(d.value));
  const lastDate = lastDay ? lastDay.date : null;

  const presentVals = days.filter(d => isValidVal(d.value)).map(d => d.value);
  let min = Math.min(...presentVals);
  let max = Math.max(...presentVals);

  const hasGoal = exerciseName === "Barbell Bench Press" && valueKey === "orm";
  const goalVal = 180;
  if (hasGoal) {
    max = Math.max(max, goalVal);
    min = Math.min(min, goalVal * 0.6);
  }
  const range = max - min || max || 1;
  const w = 280, h = 38, padX = 8, padY = 4;
  const totalSlots = days.length - 1;
  const dayX = (i) => padX + (i * (w - 2 * padX)) / totalSlots;
  const yFor = (v) => h - padY - ((v - min) / range) * (h - 2 * padY);

  const pts = days.map((d, i) => isValidVal(d.value) ? {
    x: dayX(i), y: yFor(d.value), value: d.value, isToday: d.isToday, isFuture: d.isFuture, date: d.date,
  } : null);
  const presentPts = pts.filter(Boolean);

  const linePath = presentPts.length > 1
    ? presentPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    : "";
  const areaPath = presentPts.length > 1
    ? `${linePath} L ${presentPts[presentPts.length-1].x.toFixed(1)} ${h} L ${presentPts[0].x.toFixed(1)} ${h} Z`
    : "";

  // Divide by |first| — assist-exercise 1RM series are negative, and a signed
  // denominator would flip the trend direction.
  const delta = first ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;
  const deltaColor = delta > 0 ? T.green : delta < 0 ? T.red : T.faint;
  const gradId = `spark-${label.replace(/[^a-z0-9]/gi, "")}-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 800, color: T.strong }}>
          {fmt(last)}
          {historicalVals.length > 1 && (
            <span style={{ color: deltaColor, fontWeight: 700, marginLeft: 6, fontSize: 10 }}>
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
            </span>
          )}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", height: h }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
        {hasGoal && (
          <g>
            <line x1={padX} y1={yFor(goalVal)} x2={w - padX} y2={yFor(goalVal)}
              stroke="rgba(239, 68, 68, 0.45)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={w - padX - 4} y={yFor(goalVal) + 9} font-size="7.5px" fill="rgba(239, 68, 68, 0.8)" font-weight="800" text-anchor="end">
              Goal: {goalVal} lb
            </text>
          </g>
        )}
        {[0, 7, 14, 21, 28].map(d => {
          const slotIdx = 29 - d;
          if (slotIdx < 0) return null;
          return (
            <line key={`g${d}`} x1={dayX(slotIdx)} y1={padY} x2={dayX(slotIdx)} y2={h - padY}
              stroke={d === 0 ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)"}
              strokeWidth={d === 0 ? 1 : 0.5}
              strokeDasharray={d === 0 ? "" : "2 3"} />
          );
        })}
        {presentPts.map((p, i) => {
          return (
            <g key={`p${i}`}>
              <circle cx={p.x} cy={p.y} r={p.isToday ? 3.2 : 2.4} fill={color}
                stroke={p.isToday ? "rgba(11,15,20,0.9)" : "none"} strokeWidth={p.isToday ? 1 : 0} />
              <circle cx={p.x} cy={p.y} r="8" fill="transparent"
                style={{ cursor: "default" }}
                onMouseEnter={(e) => showTip(e, `${p.date} · ${fmt(p.value)}${p.isToday ? " (today)" : ""}`)}
                onMouseLeave={hideTip} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ color: T.disabled, fontFamily: T.mono, fontSize: 9 }}>{days[0].date.slice(5)}</span>
        <span style={{ color: T.accentLight, fontFamily: T.mono, fontSize: 9, fontWeight: 800 }}>Today</span>
      </div>
    </div>
  );
}

export { Sparkline };
