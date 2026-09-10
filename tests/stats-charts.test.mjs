import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as shared from '../lib/legacy/shared.js';
import * as standards from '../lib/legacy/standards.js';
import * as deload from '../lib/deload-progress.js';
import * as cable from '../lib/legacy/cable-stack.js';
import * as belt from '../lib/legacy/belt-load.js';
import * as display from '../lib/legacy/history-set-display.js';
import * as history from '../lib/legacy/exercise-session-history.js';

function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, window: {}, require: id => {
    const deps = { react: React, 'react/jsx-runtime': jsxRuntime,
      '@/lib/legacy/shared': { ...shared, localDate: () => '2026-09-10' },
      '@/lib/legacy/standards': standards, '@/lib/deload-progress': deload,
      '@/lib/legacy/cable-stack': cable, '@/lib/legacy/belt-load': belt,
      '@/lib/legacy/history-set-display': display, '@/lib/legacy/exercise-session-history': history,
      ...dependencies };
    assert.ok(id in deps, id);
    return deps[id];
  } });
  return exports;
}
const { Sparkline } = load('../components/session/Sparkline.jsx');
const name = 'Single-Arm Cable Lateral Raise';
const renderChart = (data, allTime = false) => renderToStaticMarkup(React.createElement(Sparkline, {
  exerciseName: name, data, valueKey: 'orm', color: '#34D399', label: '1RM EST', fmt: n => `${n} lb`, allTime,
}));

test('all-time 1RM includes older years with a chronological axis while recent 1RM stays at 30 days', () => {
  const data = [{ date: '2025-01-10', orm: 10 }, { date: '2026-08-15', orm: 20 }, { date: '2026-09-10', orm: 22 }];
  const all = renderChart(data, true);
  const recent = renderChart(data);
  assert.match(all, /2025-01-10/);
  assert.match(all, /all time/);
  assert.equal((all.match(/fill="transparent"/g) || []).length, 3);
  assert.equal((recent.match(/fill="transparent"/g) || []).length, 2);
  assert.doesNotMatch(recent, /2025-01-10/);
  assert.match(recent, /08-12/);
  assert.doesNotMatch(all, /NaN|Infinity/);
  const xs = [...all.matchAll(/<circle cx="([\d.]+)"[^>]*fill="transparent"/g)].map(m => Number(m[1]));
  assert.equal(xs[0], 8);
  assert.equal(xs[2], 272);
  assert.ok(xs[1] > 250, 'Recent dates must not be spread evenly across the full multi-year range');
});

test('all-time handles old-only history, a single point, and empty or invalid series', () => {
  assert.match(renderChart([{ date: '2025-01-01', orm: 20 }], true), /20 lb/);
  assert.match(renderChart([{ date: '2025-01-01', orm: 20 }]), /no data in last 30 days/);
  const single = renderChart([{ date: '2026-09-10', orm: 20 }], true);
  assert.doesNotMatch(single, /NaN|Infinity/);
  assert.match(single, /cx="272"/);
  assert.match(renderChart([], true), /no history yet/);
  assert.match(renderChart([{ date: 'invalid', orm: 20 }, { date: '2027-01-01', orm: 20 }, { date: '2025-01-01', orm: NaN }], true), /no history yet/);
});

test('stats replaces volume with all-time 1RM and retains saved same-day best when no set is logged', () => {
  const charts = [];
  const { StatsPane } = load('../components/session/StatsPane.jsx', { './Sparkline': { Sparkline: props => {
    charts.push(props); return React.createElement('div', null, props.label);
  } } });
  const session = (id, date, weight, reps) => ({ id, date, workout_name: 'Shrugs Focus', sets: [{
    exercise: name, set_type: 'working', set_number: 1, reps: String(reps), weight_lb: weight,
  }] });
  const exercise = { name, equipment: 'cable', sets: [{ kind: 'work', completed: false }] };
  const sessions = [session('today-high', '2026-09-10', 20, 12), session('today-low', '2026-09-10', 15, 10)];
  const statHistory = { orm: { [name]: [{ date: '2024-01-01', orm: 10 }] } };
  const markup = renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: sessions, statHistory }));
  assert.doesNotMatch(markup, /VOLUME/);
  assert.match(markup, /ALL TIME/);
  assert.equal(charts.length, 2);
  assert.ok(charts.every(chart => chart.valueKey === 'orm'));
  assert.equal(charts[0].allTime, undefined);
  assert.equal(charts[1].allTime, true);
  assert.deepEqual(Array.from(charts[1].data, d => d.date), ['2024-01-01', '2026-09-10']);
  assert.equal(charts[1].data.at(-1).orm, 28);
  exercise.sets = [{ kind: 'work', completed: true, weight: 15, reps: 10 }];
  charts.length = 0;
  renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: sessions, statHistory }));
  assert.equal(charts[1].data.at(-1).orm, 28, 'A lighter live set must not lower the day’s best');
  exercise.sets = [{ kind: 'work', completed: true, weight: 25, reps: 12 }];
  charts.length = 0;
  renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: sessions, statHistory }));
  assert.equal(charts[1].data.at(-1).orm, 35, 'A stronger live set updates the graph immediately');
});
