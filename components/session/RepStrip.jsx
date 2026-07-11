"use client";
import { useState, useEffect, useRef } from "react";
import { T } from "@/lib/legacy/shared";

// ─── file: workout-session-repstrip.js ───

function RepCell({ n, inRange, isLast, isLogged, onClick, compact = false }) {
  let bg = "transparent";
  let color = inRange ? "#D1D5DB" : T.faint;
  let border = "1px solid transparent";
  if (inRange) {
    bg = "rgba(34,197,94,0.05)";
    border = "1px solid rgba(34,197,94,0.18)";
  }
  if (isLast) {
    border = "1.5px solid rgba(34,197,94,0.55)";
    color = "#86EFAC";
  }
  if (isLogged) {
    bg = "#22C55E";
    border = "1px solid #22C55E";
    color = T.inv;
  }
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", width: compact ? 34 : 38, height: compact ? 38 : 44, borderRadius: compact ? 8 : 9,
        background: bg, border, color,
        fontFamily: T.mono, fontWeight: isLogged || isLast ? 800 : 600, fontSize: compact ? 13 : 14,
        cursor: "pointer", flexShrink: 0,
        transition: "transform 80ms ease, background 120ms ease",
        animation: isLogged ? "set-pulse 320ms ease-out" : "none",
      }}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.92)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      {isLast && !isLogged && (
        <span style={{ position: "absolute", top: 4, left: 5, width: 5, height: 5, borderRadius: "50%", background: "#22C55E" }} />
      )}
      {n}
    </button>
  );
}

function RepStrip({ min = 1, max = 20, range, last, logged, onLog, compact = false }) {
  const [lo, hi] = range || [];
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: true });
  const updateEdges = () => {
    const el = ref.current; if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges(p => (p.left === left && p.right === right ? p : { left, right }));
  };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const target = el.querySelector(`[data-n="${logged ?? last ?? lo ?? min}"]`);
    if (target) {
      const left = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
      el.scrollTo({ left, behavior: "instant" });
    }
    updateEdges();
  }, []);
  const fadePx = 28;
  const maskParts = [
    edges.left ? `transparent 0, black ${fadePx}px` : `black 0`,
    edges.right ? `black calc(100% - ${fadePx}px), transparent 100%` : `black 100%`,
  ];
  const maskImage = `linear-gradient(to right, ${maskParts.join(", ")})`;
  return (
    <div style={{ position: "relative", marginTop: compact ? 3 : 6 }}>
      <div
        ref={ref}
        onScroll={updateEdges}
        className="scroll-row"
        style={{
          display: "flex", gap: 5, overflowX: "auto",
          padding: compact ? "5px 4px 3px" : "8px 4px 6px",
          WebkitOverflowScrolling: "touch",
          WebkitMaskImage: maskImage, maskImage,
        }}
      >
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(n => {
          const inRange = lo != null && n >= lo && n <= hi;
          return (
            <div key={n} data-n={n}>
              <RepCell n={n} inRange={inRange} isLast={last === n && logged !== n} isLogged={logged === n} onClick={() => onLog(n)} compact={compact} />
            </div>
          );
        })}
      </div>
      <div aria-hidden style={{
        position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)",
        width: 22, height: 22, borderRadius: 11,
        background: "rgba(17,24,39,0.92)", border: "1px solid #374151",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#D1D5DB", fontSize: 14, fontWeight: 800, fontFamily: T.mono, lineHeight: 1,
        opacity: edges.left ? 1 : 0, transition: "opacity 160ms ease",
        pointerEvents: "none", animation: edges.left ? "repNudgeL 2.4s ease-in-out infinite" : "none",
      }}>‹</div>
      <div aria-hidden style={{
        position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
        width: 22, height: 22, borderRadius: 11,
        background: "rgba(17,24,39,0.92)", border: "1px solid #374151",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#D1D5DB", fontSize: 14, fontWeight: 800, fontFamily: T.mono, lineHeight: 1,
        opacity: edges.right ? 1 : 0, transition: "opacity 160ms ease",
        pointerEvents: "none", animation: edges.right ? "repNudgeR 2.4s ease-in-out infinite" : "none",
      }}>›</div>
    </div>
  );
}

export { RepCell, RepStrip };
