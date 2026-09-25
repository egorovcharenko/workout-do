import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap1rmTrends, limitTrendsToRecentMonths, recapTrendSession, recapMonthlyChanges, renderRecapMonthlyChanges, renderRecap1rm, recapTimeDomain, renderRecapTrendMetrics, renderRecapTimeHeader } from '../lib/legacy/recap-1rm.js';
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

test('monthly bars display signed changes, calendar gaps and unchanged months without inventing gains', () => {
  const points = [
    { date:'2024-01-01', value:180, maxWeight:150 },
    { date:'2024-01-31', value:190.5, maxWeight:160 },
    { date:'2024-02-29', value:185, maxWeight:155 },
    { date:'2024-03-01', value:195, maxWeight:165 },
    { date:'2024-04-01', value:195, maxWeight:165 },
  ];
  const html = renderRecapMonthlyChanges(points);
  assert.match(html, /recap-month-cell gain/);
  assert.match(html, /recap-month-cell loss/);
  assert.match(html, /recap-month-value">\+10.5<\/strong>/);
  assert.match(html, /recap-month-value">−5.5<\/strong>/);
  assert.match(html, /recap-month-value">0<\/strong>/);
  assert.match(html, /January 2024: estimated 1RM \+10.5 lb/);
  assert.match(html, /February 2024: estimated 1RM −5.5 lb/);
  assert.doesNotMatch(html, /recap-month-name/);
  assert.match(renderRecapTimeHeader(recapTimeDomain({points})), /Mar <small>24<\/small>/);
  assert.doesNotMatch(html, /1RM CHANGE · LB/);
  const gap = renderRecapMonthlyChanges([{date:'2025-12-01',value:180},{date:'2025-12-20',value:185},{date:'2026-02-01',value:190}]);
  assert.match(gap, /January 2026: not enough data/);
  assert.match(gap, /recap-month-value">—<\/strong>/);
  assert.match(gap, /February 2026: not enough data/);
  assert.equal(renderRecapMonthlyChanges([{date:'2026-09-01',value:180}]),'');
  assert.match(renderRecapMonthlyChanges([{date:'2026-08-01',value:180},{date:'2026-09-01',value:180}]),/recap-month-cell flat/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.doesNotMatch(renderRecap1rm(points), /recap-month-cell/, 'Monthly values render separately below the sparkline');
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
  assert.match(html,/Estimated 1RM across 2 workouts, latest 180 lb/,'The recap chart shows only the last 3 months');
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
  assert.match(renderRecapTrendMetrics(points),/MAX WT/);
  assert.doesNotMatch(html,/stroke-dasharray/);
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
  assert.match(html,/cy="18.182%"/);
  assert.match(html,/cy="81.818%"/);
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


test('all recap sparklines place the same date at the same x position, including a first result', () => {
  const long = [{date:'2025-12-10',value:100,maxWeight:80},{date:'2025-12-20',value:102,maxWeight:80},{date:'2026-02-10',value:110,maxWeight:90}];
  const short = [{date:'2026-02-01',value:20,maxWeight:15},{date:'2026-02-10',value:25,maxWeight:20}];
  const single = [short[1]];
  const trends = {long,short,single,invalid:[{date:'2020-02-30',value:999}]};
  const before = JSON.stringify(trends);
  const domain = recapTimeDomain(trends);
  assert.deepEqual(domain,{start:Date.parse('2025-12-01'),end:Date.parse('2026-03-01')});
  const position = points => [...renderRecap1rm(points,domain).matchAll(/<circle cx="([0-9.]+)%"[^>]*><title>2026-02-10:/g)].map(m=>m[1]);
  assert.deepEqual(position(long),position(short));
  assert.deepEqual(position(long),position(single));
  assert.ok(Number(position(single)[0]) > 75, 'A new exercise appears near the end of the common history');
  assert.doesNotMatch(renderRecap1rm(single,domain),/<path/,'No invented history before the first result');
  for (const points of [long,short]) {
    const bars = renderRecapMonthlyChanges(points,domain);
    assert.equal((bars.match(/recap-month-cell /g)||[]).length,3);
    assert.match(bars,/December 2025/); assert.match(bars,/January 2026/); assert.match(bars,/February 2026/);
  }
  assert.match(renderRecapMonthlyChanges(short,domain),/December 2025: not enough data/);
  assert.equal(JSON.stringify(trends),before);
  assert.equal(recapTimeDomain({}),null);
});

test('home recap shares its timeline across exercises with different history lengths', () => {
  const other = 'Dumbbell Hammer Curls';
  const old = session('old','2026-05-01',[row(145,6)]);
  const current = session('now','2026-09-19',[row(150,6),row(30,10,{exercise:other})]);
  const html = renderLatestWorkoutRecap([old,current],[],'2026-09-19');
  const xs = [...html.matchAll(/<circle cx="([0-9.]+)%"[^>]*><title>2026-09-19:/g)].map(m=>m[1]);
  assert.equal(xs.length,4);
  assert.equal(new Set(xs).size,1);
});


test('dips trends use total load and share live/stored semantics without counting assistance', () => {
  const dip = (w,r,extra={}) => row(w,r,{exercise:'Dips',...extra});
  const current = session('now','2026-09-19',[dip(25,11,{load_type:'belt'}),dip(0,12)]);
  const old = session('old','2026-05-01',[dip(165,8)]);
  const assisted = session('assisted','2026-08-01',[dip(25,30,{load_type:'belt',bands_json:'[25]'})]);
  const before=JSON.stringify([old,assisted,current]);
  const points = buildRecap1rmTrends([old,assisted],current,{bodyweightLb:165}).Dips;
  assert.deepEqual(points.map(p=>[p.value,p.maxWeight]),[[209,165],[259.7,190]]);
  const live = recapTrendSession([{name:'Dips',equipment:'bodyweight',beltLoad:true,repsOnly:true,sets:[
    {kind:'work',weight:25,reps:11,completed:true}, {kind:'work',weight:0,reps:12,completed:true},
    {kind:'work',weight:50,reps:30,completed:true,bands:[25]},
    {kind:'warmup',weight:90,reps:30,completed:true},
  ]}],'2026-09-19','now');
  assert.deepEqual(buildRecap1rmTrends([old,assisted],live,{bodyweightLb:165}).Dips,points);
  assert.deepEqual(buildRecap1rmTrends([old],current),{});
  assert.equal(JSON.stringify([old,assisted,current]),before);
  const html = renderLatestWorkoutRecap([old,current],[],'2026-09-19',{bodyweightLb:165});
  assert.match(html,/latest 259.7 lb/);
  assert.equal((html.match(/Shared chart timeline/g)||[]).length,1);
  assert.match(html,/workout-recap-details[\s\S]*recap-trend-metrics[\s\S]*workout-recap-trend/);
  assert.doesNotMatch(renderRecap1rm(points),/recap-1rm-label/);
  assert.doesNotMatch(renderRecapMonthlyChanges(points),/recap-month-name/);
});

test('recap charts keep the last three calendar months, or the last point when nothing is that recent', () => {
  const trends = limitTrendsToRecentMonths({
    Squat: [{ date: '2026-05-30', value: 150 }, { date: '2026-07-01', value: 160 }, { date: '2026-09-18', value: 170 }],
    Old: [{ date: '2025-01-01', value: 100 }, { date: '2025-02-01', value: 110 }],
  });
  assert.deepEqual(trends.Squat.map(p => p.date), ['2026-07-01', '2026-09-18']);
  assert.deepEqual(trends.Old.map(p => p.date), ['2025-02-01']);
});
