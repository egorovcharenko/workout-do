import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap1rmTrends, recapTrendSession, recapMonthlyChanges, renderRecap1rm } from '../lib/legacy/recap-1rm.js';
import { renderLatestWorkoutRecap } from '../components/home/recap.js';
const name = 'Barbell Bench Press';
const row = (weight, reps, extra = {}) => ({ exercise: name, weight_lb: weight, reps, set_type: 'working', ...extra });
const session = (id, date, sets, extra = {}) => ({ id, date, sets, workout_name: 'Strength A', finished_at: `${date}T19:00:00Z`, ...extra });

test('monthly change uses month-end results, handles gaps and never mutates history', () => {
  const points = [
    { date:'2026-01-05', value:190 }, { date:'2025-12-20', value:200 },
    { date:'2025-12-01', value:180 }, { date:'2026-01-25', value:195 },
    { date:'2026-03-01', value:210 }, { date:'2026-04-02', value:210 },
    { date:'2026-06-01', value:215 }, { date:'2026-06-20', value:218.3 },
    { date:'2026-02-30', value:999 }, { date:'2026-02-01', value:Infinity },
  ];
  const before = structuredClone(points);
  const months = recapMonthlyChanges(points);
  assert.deepEqual(months.map(({month,delta})=>[month,delta]), [
    ['2025-12',20], ['2026-01',-5], ['2026-03',null], ['2026-04',0], ['2026-06',3.3],
  ]);
  assert.equal(months[1].fromDate, '2025-12-20');
  assert.equal(months[4].fromDate, '2026-06-01');
  assert.deepEqual(points,before);
});

