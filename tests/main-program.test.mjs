import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_WORKOUTS,BLOCK_WORKOUTS,WORKOUTS} from '../lib/legacy/shared.js';
import {mainProgramContext,mainProgramSchedule} from '../lib/main-program.js';
import {trainingBlockHints,resolveTrainingBlockSession} from '../lib/training-block.js';
import {withRepGuidance} from '../lib/legacy/rep-guidance.js';

const run={id:'strength-4-week-v1',instanceId:'existing-run',startDate:'2026-09-06',returnDate:'2026-10-04',status:'active',prescriptionRevision:2};
const settings={training_block:JSON.stringify(run)};
const work = MAIN_WORKOUTS[0];
const row=(weight,reps,number=1)=>({exercise:'Barbell Back Squat',set_type:'working',set_number:number,weight_lb:weight,reps,rir:'1-2'});
const saved=(id,date,rows,context=run)=>({id,date,workout_name:work.name,finished_at:date+'T12:00:00Z',state_json:JSON.stringify({trainingBlock:context}),sets:rows});

test('permanent program retains all four prescriptions, load policies and 81 working sets',()=>{
  assert.deepEqual(MAIN_WORKOUTS.map(w=>w.exercises),BLOCK_WORKOUTS.map(w=>w.exercises));
  assert.equal(MAIN_WORKOUTS.flatMap(w=>w.exercises).reduce((n,e)=>n+e.sets,0),81);
  assert.ok(MAIN_WORKOUTS.every(w=>w.permanent&&w.program&&!w.hidden));
  assert.deepEqual(MAIN_WORKOUTS.map(w=>w.id),BLOCK_WORKOUTS.map(w=>w.id));
});

test('calendar continues after expiry and ignores old scheduled, paused and cancelled controls',()=>{
  const unchanged=JSON.stringify(settings);
  assert.equal(mainProgramSchedule(settings,'2026-09-18').workoutId,'strength-a');
  assert.equal(mainProgramSchedule(settings,'2026-10-04').workoutId,'strength-accessories-2');
  assert.equal(mainProgramSchedule(settings,'2026-10-05').workoutId,null);
  assert.equal(mainProgramSchedule(settings,'2026-10-06').workoutId,'strength-a');
  assert.equal(mainProgramSchedule({training_block:JSON.stringify({...run,status:'ended'})},'2026-10-06').workoutId,'strength-a');
  assert.equal(mainProgramSchedule({training_block:JSON.stringify({...run,resumeDate:'2026-09-10'})},'2026-09-07').workoutId,'strength-accessories-1');
  assert.equal(mainProgramSchedule({},'2026-09-18').workoutId,'strength-a');
  assert.equal(JSON.stringify(settings),unchanged);
});

test('promotion carries actual loads, added sets, previous reps and progression across the old return date',()=>{
  const before=saved('before','2026-09-18',[row(145,8),row(145,9,2),row(125,10,3),row(115,10,4)]);
  const context=mainProgramContext(settings);
  const resolved=resolveTrainingBlockSession(work,context,null,WORKOUTS);
  const history=[before];
  const hints=trainingBlockHints(resolved.workout,history,resolved.block);
  assert.equal(hints['Barbell Back Squat|working|1'].weight_lb,145);
  assert.equal(hints.__counts['Barbell Back Squat'],4);
  const exercise={name:'Barbell Back Squat',repRange:'5–8',sets:[{kind:'work',setNumber:1,weight:145,reps:null,targetRepRange:[5,8]}]};
  const guidance=withRepGuidance([exercise],history,{workout:resolved.workout,block:resolved.block,date:'2026-10-06'})[0].sets[0].repGuidance;
  assert.equal(guidance.previous.reps,8);
  assert.equal(guidance.rirLabel,'1–2');
  assert.equal(guidance.loadProgression.ready,true);
  assert.equal(guidance.loadProgression.weight,150);
  const after=saved('after','2026-10-06',[row(150,6)],resolved.block);
  assert.equal(trainingBlockHints(work,[after,before],mainProgramContext({}))['Barbell Back Squat|working|1'].weight_lb,150);
});

test('active legacy and revised sessions retain their prescription and stored sets during promotion',()=>{
  for (const revision of [1,2]) {
    const active=saved('active','2026-09-18',[row(142,7)],{...run,prescriptionRevision:revision});
    active.finished_at=null;
    const original=JSON.stringify(active);
    const resolved=resolveTrainingBlockSession(work,mainProgramContext(settings,active),active,WORKOUTS);
    assert.equal(resolved.workout.prescriptionRevision,revision===1?undefined:2);
    assert.equal(resolved.workout.permanent,true);
    assert.equal(resolved.block.permanent,true);
    assert.equal(resolved.block.instanceId,run.instanceId);
    assert.equal(JSON.stringify(active),original);
  }
});
