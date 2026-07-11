"use client";
import { T } from "@/lib/legacy/shared";

// ─── file: workout-session-stepper.js ───

function StepperBtn({ children, onClick, big, dim, compact = false }) {
  const press = (e, val) => { e.currentTarget.style.transform = val; };
  const size = big ? (compact ? 44 : 52) : (compact ? 34 : 40);
  return (
    <button
      onClick={onClick}
      onMouseDown={e => press(e, "scale(0.92)")}
      onMouseUp={e => press(e, "scale(1)")}
      onMouseLeave={e => press(e, "scale(1)")}
      onTouchStart={e => press(e, "scale(0.92)")}
      onTouchEnd={e => press(e, "scale(1)")}
      style={{
        width: size, height: size, borderRadius: compact ? 10 : 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: dim ? T.faint : "#D1D5DB",
        fontFamily: T.mono, fontWeight: 600, fontSize: big ? (compact ? 19 : 22) : (compact ? 12 : 14),
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, lineHeight: 1,
        transition: "transform 80ms ease, background 120ms ease",
      }}
    >{children}</button>
  );
}

function WeightStepper({ value, last, pr, onPick, label, compact = false }) {
  const v = parseFloat(value ?? last ?? 0);
  const step = (delta) => onPick(Math.max(0, Math.round((v + delta) * 100) / 100));
  const atLast = last != null && parseFloat(v) === parseFloat(last);
  const diff = last != null ? v - last : 0;
  return (
    <div style={{ marginTop: compact ? 9 : 14 }}>
      {label && (
        <div style={{ marginBottom: 6, color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10 }}>
        <StepperBtn onClick={() => step(-5)} big compact={compact}>−</StepperBtn>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ color: T.strong, fontFamily: T.mono, fontSize: compact ? 30 : 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{v}</span>
            <span style={{ color: T.faint, fontFamily: T.mono, fontSize: compact ? 12 : 14, fontWeight: 600 }}>lb</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: T.mono, fontSize: 11, color: T.faint }}>
            {last != null && (
              <button onClick={() => onPick(last)} style={{
                background: atLast ? "rgba(96,165,250,0.10)" : "transparent",
                border: atLast ? `1px solid rgba(96,165,250,0.3)` : "1px dashed rgba(255,255,255,0.1)",
                color: atLast ? T.accentLight : T.faint,
                fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                padding: "3px 7px", borderRadius: 5, cursor: "pointer",
              }}>LAST {last}</button>
            )}
            {!atLast && diff !== 0 && (
              <span style={{ color: diff > 0 ? T.green : T.red, fontWeight: 700 }}>
                {diff > 0 ? "+" : ""}{diff}
              </span>
            )}
            {pr != null && <span>· PR {pr}</span>}
          </div>
        </div>
        <StepperBtn onClick={() => step(5)} big compact={compact}>+</StepperBtn>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: compact ? 5 : 6, marginTop: compact ? 6 : 8 }}>
        <StepperBtn onClick={() => step(-2.5)} dim compact={compact}>−2.5</StepperBtn>
        <StepperBtn onClick={() => step(2.5)} dim compact={compact}>+2.5</StepperBtn>
      </div>
    </div>
  );
}

function GripSelector({ grips, selected, last, onPick }) {
  if (!grips || grips.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>GRIP</span>
        {last && last !== selected && (
          <button onClick={() => onPick(last)} style={{ background: "transparent", border: 0, color: T.accentLight, fontFamily: T.mono, fontSize: 11, fontWeight: 700, padding: 0, cursor: "pointer" }}>
            use last: {last}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${grips.length}, 1fr)`, gap: 6 }}>
        {grips.map(g => {
          const sel = g.id === selected;
          const wasLast = g.id === last;
          return (
            <button key={g.id} onClick={() => onPick(g.id)} style={{
              position: "relative",
              background: sel ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.03)",
              border: sel ? `1px solid ${T.accentLight}` : "1px solid rgba(255,255,255,0.08)",
              color: sel ? "#DBEAFE" : T.muted,
              padding: "9px 4px 8px", borderRadius: 8, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              transition: "all 120ms ease",
            }}>
              {wasLast && (
                <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: T.accentLight }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{g.label}</span>
              <span style={{ fontSize: 9, color: sel ? T.muted : T.faint, fontFamily: T.mono, letterSpacing: 0.4, textTransform: "uppercase" }}>{g.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BandsGrid({ bands, lastBands, onToggle, onClear, isAssist }) {
  const total = bands.reduce((a, b) => a + b, 0);
  const showUseLast = lastBands.length > 0 && !(lastBands.length === bands.length && lastBands.every(b => bands.includes(b)));
  const bandValues = [5, 15, 20, 30, 35]; // yellow, green, red, blue, black

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>
          {isAssist ? "ASSISTANCE" : "BANDS"} <span style={{ color: T.faint, fontWeight: 500 }}>· tap to add</span>
        </span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {showUseLast && (
            <button onClick={() => onToggle("__use_last__")} style={{ background: "transparent", border: 0, color: T.bands, fontFamily: T.mono, fontSize: 11, fontWeight: 700, padding: 0, cursor: "pointer" }}>
              use last: {lastBands.join("+")}
            </button>
          )}
          {bands.length > 0 && (
            <button onClick={onClear} style={{ background: "transparent", border: 0, color: T.faint, fontSize: 11, padding: 0, cursor: "pointer" }}>clear</button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {bandValues.map(v => {
          const sel = bands.includes(v);
          const wasLast = lastBands.includes(v);
          return (
            <button key={v} onClick={() => onToggle(v)} style={{
              position: "relative",
              background: sel ? "rgba(192,132,252,0.18)" : "rgba(255,255,255,0.03)",
              border: sel ? `1px solid ${T.bands}` : "1px solid rgba(255,255,255,0.08)",
              color: sel ? T.bandsText : T.muted,
              fontFamily: T.mono, fontWeight: 700, fontSize: 13,
              padding: "9px 0", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 120ms ease",
            }}>
              {wasLast && (
                <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: T.bands }} />
              )}
              {v}
            </button>
          );
        })}
      </div>
      {bands.length > 0 && (
        <div style={{ marginTop: 8, color: T.bands, fontFamily: T.mono, fontSize: 11, opacity: 0.85 }}>
          {bands.join(" + ")} = {isAssist ? "−" : "+"}{total}lb
        </div>
      )}
    </div>
  );
}

export { StepperBtn, WeightStepper, GripSelector, BandsGrid };
