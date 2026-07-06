import { useState, useEffect, useRef } from "react";
import { LS_PREFIX } from "@/lib/legacy/shared";

// ─── file: workout-session-hooks.js ───

function useWorkoutTimers(workoutId, exercises) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [rest, setRest] = useState(null);  // { total, left, eIdx, sIdx, kind, paused }

  const lastInteractionRef = useRef(Date.now());
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

  // Reset/restore timer states when workoutId changes
  useEffect(() => {
    setElapsed(0);
    setRunning(false);
    setStartedAt(null);
    setRest(null);

    if (!workoutId) return;

    const savedRestRaw = localStorage.getItem(`${LS_PREFIX}v2-rest-timer:${workoutId}`);
    if (savedRestRaw) {
      try {
        const savedRest = JSON.parse(savedRestRaw);
        if (savedRest && (savedRest.paused || savedRest.endAt > Date.now())) {
          const left = savedRest.paused ? savedRest.left : Math.max(0, Math.ceil((savedRest.endAt - Date.now()) / 1000));
          if (left > 0) {
            setRest({ ...savedRest, left });
          }
        } else {
          localStorage.removeItem(`${LS_PREFIX}v2-rest-timer:${workoutId}`);
        }
      } catch (_) {}
    }
  }, [workoutId]);

  // Persist rest timer state to localStorage whenever it changes
  useEffect(() => {
    if (!workoutId) return;
    const key = `${LS_PREFIX}v2-rest-timer:${workoutId}`;
    if (rest) {
      localStorage.setItem(key, JSON.stringify(rest));
    } else {
      localStorage.removeItem(key);
    }
  }, [rest, workoutId]);

  // Elapsed timer based on wall time. Ticks every 1s when startedAt is set.
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Rest timer ticks every 1s while not paused and not finished.
  useEffect(() => {
    if (!rest || rest.paused || rest.left === 0) return;
    const id = setInterval(() => {
      setRest(r => {
        if (!r || r.paused || r.left === 0) return r;
        const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
        return { ...r, left };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [
    rest && rest.paused,
    rest && rest.left === 0,
    rest && rest.eIdx,
    rest && rest.sIdx,
    rest === null
  ]);

  // Immediately re-sync the rest timer when tab gains focus or screen turns on
  useEffect(() => {
    const resync = () => {
      setRest(r => {
        if (!r || r.paused || r.left === 0) return r;
        const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
        return { ...r, left };
      });
    };
    const onVisible = () => { if (!document.hidden) resync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resync);
    };
  }, []);

  // Migrate the rest timer to wherever the active set currently lives.
  useEffect(() => {
    if (!rest) return;
    const activeExIdx = exercises.findIndex(e => e.sets.some(s => s.active));
    if (activeExIdx === -1) return;
    if (activeExIdx === rest.eIdx) return;
    setRest(r => r ? { ...r, eIdx: activeExIdx } : r);
  }, [exercises, rest && rest.eIdx]);

  const startTimer = () => {
    lastInteractionRef.current = Date.now();
    if (!running) setRunning(true);
    if (!startedAt) {
      setStartedAt(Date.now() - (elapsed || 0) * 1000);
    }
  };

  const restAdd = (sec) => setRest(r => {
    if (!r) return r;
    const newLeft = Math.max(0, r.left + sec);
    const newTotal = Math.max(r.total, newLeft);
    const endAt = r.paused ? 0 : Date.now() + newLeft * 1000;
    return { ...r, left: newLeft, total: newTotal, endAt };
  });

  const restSkip = () => setRest(null);

  const restToggle = () => setRest(r => {
    if (!r) return r;
    const paused = !r.paused;
    const endAt = paused ? 0 : Date.now() + r.left * 1000;
    return { ...r, paused, endAt };
  });

  return {
    elapsed,
    running: startedAt !== null,
    startedAt,
    rest,
    setElapsed,
    setRunning: () => {},
    setStartedAt,
    setRest,
    startTimer,
    restAdd,
    restSkip,
    restToggle
  };
}

export { useWorkoutTimers };
