import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBenchConversion, calculateLevel4Load, displayValue, getStartingLoad, nextBlock, previewImport, previewWorkoutImport, progressionStatus } from './domain.js';

test('dumbbell bench conversion uses 90% of combined load and rounds down',()=>{
  assert.equal(calculateBenchConversion(42.5),76);
});

test('Level 1–3 intake never derives a working load from estimated 1RM',()=>{
  const athlete={level:2};
  assert.deepEqual(getStartingLoad(athlete,{intakeType:'estimated-1rm',estimated1RM:100},.7),{
    load:null,status:'coach-set',basis:'No 1RM conversion for Levels 1–3'
  });
  assert.equal(getStartingLoad(athlete,{intakeType:'comfortable-3x4',startWeight:55}).load,55);
});

test('Level 4+ proposed load is conservative, floored, and coach-reviewed',()=>{
  assert.equal(calculateLevel4Load(137,.72),98);
  assert.equal(getStartingLoad({level:4},{estimated1RM:137},.72).status,'coach-review');
  assert.equal(getStartingLoad({level:4},{intakeType:'comfortable-3x4',startWeight:55}).load,55);
});

test('deload sessions never qualify for progression decisions',()=>{
  assert.equal(progressionStatus({level:1,isDeload:true,completed:true}).eligible,false);
});

test('A/C/B cycle advances in order',()=>{
  assert.equal(nextBlock('A'),'C');
  assert.equal(nextBlock('C'),'B');
  assert.equal(nextBlock('B'),'A');
});

test('vertical jumps display inches and horizontal jumps display feet and inches',()=>{
  assert.equal(displayValue('cmj',31.5),'31.5 in');
  assert.equal(displayValue('long-jump',227),'18′ 11″');
  assert.equal(displayValue('long-jump',222.5),'18′ 6.5″');
});

test('history import skips duplicates, rejects unknown athlete IDs, and preserves valid new rows',()=>{
  const athletes=[{id:'A-1'}];
  const existing=[{athleteId:'A-1',date:'2026-04-01',metric:'cmj',value:30}];
  const preview=previewImport([
    {athlete_id:'A-1',date:'2026-04-01',metric:'CMJ',value:30,unit:'in'},
    {athlete_id:'A-2',date:'2026-04-02',metric:'100m',value:13.2,unit:'s'},
    {athlete_id:'A-1',date:'2026-04-02',metric:'CMJ',value:31.25,unit:'in'}
  ],athletes,existing);
  assert.equal(preview.duplicates.length,1);
  assert.equal(preview.rejected.length,1);
  assert.equal(preview.accepted.length,1);
  assert.equal(preview.accepted[0].value,31.25);
});

test('workout history import validates athlete IDs and skips existing workouts',()=>{
  const athletes=[{id:'A-1'}];
  const workout={athleteId:'A-1',date:'2026-03-02',block:'A',title:'Strength A',exercises:[{name:'Coach-selected lift',sets:3,reps:4,load:45}]};
  const preview=previewWorkoutImport([workout,{...workout,athleteId:'A-2'}],athletes,[workout]);
  assert.equal(preview.duplicates.length,1);
  assert.equal(preview.rejected.length,1);
  assert.equal(preview.accepted.length,0);
});

test('leaderboards separate girls and boys, choose one best mark, and exclude unknown sex',async()=>{
  const {metricLeaderboard}=await import('./domain.js');
  const athletes=[{id:'F1',name:'First Girl',sex:'female'},{id:'F2',name:'Second Girl',sex:'female'},{id:'M1',name:'Boy',sex:'male'},{id:'U1',name:'Unknown'}];
  const records=[{athleteId:'F1',metric:'cmj',value:22,date:'2026-01-01'},{athleteId:'F1',metric:'cmj',value:25,date:'2026-02-01'},{athleteId:'F2',metric:'cmj',value:24,date:'2026-01-01'},{athleteId:'M1',metric:'cmj',value:30},{athleteId:'U1',metric:'cmj',value:40},{athleteId:'missing',metric:'cmj',value:50},{athleteId:'F2',metric:'cmj',value:NaN},{athleteId:'F2',metric:'cmj',value:null},{athleteId:'F2',metric:'cmj',value:-1}];
  assert.deepEqual(metricLeaderboard(athletes,records,'cmj','female').map(e=>[e.athleteId,e.value,e.rank]),[['F1',25,1],['F2',24,2]]);
  assert.deepEqual(metricLeaderboard(athletes,records,'cmj','male').map(e=>e.athleteId),['M1']);
  assert.equal(metricLeaderboard(athletes,records,'cmj','female')[0].date,'2026-02-01');
  assert.deepEqual(metricLeaderboard(athletes,records,'cmj','unknown'),[]);
});

test('leaderboards honor lower sprint times, deterministic ties, and a strict ten-athlete limit',async()=>{
  const {metricLeaderboard}=await import('./domain.js');
  const athletes=Array.from({length:12},(_,i)=>({id:`A${i}`,name:`Athlete ${String(i).padStart(2,'0')}`,sex:'female'}));
  const records=athletes.map((a,i)=>({athleteId:a.id,metric:'fly-10',value:i<2?1.2:1.2+i/10}));
  records.push({athleteId:'A0',metric:'fly-10',value:2});
  const result=metricLeaderboard(athletes,records,'fly-10','female');
  assert.equal(result.length,10);assert.deepEqual(result.slice(0,3).map(e=>[e.athleteId,e.rank]),[['A0',1],['A1',1],['A2',3]]);
  assert.deepEqual(result,metricLeaderboard([...athletes].reverse(),[...records].reverse(),'fly-10','female'));
});

test('leaderboard metrics include performance tests and training but never body weight or track events',async()=>{
  const {LEADERBOARD_METRICS,teamLeaderboards,metricLeaderboard}=await import('./domain.js');
  for(const id of ['cmj','broad-jump','fly-10','rsi','step-up-power','clean','bench'])assert.ok(LEADERBOARD_METRICS.some(m=>m.id===id));
  assert.ok(!LEADERBOARD_METRICS.some(m=>m.id==='body-weight' || m.id==='100m'));
  assert.equal(teamLeaderboards([],[]).length,LEADERBOARD_METRICS.length);
  assert.deepEqual(metricLeaderboard([{id:'M1',sex:'male'}],[{athleteId:'M1',metric:'body-weight',value:150}],'body-weight','male'),[]);
});