test('monthly bars align with calendar spans below both lines, even on the first day of a month', () => {
  const points = [
    { date:'2024-01-01', value:180, maxWeight:150 },
    { date:'2024-01-31', value:190, maxWeight:160 },
    { date:'2024-02-29', value:185, maxWeight:155 },
    { date:'2024-03-01', value:195, maxWeight:165 },
  ];
  const html = renderRecap1rm(points);
  const bars = [...html.matchAll(/<rect class="recap-month-change (gain|loss)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  assert.equal(bars.length,3);
  assert.deepEqual(bars.map(m=>m[1]),['gain','loss','gain']);
  assert.deepEqual(bars.map(m=>Number(m[5])),[11,5.5,11]);
  assert.equal(Number(bars[1][3]),14,'Losses extend below zero');
  assert.ok(Number(bars[1][4]) < Number(bars[0][4]),'Leap February spans 29 days versus January 31');
  assert.ok(Number(bars[2][4]) > 0,'The latest month remains visible on day one');
  assert.ok(html.indexOf('class="recap-month-bars"') > html.indexOf('</svg>'));
  assert.doesNotMatch(html.slice(0,html.indexOf('</svg>')), /recap-month-change/);
  assert.match(html,/2024-02: estimated 1RM -5 lb/);
  assert.match(html,/stroke-dasharray="4 3"/);
  assert.doesNotMatch(html,/NaN|Infinity/);
  assert.doesNotMatch(renderRecap1rm([{date:'2026-09-01',value:180}]),/class="recap-month-bars"/);
  assert.doesNotMatch(renderRecap1rm([{date:'2026-08-01',value:180},{date:'2026-09-01',value:180}]),/class="recap-month-bars"/);
});

test('all-time recap trend uses the best working set per workout and replaces current autosave exactly once', () => {
  const old = session('old', '2025-01-01', [row(160,3), row(150,3), row(200,10,{set_type:'warmup'})]);
  const previous = session('previous','2026-09-12',[row(145,7)]);
  const stale = session('today','2026-09-18',[row(135,5)]);
  const future = session('future','2026-09-19',[row(300,10)]);
  const current = session('today','2026-09-18',[row(150,6),row(145,7),row(200,'5–8'),row(999,12,{completed:false})]);
  const history = [stale,previous,old,future,old];
  const before = JSON.stringify({history,current});
  const points = buildRecap1rmTrends(history,current)[name];
  assert.deepEqual(points.map(p=>p.value),[176,178.8,180]);
  assert.deepEqual(points.map(p=>p.maxWeight),[160,145,150]);
  assert.deepEqual(points.map(p=>p.date),['2025-01-01','2026-09-12','2026-09-18']);
  assert.equal(JSON.stringify({history,current}),before);
  const html = renderLatestWorkoutRecap([old,previous,current],[],'2026-09-18');
  assert.match(html,/Estimated 1RM across 3 workouts, latest 180 lb/);
  assert.match(html,/1RM EST/);
});

test('live and stored charts agree, including legacy cable totals and current per-stack loads', () => {
  const exercises = [{name:'Low Row',equipment:'cable',sets:[
    {kind:'work',weight:60,reps:10,completed:true},
    {kind:'work',weight:100,reps:20,completed:false},
    {kind:'work',weight:100,reps:20,completed:true,userSkipped:true},
  ]}];
  const current = recapTrendSession(exercises,'2026-09-18','now');
  const legacy = session('old','2026-07-01',[row(120,10,{exercise:'Low Row'})]);
  const points=buildRecap1rmTrends([legacy],current)['Low Row'];
  assert.deepEqual(points.map(p=>p.value),[160,160]);
  const html=renderRecap1rm(points);
  assert.doesNotMatch(html,/NaN|Infinity/);
  assert.deepEqual(points.map(p=>p.maxWeight),[120,120]);
  assert.match(html,/L133.80,8.00/);
  assert.match(html,/L133.80,36.00/);
  assert.match(html,/MAX WT/);
  assert.match(html,/stroke-dasharray="4 3"/);
});

test('rep scores, stages, assistance, warmups and invalid sets never become a weight-based 1RM', () => {
  const current=session('now','2026-09-18',[
    row(25,12,{exercise:'Dips',load_type:'belt'}), row(165,8,{exercise:'Pull-Ups'}),
    row(165,8,{exercise:'Dragon Fly Progression',grip:'tuck'}),
    row(150,8,{set_type:'warmup'}), row(150,'5–8'), row(Infinity,5), row(-10,5),
  ]);
  assert.deepEqual(buildRecap1rmTrends([],current),{});
  assert.equal(renderRecap1rm([]),'');
  assert.equal(renderRecap1rm([{date:'<script>',value:180}]),'');
  const point=buildRecap1rmTrends([],session('one','2026-09-18',[row(150,1)]))[name];
  const html=renderRecap1rm(point);
  assert.match(html,/latest 150 lb/);
  assert.match(html,/First result/);
  assert.doesNotMatch(html,/<path/,'Do not invent a trend before any history exists');
});

test('same-day later workouts and active home sessions are excluded from earlier summaries', () => {
  const current=session('current','2026-09-18',[row(150,6)],{started_at:'2026-09-18T10:00:00Z'});
  const earlier=session('early','2026-09-18',[row(160,3)],{started_at:'2026-09-18T08:00:00Z',finished_at:'2026-09-18T09:00:00Z'});
  const later=session('later','2026-09-18',[row(200,5)],{started_at:'2026-09-18T12:00:00Z'});
  assert.deepEqual(buildRecap1rmTrends([later,earlier],current)[name].map(p=>p.value),[176,180]);
  const html=renderLatestWorkoutRecap([earlier,current],[earlier],'2026-09-18');
  assert.match(html,/Estimated 1RM across 1 workout, latest 180 lb/);
});

test('maximum load can come from a different set than best 1RM and shares its chart scale', () => {
  const current = session('now','2026-09-18',[row(160,3),row(150,8),row(200,1,{userSkipped:true})]);
  const points = buildRecap1rmTrends([],current)[name];
  assert.equal(points[0].value,190);
  assert.equal(points[0].maxWeight,160);
  const html = renderRecap1rm(points);
  assert.match(html,/cy="8.00"/);
  assert.match(html,/cy="36.00"/);
  assert.match(html,/maximum working-set weight 160 lb/);
  assert.doesNotMatch(html,/<path/);
  const invalid = renderRecap1rm([{date:'2026-09-18',value:190,maxWeight:'<script>'}]);
  assert.doesNotMatch(invalid,/NaN|Infinity|<script>|MAX WT/);
});

test('pull-up trends use a shared bodyweight baseline and only typed belt loads add weight', () => {
  const pullup = (weight,reps,extra={}) => row(weight,reps,{exercise:'Pull-Ups',...extra});
  const old = session('old','2026-08-01',[pullup(175,6)]);
  const previous = session('previous','2026-09-01',[pullup(0,8)]);
  const current = session('now','2026-09-18',[pullup(25,5,{load_type:'belt'}),pullup(0,9)]);
  const points = buildRecap1rmTrends([old,previous],current,{bodyweightLb:165})['Pull-Ups'];
  assert.deepEqual(points.map(p=>p.value),[198,209,221.7]);
  assert.deepEqual(points.map(p=>p.maxWeight),[165,165,190]);
  const html = renderLatestWorkoutRecap([old,previous,current],[],'2026-09-18',{bodyweightLb:165});
  assert.match(html,/latest 221.7 lb/);
  assert.match(html,/maximum working-set weight 190 lb/);
  assert.match(html,/current bodyweight 165 lb/);
  assert.match(html,/MAX WT/);
});

test('live pull-up recap agrees with saved rows and filters assistance and skipped sets', () => {
  const current = recapTrendSession([{name:'Pull-Ups',repsOnly:true,beltLoad:true,equipment:'band',sets:[
    {kind:'work',weight:25,reps:5,completed:true},
    {kind:'work',weight:0,reps:50,completed:true,bands:[25]},
    {kind:'work',weight:50,reps:20,completed:false},
    {kind:'work',weight:50,reps:20,completed:true,userSkipped:true},
    {kind:'warmup',weight:50,reps:20,completed:true},
  ]}],'2026-09-18','now');
  const live = buildRecap1rmTrends([],current,{bodyweightLb:'165'})['Pull-Ups'];
  assert.equal(live[0].value,221.7);
  assert.equal(live[0].maxWeight,190);
  const stored = session('now','2026-09-18',[row(25,5,{exercise:'Pull-Ups',load_type:'belt'})]);
  assert.deepEqual(live,buildRecap1rmTrends([],stored,{bodyweightLb:165})['Pull-Ups']);
});

test('pull-up charts do not invent bodyweight or mix malformed or assisted history', () => {
  const current=session('now','2026-09-18',[row(0,8,{exercise:'Pull-Ups'})]);
  for (const bodyweightLb of [undefined,null,0,-1,Infinity,'bad']) {
    assert.deepEqual(buildRecap1rmTrends([],current,{bodyweightLb}),{});
  }
  for (const bands_json of ['[25]','bad','{}']) {
    const assisted=session('assisted','2026-08-01',[row(150,50,{exercise:'Pull-Ups',bands_json})]);
    assert.equal(buildRecap1rmTrends([assisted],current,{bodyweightLb:165})['Pull-Ups'].length,1);
  }
});
