import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap1rmTrends, recapTrendSession, renderRecap1rm } from '../lib/legacy/recap-1rm.js';
import { renderLatestWorkoutRecap } from '../components/home/recap.js';
const name = 'Barbell Bench Press';
const row = (weight, reps, extra = {}) => ({ exercise: name, weight_lb: weight, reps, set_type: 'working', ...extra });
const session = (id, date, sets, extra = {}) => ({ id, date, sets, workout_name: 'Strength A', finished_at: `${date}T19:00:00Z`, ...extra });

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
  assert.match(html,/L155.00,22.00/);
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
