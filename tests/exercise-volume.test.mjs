import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseVolume, liveVolumeSession, buildVolumeTrends } from '../lib/exercise-volume.js';
import { renderVolumeSparkline, renderVolumeMetric } from '../lib/volume-sparkline.js';
import { renderLatestWorkoutRecap } from '../components/home/recap.js';
import { setExerciseAliases } from '../lib/exercise-aliases.js';
const name = 'Barbell Bench Press';
const row = (weight, reps, extra = {}) => ({ exercise: name, weight_lb: weight, reps, set_type: 'working', ...extra });
const session = (id, date, sets, extra = {}) => ({ id, date, sets, finished_at: `${date}T20:00:00Z`, ...extra });

test('volume sums actual working sets; ignores warmups, skips, incomplete and invalid rows', () => {
  const result = exerciseVolume(session('x', '2026-10-08', [row(150, 6), row(145, '8'), row(45, 10, {set_type:'warmup'}),
    row(150, 20, {completed:false}), row(150, 20, {userSkipped:true}), row(200, '5–8'), row(Infinity, 5), row(-10, 5)]), name);
  assert.deepEqual(result, {value:2060, unit:'lb·reps'});
});

test('cable history and live sets use matching load conventions, including variants', () => {
  const exercise = {name:'Cable Chest Fly', equipment:'cable', sets:[{kind:'work',completed:true,weight:20,reps:12}]};
  const live = liveVolumeSession([exercise], '2026-10-08', 'live');
  assert.equal(exerciseVolume(live,exercise.name).value,480);
  assert.equal(exerciseVolume(session('old','2026-07-01',[row(40,12,{exercise:exercise.name})]), exercise.name).value,480);
  setExerciseAliases({'Cable Chest Fly · High':'Cable Chest Fly'});
  try { assert.equal(exerciseVolume(session('v','2026-10-08',[row(20,12,{exercise:'Cable Chest Fly · High'})]), 'Cable Chest Fly · High').value,480); }
  finally {setExerciseAliases({});}
});

test('bodyweight volume uses one baseline plus explicit belt load; staged work uses reps', () => {
  const s = session('x','2026-10-08',[row(25,8,{exercise:'Dips',load_type:'belt'}),row(165,10,{exercise:'Dips'}),
    row(25,10,{exercise:'Dips',bands_json:'[20]'})]);
  assert.equal(exerciseVolume(s,'Dips',{bodyweightLb:165}).value,3170);
  assert.equal(exerciseVolume(s,'Dips').unit,'reps');
  assert.equal(exerciseVolume(session('x','2026-10-08',[row(165,8,{exercise:'Dragon Fly Progression'})]),'Dragon Fly Progression').value,8);
});

test('resumed live volume replaces its autosave even after correction, with same-day other workouts retained', () => {
  const previous = session('previous','2026-10-07',[row(100,10)]);
  const stale = session('live','2026-10-08',[row(100,20)]);
  const other = session('other','2026-10-08',[row(100,5)]);
  const current = session('live','2026-10-08',[row(100,8)],{isPartial:true});
  const history = [previous,previous,stale,other,session('future','2026-10-09',[row(999,10)])];
  const before = structuredClone(history);
  const points = buildVolumeTrends(history,current)[name];
  assert.deepEqual(points.map(p=>p.value),[1000,500,800]);
  assert.equal(points.at(-1).isPartial,true);
  assert.deepEqual(history,before);
  assert.equal(buildVolumeTrends(history,{...current,sets:[]},{exerciseNames:[name]})[name].length,2);
});

test('recap volume stays on the shared timeline, has inspectable points, and never rescales 1RM', () => {
  const points = [{date:'2026-08-01',value:1000,unit:'lb·reps'},{date:'2026-10-08',value:2060,unit:'lb·reps'}];
  const domain = {start:Date.parse('2026-08-01'),end:Date.parse('2026-11-01')};
  const html = renderVolumeSparkline(points,domain);
  assert.match(html,/data-chart-points=/);
  assert.match(html,/cx="3.125%"/);
  assert.match(html,/r="1.5"/);
  assert.match(html,/latest 2,060 lb·reps/);
  assert.doesNotMatch(html,/NaN|Infinity|stroke-dasharray/);
  assert.equal(renderVolumeSparkline([{date:'<script>',value:200,unit:'lb·reps'}]),'');
  assert.equal(renderVolumeMetric([{date:'2026-10-08',value:200,unit:'<script>'}]),'');
  const saved = session('done','2026-10-08',[row(150,6),row(145,8)],{workout_name:'Strength A'});
  const recap = renderLatestWorkoutRecap([saved],[],'2026-10-08');
  assert.match(recap,/Working-set volume history/);
  assert.match(recap,/2,060/);
  assert.match(recap,/Estimated 1RM/);
});
