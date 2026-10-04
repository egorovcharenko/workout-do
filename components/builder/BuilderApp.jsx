"use client";
// Workout builder: edit every program workout (exercises, sets, reps, rest,
// warm-ups, supersets, names), drag exercises within and between workouts,
// and see each workout's length and the weekly sets per muscle it adds up to.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/db/api";
import { MAIN_WORKOUTS, estimateTemplateWorkoutDuration, workoutDisplayName } from "@/lib/legacy/shared";
import {
  PROGRAM_BUILDER_KEY, applyProgramBuilder, exerciseLibrary, normalizeSupersets, registerExerciseAliases,
  parseProgramBuilder, plannedWeeklyMuscleSets, workoutEntries,
} from "@/lib/program-builder";
import { baseExerciseName, variantName } from "@/lib/exercise-aliases";

const DEFAULT_NAMES = Object.fromEntries(MAIN_WORKOUTS.map(w => [w.id, workoutDisplayName(w.name)]));
const defaults = () => Object.fromEntries(MAIN_WORKOUTS.map(w => [w.id, { name: DEFAULT_NAMES[w.id], exercises: workoutEntries(w) }]));
const clock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const newGroupId = () => `g${Math.random().toString(36).slice(2, 8)}`;

function initialDraft(settings) {
  const saved = parseProgramBuilder(settings)?.workouts || {};
  const base = defaults();
  for (const id of Object.keys(base)) {
    if (saved[id]?.name) base[id].name = saved[id].name;
    if (Array.isArray(saved[id]?.exercises)) base[id].exercises = normalizeSupersets(saved[id].exercises);
  }
  return base;
}

// Only workouts that differ from the code program are stored, and only
// variants some workout still uses.
function toSaved(draft, aliases = {}) {
  const base = defaults();
  const workouts = {};
  for (const [id, w] of Object.entries(draft)) {
    const edit = {};
    const name = w.name.trim();
    if (name && name !== base[id].name) edit.name = name;
    if (JSON.stringify(w.exercises) !== JSON.stringify(base[id].exercises)) edit.exercises = w.exercises;
    if (Object.keys(edit).length) workouts[id] = edit;
  }
  const used = new Set(Object.values(draft).flatMap(w => w.exercises.map(e => e.name)));
  const kept = Object.fromEntries(Object.entries(aliases).filter(([alias]) => used.has(alias)));
  return { version: 1, workouts, ...(Object.keys(kept).length ? { aliases: kept } : {}) };
}

function NumberField({ value, onChange, label, step = 1, min = 0, width = 52, placeholder = "" }) {
  return (
    <input className="bld-num" style={{ width }} type="number" inputMode="decimal" aria-label={label} min={min} step={step}
      value={value ?? ""} placeholder={placeholder}
      onChange={e => onChange(e.target.value === "" ? null : Math.max(min, Number(e.target.value)))} />
  );
}

function VariantField({ entry, onVariant }) {
  const [label, setLabel] = useState("");
  const add = () => { if (label.trim() && onVariant(label.trim())) setLabel(""); };
  return (<>
    <div className="bld-editor-head"><span>Variant · own history and weights</span></div>
    <div className="bld-line">
      <input className="bld-variant-input" aria-label="Variant name" placeholder="e.g. Volume, Heavy" maxLength={24} value={label}
        onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
      <button className="bld-step" disabled={!label.trim()} onClick={add}>Add</button>
    </div>
    {label.trim() && <p className="bld-muted">Adds “{variantName(entry.name, label)}” below.</p>}
  </>);
}

