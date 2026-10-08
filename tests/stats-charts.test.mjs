import * as volume from '../lib/exercise-volume.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as workoutRecap from '../lib/legacy/workout-recap.js';
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
      '@/lib/legacy/workout-recap': workoutRecap, '@/lib/exercise-volume': volume,
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
  assert.match(all, /Jan 10, 2025/);
  assert.match(all, /all time/);
  assert.equal((all.match(/fill="transparent"/g) || []).length, 3);
  assert.equal((recent.match(/fill="transparent"/g) || []).length, 2);
  assert.doesNotMatch(recent, /Jan 10/);
  assert.match(recent, /Aug 12/);
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

test('stats puts working volume above both 1RM charts and retains saved same-day best when no set is logged', () => {
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
  assert.match(markup, /Volume · last 30 days/);
  assert.match(markup, /All time/);
  assert.equal(charts.length, 3);
  assert.equal(charts[0].valueKey, 'value');
  assert.deepEqual(charts[0].data.map(point => point.value), [240, 150]);
  assert.ok(charts.slice(1).every(chart => chart.valueKey === 'orm'));
  assert.equal(charts[1].allTime, undefined);
  assert.equal(charts[2].allTime, true);
  assert.deepEqual(Array.from(charts[2].data, d => d.date), ['2024-01-01', '2026-09-10']);
  assert.equal(charts[2].data.at(-1).orm, 28);
  exercise.sets = [{ kind: 'work', completed: true, weight: 15, reps: 10 }];
  charts.length = 0;
  renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: sessions, statHistory }));
  assert.equal(charts[2].data.at(-1).orm, 28, 'A lighter live set must not lower the day’s best');
  exercise.sets = [{ kind: 'work', completed: true, weight: 25, reps: 12 }];
  charts.length = 0;
  renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: sessions, statHistory }));
  assert.equal(charts[2].data.at(-1).orm, 35, 'A stronger live set updates the graph immediately');
});

test('Dips stats look like every other lift: one 30-day chart and one all-time chart', () => {
  const charts = [];
  const { StatsPane } = load('../components/session/StatsPane.jsx', { './Sparkline': { Sparkline: props => {
    charts.push(props); return React.createElement('div', null, props.label);
  } } });
  const exercise = { name: 'Dips', repsOnly: true, beltLoad: true, sets: [{ kind: 'work', completed: false }] };
  const statHistory = { orm: { Dips: [{ date: '2025-03-01', orm: 12 }] }, wt: { Dips: [{ date: '2025-03-01', wt: 10 }] }, vol: {} };
  const markup = renderToStaticMarkup(React.createElement(StatsPane, { exercise, history: [], statHistory }));
  assert.match(markup, /All time/);
  const allTime = charts.filter(chart => chart.allTime).map(chart => chart.label);
  assert.deepEqual(allTime, ['Top reps']);
  assert.deepEqual(charts.map(chart => chart.label), ['Working reps', 'Top reps', 'Top reps']);
});

test('live volume replaces autosaved rows and incomplete work is marked so far', () => {
  const { StatsPane } = load('../components/session/StatsPane.jsx', { './Sparkline': { Sparkline } });
  const exercise = {name, equipment:'cable', sets:[{kind:'work',completed:true,weight:15,reps:10},{kind:'work',completed:false,weight:15,reps:null}]};
  const sessions = [{id:'current',date:'2026-09-10',sets:[{exercise:name,set_type:'working',weight_lb:20,reps:20}]}];
  const html = renderToStaticMarkup(React.createElement(StatsPane,{exercise,history:sessions,sessionId:'current'}));
  const volume = html.slice(html.indexOf('Volume · last 30 days'), html.indexOf('Progress · last 30 days'));
  assert.match(volume,/150 lb·reps/);
  assert.match(volume,/so far/);
  assert.doesNotMatch(volume,/400 lb·reps/);
});

test('volume retains separate points for two workouts on the same day', () => {
  const html = renderToStaticMarkup(React.createElement(Sparkline, { exerciseName:name,
    data:[{date:'2026-09-10',value:100},{date:'2026-09-10',value:200}],valueKey:'value',perWorkout:true,
    label:'Volume',color:'#C084FC',fmt:v=>`${v} lb·reps` }));
  assert.equal((html.match(/fill="transparent"/g)||[]).length,2);
});