function ExerciseEditor({ entry, onChange, onRemove, onMove, onVariant, moveTargets }) {
  const setRange = (i, k, v) => onChange({ ...entry, sets: entry.sets.map((r, j) => j !== i ? r : (() => {
    const next = [...(r || [8, 12])]; next[k] = v ?? 0; if (k === 0 && next[1] < next[0]) next[1] = next[0]; return next;
  })()) });
  return (
    <div className="bld-editor">
      <div className="bld-editor-head"><span>Sets · reps</span></div>
      {entry.sets.map((range, i) => (
        <div className="bld-line" key={i}>
          <span className="bld-idx">{i + 1}</span>
          {range ? (<>
            <NumberField label={`Set ${i + 1} minimum reps`} value={range[0]} min={1} onChange={v => setRange(i, 0, v)} />
            <span className="bld-dash">–</span>
            <NumberField label={`Set ${i + 1} maximum reps`} value={range[1]} min={1} onChange={v => setRange(i, 1, v)} />
            <span className="bld-unit">reps</span>
          </>) : (
            <button className="bld-text-btn" onClick={() => onChange({ ...entry, sets: entry.sets.map((r, j) => j === i ? [8, 12] : r) })}>1–2 RIR · set reps</button>
          )}
          <button className="bld-x" aria-label={`Remove set ${i + 1}`} disabled={entry.sets.length <= 1}
            onClick={() => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="bld-add-line" onClick={() => onChange({ ...entry, sets: [...entry.sets, entry.sets[entry.sets.length - 1]] })}>+ Set</button>

      <div className="bld-editor-head"><span>Rest between sets</span></div>
      <div className="bld-line">
        <button className="bld-step" aria-label="Less rest" onClick={() => onChange({ ...entry, rest: Math.max(15, entry.rest - 15) })}>−15s</button>
        <span className="bld-rest">{clock(entry.rest)}</span>
        <button className="bld-step" aria-label="More rest" onClick={() => onChange({ ...entry, rest: Math.min(600, entry.rest + 15) })}>+15s</button>
      </div>

      <div className="bld-editor-head"><span>Warm-ups</span></div>
      {entry.warmups.map((w, i) => (
        <div className="bld-line" key={i}>
          <span className="bld-idx">W{i + 1}</span>
          <NumberField label={`Warm-up ${i + 1} weight`} value={w.weight} step={2.5} width={64} placeholder="lb"
            onChange={v => onChange({ ...entry, warmups: entry.warmups.map((x, j) => j === i ? { ...x, weight: v } : x) })} />
          <span className="bld-unit">lb ×</span>
          <NumberField label={`Warm-up ${i + 1} reps`} value={w.reps} min={1}
            onChange={v => onChange({ ...entry, warmups: entry.warmups.map((x, j) => j === i ? { ...x, reps: v } : x) })} />
          <button className="bld-x" aria-label={`Remove warm-up ${i + 1}`}
            onClick={() => onChange({ ...entry, warmups: entry.warmups.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="bld-add-line" onClick={() => onChange({ ...entry, warmups: [...entry.warmups, { ...(entry.warmups[entry.warmups.length - 1] || { weight: null, reps: 5 }) }] })}>+ Warm-up</button>

      <VariantField entry={entry} onVariant={onVariant} />

      <div className="bld-editor-foot">
        <select className="bld-select" aria-label="Move to workout" value="" onChange={e => e.target.value && onMove(e.target.value)}>
          <option value="">Move to…</option>
          {moveTargets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="bld-danger" onClick={onRemove}>Remove exercise</button>
      </div>
    </div>
  );
}

function summary(entry) {
  const ranges = entry.sets.map(r => r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`) : "RIR");
  const unique = ranges.filter((r, i) => ranges.indexOf(r) === i);
  const warm = entry.warmups.length ? ` · ${entry.warmups.length} warm-up${entry.warmups.length > 1 ? "s" : ""}` : "";
  return `${entry.sets.length} × ${unique.join(" / ")} · ${clock(entry.rest)} rest${warm}`;
}

function AddExercise({ library, existing, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const names = [...library.keys()].filter(n => n.toLowerCase().includes(query.trim().toLowerCase())).sort();
  return (
    <div className="bld-sheet-backdrop" onClick={onClose}>
      <div className="bld-sheet" role="dialog" aria-label="Add exercise" onClick={e => e.stopPropagation()}>
        <div className="bld-sheet-head"><strong>Add exercise</strong><button className="bld-x" aria-label="Close" onClick={onClose}>×</button></div>
        <input className="bld-search" autoFocus placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="bld-sheet-list">
          {names.map(name => (
            <button key={name} className="bld-pick" disabled={existing.has(name)} onClick={() => onPick(name)}>
              {name}{existing.has(name) ? <span className="bld-unit"> · already in this workout</span> : null}
            </button>
          ))}
          {!names.length && <p className="bld-muted">No matches.</p>}
        </div>
      </div>
    </div>
  );
}

// Distinct hues for stacked segments, assigned by rank within each row.
const PART_COLORS = ["#60A5FA", "#34D399", "#F472B6", "#FBBF24", "#A78BFA", "#22D3EE", "#FB923C", "#A3E635", "#F87171", "#2DD4BF", "#E879F9", "#94A3B8"];

function MusclePanel({ workouts }) {
  const [open, setOpen] = useState(null);
  const muscles = plannedWeeklyMuscleSets(workouts);
  const color = i => PART_COLORS[i % PART_COLORS.length];
  const scale = Math.max(24, ...muscles.map(m => m.perWeek));
  const pct = v => `${Math.min(100, v / scale * 100).toFixed(2)}%`;
  return (
    <section className="bld-card bld-muscle-card" aria-label="Weekly sets per muscle">
      <h2 className="bld-h2">Sets per muscle · week <span className="bld-sub">by exercise · shaded = target · tap a row</span></h2>
      <ul className="bld-muscles">
        {muscles.map(m => (
          <li key={m.id} className={`bld-muscle-wrap bld-${m.status}`}>
            <button className="bld-muscle" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}
              title={`${m.label}: ${m.perWeek} sets/week (target ${m.target[0]}–${m.target[1]})`}>
              <span className="bld-muscle-name">{m.label}</span>
              <span className="bld-bar" aria-hidden="true">
                <span className="bld-band" style={{ left: pct(m.target[0]), width: `calc(${pct(m.target[1])} - ${pct(m.target[0])})` }} />
                <span className="bld-stack">
                  {m.parts.map((part, i) => (
                    <span key={part.name} title={`${part.name}: ${part.sets}`} style={{ width: pct(part.sets), background: color(i) }} />
                  ))}
                </span>
              </span>
              <span className="bld-muscle-value">{m.perWeek}</span>
            </button>
            {open === m.id && (
              <ul className="bld-parts">
                {m.parts.map((part, i) => (
                  <li key={part.name}><i style={{ background: color(i) }} /><span>{part.name}</span><b>{part.sets}</b></li>
                ))}
                {!m.parts.length && <li className="bld-muted">No exercises hit this muscle.</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="bld-muted">Rotation of {MAIN_WORKOUTS.length} workouts every 6 days. Secondary muscles count partially. Number colour: amber below target, red above.</p>
    </section>
  );
}

export default function BuilderApp() {
  const [draft, setDraft] = useState(null);
  const [aliases, setAliases] = useState({});
  const [savedJson, setSavedJson] = useState(null);
  const [open, setOpen] = useState(null); // "workoutId:index"
  const [adding, setAdding] = useState(null);
  const [status, setStatus] = useState("");
  const [drag, setDrag] = useState(null); // { from: {w, i}, name, x, y, over: {w, i} }
  const dragRef = useRef(null);
  const columnsRef = useRef(null);
  const library = useMemo(() => { registerExerciseAliases(aliases); return exerciseLibrary(); }, [aliases]);

  useEffect(() => {
    api.settings().then(settings => {
      window.USER_SETTINGS = settings;
      const d = initialDraft(settings);
      const savedAliases = parseProgramBuilder(settings)?.aliases || {};
      registerExerciseAliases(savedAliases);
      setAliases(savedAliases);
      setDraft(d);
      setSavedJson(JSON.stringify(toSaved(d, savedAliases)));
    }).catch(() => setStatus("Could not load your workouts. Reload to try again."));
  }, []);

  const applied = useMemo(() => draft
    ? applyProgramBuilder(MAIN_WORKOUTS, { aliases, workouts: Object.fromEntries(Object.entries(draft).map(([id, w]) => [id, { exercises: w.exercises }])) })
    : [], [draft, aliases]);
  const dirty = draft && JSON.stringify(toSaved(draft, aliases)) !== savedJson;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id, fn) => setDraft(d => ({ ...d, [id]: { ...d[id], exercises: normalizeSupersets(fn(d[id].exercises)) } }));

  const move = (from, to) => setDraft(d => {
    const entry = d[from.w].exercises[from.i];
    if (from.w !== to.w && d[to.w].exercises.some(e => e.name === entry.name)) {
      setStatus(`${entry.name} is already in ${d[to.w].name}.`);
      return d;
    }
    const next = { ...d };
    const source = d[from.w].exercises.filter((_, j) => j !== from.i);
    let index = to.i;
    if (from.w === to.w && from.i < to.i) index -= 1;
    const target = from.w === to.w ? source : [...d[to.w].exercises];
    // Dropping inside a superset joins it; anywhere else it stands alone.
    const before = target[index - 1], after = target[index];
    const joins = before?.superset && before.superset === after?.superset ? before.superset : null;
    target.splice(index, 0, { ...entry, superset: joins });
    next[from.w] = { ...d[from.w], exercises: normalizeSupersets(from.w === to.w ? target : source) };
    if (from.w !== to.w) next[to.w] = { ...d[to.w], exercises: normalizeSupersets(target) };
    return next;
  });

  // Pointer-based drag so it works with touch as well as a mouse.
  const dropTarget = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-drop]");
    if (!el) return null;
    const w = el.getAttribute("data-w");
    const i = Number(el.getAttribute("data-i"));
    if (el.getAttribute("data-drop") === "end") return { w, i };
    const rect = el.getBoundingClientRect();
    return { w, i: y > rect.top + rect.height / 2 ? i + 1 : i };
  };
  const startDrag = (e, w, i) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setOpen(null);
    const state = { from: { w, i }, name: draft[w].exercises[i].name, x: e.clientX, y: e.clientY, over: { w, i } };
    dragRef.current = state;
    setDrag(state);
  };
  const moveDrag = e => {
    if (!dragRef.current) return;
    const over = dropTarget(e.clientX, e.clientY) || dragRef.current.over;
    dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY, over };
    setDrag(dragRef.current);
    if (e.clientY < 60) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
    // Columns scroll sideways on narrow screens: drag to an edge to reach the next one.
    const cols = columnsRef.current;
    if (cols) { const r = cols.getBoundingClientRect(); if (e.clientX < r.left + 40) cols.scrollBy(-14, 0); else if (e.clientX > r.right - 40) cols.scrollBy(14, 0); }
  };
  const endDrag = () => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!state?.over) return;
    const { from, over } = state;
    if (from.w === over.w && (over.i === from.i || over.i === from.i + 1)) return;
    move(from, over);
  };

  const toggleSuperset = (id, i) => update(id, list => {
    const a = list[i], b = list[i + 1];
    const linked = a.superset && a.superset === b.superset;
    if (linked) {
      // Split the group between i and i+1.
      const tail = newGroupId();
      return list.map((e, j) => j > i && e.superset === a.superset ? { ...e, superset: tail } : e);
    }
    const group = a.superset || b.superset || newGroupId();
    return list.map((e, j) => (j === i || j === i + 1 || (e.superset && (e.superset === a.superset || e.superset === b.superset)))
      ? { ...e, superset: group } : e);
  });

  const save = async () => {
    setStatus("Saving…");
    const saved = toSaved(draft, aliases);
    const value = JSON.stringify(saved);
    try {
      await api.saveSettings({ [PROGRAM_BUILDER_KEY]: value });
      window.USER_SETTINGS = { ...(window.USER_SETTINGS || {}), [PROGRAM_BUILDER_KEY]: value };
      setSavedJson(value);
      setStatus("Saved. Your next workouts use these changes.");
    } catch {
      setStatus("Could not save. Check your connection and try again.");
    }
  };

  if (!draft) return <main className="bld-page"><p className="bld-muted">{status || "Loading…"}</p></main>;

  return (
    <main className="bld-page" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <header className="bld-header">
        <Link className="bld-back" href="/" aria-label="Back to workouts">‹ Workouts</Link>
        <h1>Workout builder</h1>
      </header>

      <div className="bld-columns" ref={columnsRef}>
      {MAIN_WORKOUTS.map((base, wIdx) => {
        const w = draft[base.id];
        const minutes = Math.round(estimateTemplateWorkoutDuration(applied[wIdx]) / 60);
        const totalSets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
        const moveTargets = MAIN_WORKOUTS.filter(t => t.id !== base.id).map(t => ({ id: t.id, name: draft[t.id].name }));
        const changed = JSON.stringify(w) !== JSON.stringify(defaults()[base.id]);
        return (
          <section key={base.id} className="bld-card bld-workout" aria-label={w.name}>
            <div className="bld-workout-head">
              <input className="bld-name" aria-label="Workout name" value={w.name} maxLength={40}
                onChange={e => setDraft(d => ({ ...d, [base.id]: { ...d[base.id], name: e.target.value } }))} />
              <span className="bld-total">{minutes} min</span>
            </div>
            <p className="bld-muted">{w.exercises.length} exercises · {totalSets} working sets{changed ? (
              <> · <button className="bld-text-btn" onClick={() => setDraft(d => ({ ...d, [base.id]: defaults()[base.id] }))}>Reset</button></>) : null}</p>
            <ol className="bld-list">
              {w.exercises.map((entry, i) => {
                const key = `${base.id}:${i}`;
                const next = w.exercises[i + 1];
                const linked = next && entry.superset && entry.superset === next.superset;
                const indicator = drag?.over?.w === base.id && drag.over.i === i;
                const isDragged = drag?.from.w === base.id && drag.from.i === i;
                return (
                  <li key={`${entry.name}-${i}`} className={`bld-item${entry.superset ? " bld-in-superset" : ""}${isDragged ? " bld-dragging" : ""}${indicator ? " bld-drop-before" : ""}`}
                    data-drop="row" data-w={base.id} data-i={i}>
                    <div className="bld-row">
                      <button className="bld-handle" aria-label={`Drag ${entry.name}`} onPointerDown={e => startDrag(e, base.id, i)}>⋮⋮</button>
                      <button className="bld-row-main" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                        <span className="bld-ex-name">{entry.name}</span>
                        <span className="bld-ex-meta">{summary(entry)}</span>
                      </button>
                      <span className="bld-order">
                        <button aria-label="Move up" disabled={i === 0} onClick={() => move({ w: base.id, i }, { w: base.id, i: i - 1 })}>↑</button>
                        <button aria-label="Move down" disabled={i === w.exercises.length - 1} onClick={() => move({ w: base.id, i }, { w: base.id, i: i + 2 })}>↓</button>
                      </span>
                    </div>
                    {open === key && (
                      <ExerciseEditor entry={entry} moveTargets={moveTargets}
                        onChange={nextEntry => update(base.id, list => list.map((e, j) => j === i ? nextEntry : e))}
                        onRemove={() => { setOpen(null); update(base.id, list => list.filter((_, j) => j !== i)); }}
                        onVariant={label => {
                          const name = variantName(entry.name, label);
                          if (library.has(name) || Object.values(draft).some(x => x.exercises.some(e => e.name === name))) {
                            setStatus(`${name} already exists.`);
                            return false;
                          }
                          setAliases(a => ({ ...a, [name]: baseExerciseName(entry.name) }));
                          update(base.id, list => [...list.slice(0, i + 1), { ...entry, name, superset: null }, ...list.slice(i + 1)]);
                          setOpen(`${base.id}:${i + 1}`);
                          setStatus(`Added ${name}. It keeps its own weights and history.`);
                          return true;
                        }}
                        onMove={to => { setOpen(null); move({ w: base.id, i }, { w: to, i: draft[to].exercises.length }); }} />
                    )}
                    {next && (
                      <button className={`bld-link${linked ? " bld-linked" : ""}`} onClick={() => toggleSuperset(base.id, i)}
                        aria-label={linked ? `Unlink ${entry.name} and ${next.name}` : `Superset ${entry.name} with ${next.name}`}>
                        {linked ? "Superset · unlink" : "+ Superset"}
                      </button>
                    )}
                  </li>
                );
              })}
              <li className={`bld-end${drag?.over?.w === base.id && drag.over.i === w.exercises.length ? " bld-drop-before" : ""}`}
                data-drop="end" data-w={base.id} data-i={w.exercises.length}>
                <button className="bld-add" onClick={() => setAdding(base.id)}>+ Add exercise</button>
              </li>
            </ol>
          </section>
        );
      })}
      </div>

      <MusclePanel workouts={applied} />

      <div className="bld-savebar">
        <span className="bld-status" role="status">{status || (dirty ? "Unsaved changes" : "All changes saved")}</span>
        <button className="bld-save" disabled={!dirty} onClick={save}>Save</button>
      </div>

      {drag && <div className="bld-ghost" style={{ left: drag.x, top: drag.y }}>{drag.name}</div>}
      {adding && (
        <AddExercise library={library} existing={new Set(draft[adding].exercises.map(e => e.name))} onClose={() => setAdding(null)}
          onPick={name => {
            const base = library.get(name);
            const entry = MAIN_WORKOUTS.flatMap(w => workoutEntries(w)).find(e => e.name === name)
              || { name, sets: [[8, 12], [8, 12], [8, 12]], rest: Math.min(base?.rest || 75, 120), warmups: [], superset: null };
            update(adding, list => [...list, { ...entry, superset: null }]);
            setAdding(null);
          }} />
      )}
    </main>
  );
}
