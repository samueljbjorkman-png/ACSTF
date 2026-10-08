export const METRICS = [
  { id:'55m', label:'55m', group:'Track events', unit:'s', direction:'min' },
  { id:'100m', label:'100m', group:'Track events', unit:'s', direction:'min' },
  { id:'200m', label:'200m', group:'Track events', unit:'s', direction:'min' },
  { id:'400m', label:'400m', group:'Track events', unit:'s', direction:'min' },
  { id:'800m', label:'800m', group:'Track events', unit:'s', direction:'min' },
  { id:'100h', label:'100m hurdles', group:'Track events', unit:'s', direction:'min' },
  { id:'110h', label:'110m hurdles', group:'Track events', unit:'s', direction:'min' },
  { id:'300h', label:'300m hurdles', group:'Track events', unit:'s', direction:'min' },
  { id:'long-jump', label:'Long jump', group:'Horizontal jumps', unit:'ft-in', direction:'max' },
  { id:'triple-jump', label:'Triple jump', group:'Horizontal jumps', unit:'ft-in', direction:'max' },
  { id:'broad-jump', label:'Broad jump', group:'Horizontal jumps', unit:'ft-in', direction:'max' },
  { id:'high-jump', label:'High jump', group:'Field events', unit:'ft-in', direction:'max' },
  { id:'cmj', label:'Countermovement jump', group:'Vertical jumps', unit:'in', direction:'max' },
  { id:'squat-jump', label:'Squat jump', group:'Vertical jumps', unit:'in', direction:'max' },
  { id:'single-leg-cmj-left', label:'Single-leg CMJ · Left', group:'Vertical jumps', unit:'in', direction:'max' },
  { id:'single-leg-cmj-right', label:'Single-leg CMJ · Right', group:'Vertical jumps', unit:'in', direction:'max' },
  { id:'fly-10', label:'10-yard fly', group:'Sprint tests', unit:'s', direction:'min' },
  { id:'10-yard', label:'10-yard acceleration', group:'Sprint tests', unit:'s', direction:'min' },
  { id:'rsi', label:'Reactive strength index', group:'Training & KPI', unit:'ratio', direction:'max' },
  { id:'step-up-power', label:'Single-leg step-up power', group:'Training & KPI', unit:'W', direction:'max' },
  { id:'clean', label:'Clean', group:'Training & KPI', unit:'lb', direction:'max' },
  { id:'bench', label:'Bench press', group:'Training & KPI', unit:'lb', direction:'max' },
  { id:'body-weight', label:'Body weight reference', group:'Training & KPI', unit:'lb', direction:'none' }
];

export const METRIC_GROUPS = ['Track events','Field events','Horizontal jumps','Vertical jumps','Sprint tests','Training & KPI'];
export const BLOCK_CYCLE = ['A','C','B'];
export const VERTICAL_METRICS = new Set(METRICS.filter(m=>m.group==='Vertical jumps').map(m=>m.id));
export const HORIZONTAL_METRICS = new Set(METRICS.filter(m=>m.unit==='ft-in').map(m=>m.id));

const aliasMap = new Map();
for (const metric of METRICS) {
  aliasMap.set(metric.id, metric.id);
  aliasMap.set(metric.label.toLowerCase(), metric.id);
}
[
  ['cmj','cmj'],['counter movement jump','cmj'],['vertical jump','cmj'],['sj','squat-jump'],['squat jump','squat-jump'],
  ['single leg cmj left','single-leg-cmj-left'],['slcmj l','single-leg-cmj-left'],['single leg cmj right','single-leg-cmj-right'],['slcmj r','single-leg-cmj-right'],
  ['lj','long-jump'],['tj','triple-jump'],['broad jump','broad-jump'],['broad jump standing','broad-jump'],['10m fly','fly-10'],['fly 10','fly-10'],['fly-10','fly-10'],
  ['100 hurdles','100h'],['110 hurdles','110h'],['300 hurdles','300h'],['bodyweight','body-weight'],['body weight','body-weight'],['single leg step up','step-up-power']
].forEach(([a,b])=>aliasMap.set(a,b));

export function canonicalMetric(input) {
  const key=String(input??'').trim().toLowerCase().replace(/\s+/g,' ');
  return aliasMap.get(key) ?? null;
}

export function calculateBenchConversion(dumbbellEachLb) {
  const n=Number(dumbbellEachLb);
  if (!Number.isFinite(n) || n<=0) return null;
  return Math.floor(n*2*.9);
}

export function calculateLevel4Load(estimated1RM, targetPercent) {
  const max=Number(estimated1RM), pct=Number(targetPercent);
  if (!Number.isFinite(max) || max<=0 || !Number.isFinite(pct) || pct<=0 || pct>1) return null;
  return Math.floor(max*pct);
}

export function getStartingLoad(athlete, exercise, targetPercent=null) {
  if (exercise.intakeType==='comfortable-3x4' && Number(exercise.startWeight)>0) {
    return { load:Number(exercise.startWeight), status:Number(athlete.level)<=3?'ready':'coach-review', basis:'comfortable 3×4' };
  }
  if (Number(athlete.level)<=3) {
    return { load:null, status:'coach-set', basis:'No 1RM conversion for Levels 1–3' };
  }
  const load=calculateLevel4Load(exercise.estimated1RM,targetPercent);
  return load===null
    ? { load:null, status:'needs-phase-percent', basis:'Coach review required' }
    : { load, status:'coach-review', basis:`${Math.round(Number(targetPercent)*100)}% of estimated 1RM` };
}

export function progressionStatus({level,isDeload=false,completed=false}) {
  if (isDeload) return { eligible:false, message:'Deload excluded from progression decisions.' };
  if (!completed) return { eligible:false, message:'Log the workout before reviewing progression.' };
  if (Number(level)<=3) return { eligible:true, message:'Gradual progression. Use coach observation; no RIR or 1RM-driven jump.' };
  return { eligible:true, message:'Coach review required before the next calculated load is assigned.' };
}

export function toCanonicalValue(metricId, rawValue, rawUnit='') {
  const metric=METRICS.find(m=>m.id===metricId);
  const value=Number(rawValue);
  if (!metric || !Number.isFinite(value)) return null;
  const unit=String(rawUnit||metric.unit).toLowerCase().replace(/\s/g,'');
  if (metric.unit==='in' || metric.unit==='ft-in') {
    if (unit==='ft' || unit==='feet' || unit==='foot') return value*12;
    if (unit==='cm') return value/2.54;
    if (unit==='m') return value*39.37007874;
    if (unit==='in' || unit==='inch' || unit==='inches' || unit==='ft-in' || unit==='') return value;
    return null;
  }
  if (metric.unit==='s') {
    if (unit==='ms') return value/1000;
    if (unit==='s' || unit==='sec' || unit==='seconds' || unit==='') return value;
    return null;
  }
  if (metric.unit==='lb' && (unit==='kg')) return value*2.2046226218;
  if (unit===metric.unit.toLowerCase() || unit==='') return value;
  return null;
}

export function displayValue(metricId, value) {
  const metric=METRICS.find(m=>m.id===metricId);
  if (!metric || value==null || !Number.isFinite(Number(value))) return '—';
  const n=Number(value);
  if (metric.unit==='ft-in') {
    const ft=Math.floor((n+1e-8)/12), inches=Number((n-ft*12).toFixed(2));
    const shown=Number.isInteger(inches)?String(inches):String(inches);
    return `${ft}′ ${shown}″`;
  }
  const digits=metric.unit==='s'?2:metric.unit==='ratio'?2:metric.unit==='in'?1:0;
  return `${Number(n.toFixed(digits))} ${metric.unit}`;
}

export function normalizeRecord(raw, rowIndex=0) {
  const athleteId=String(raw.athleteId??raw.athlete_id??raw.athleteid??'').trim();
  const metricId=canonicalMetric(raw.metric??raw.metricId??raw.event??raw.test??raw.name);
  const date=String(raw.date??raw.recordedAt??raw.recorded_at??'').slice(0,10);
  const value=METRICS.find(m=>m.id===metricId)?.unit==='ft-in' && raw.feet!==undefined
    ? Number(raw.feet)*12+Number(raw.inches??0)
    : toCanonicalValue(metricId,raw.value??raw.result??raw.mark,raw.unit??'');
  if (!athleteId) return { error:'Missing athlete ID.' };
  if (!metricId) return { error:'Unknown metric.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error:'Date must use YYYY-MM-DD.' };
  if (value===null || !Number.isFinite(value)) return { error:'Value or unit is invalid.' };
  return {
    record:{ id:String(raw.recordId??raw.record_id??`imp-${date}-${athleteId}-${metricId}-${value}`), athleteId, metric:metricId, date, value, unit:METRICS.find(m=>m.id===metricId).unit, note:String(raw.note??raw.notes??'').trim() },
    row:rowIndex+1
  };
}

export function recordKey(record) {
  return [record.athleteId,record.date,record.metric,Number(record.value).toFixed(4)].join('|');
}

export function previewImport(rows, athletes, existingRecords) {
  const athleteIds=new Set(athletes.map(a=>String(a.id)));
  const seen=new Set(existingRecords.map(recordKey));
  const accepted=[],duplicates=[],rejected=[];
  rows.forEach((raw,index)=>{
    const normalized=normalizeRecord(raw,index);
    const row=normalized.row??index+1;
    if (normalized.error) { rejected.push({row,reason:normalized.error,raw}); return; }
    const record=normalized.record;
    if (!athleteIds.has(record.athleteId)) { rejected.push({row,reason:`Unknown athlete ID “${record.athleteId}”.`,raw}); return; }
    const key=recordKey(record);
    if (seen.has(key)) { duplicates.push({row,record}); return; }
    seen.add(key);
    accepted.push(record);
  });
  return {accepted,duplicates,rejected};
}

export function previewWorkoutImport(rows, athletes, existingWorkouts) {
  const athleteIds=new Set(athletes.map(a=>String(a.id)));
  const seen=new Set(existingWorkouts.map(workoutKey));
  const accepted=[],duplicates=[],rejected=[];
  rows.forEach((raw,index)=>{
    const row=index+1,athleteId=String(raw.athleteId??raw.athlete_id??'').trim();
    const date=String(raw.date??raw.recordedAt??raw.recorded_at??'').slice(0,10);
    const block=String(raw.block??raw.phase??'').toUpperCase();
    const exercises=Array.isArray(raw.exercises)?raw.exercises:[];
    if(!athleteId){rejected.push({row,reason:'Missing athlete ID.',raw});return;}
    if(!athleteIds.has(athleteId)){rejected.push({row,reason:`Unknown athlete ID “${athleteId}”.`,raw});return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))){rejected.push({row,reason:'Date must use YYYY-MM-DD.',raw});return;}
    if(!BLOCK_CYCLE.includes(block)){rejected.push({row,reason:'Block must be A, C, or B.',raw});return;}
    if(!exercises.length||exercises.some(x=>!String(x.name??'').trim())){rejected.push({row,reason:'Workout must contain named exercises.',raw});return;}
    const workout={id:String(raw.workoutId??raw.workout_id??`imp-workout-${date}-${athleteId}-${block}-${index}`),athleteId,date,block,title:String(raw.title??`Block ${block} session`).trim(),isDeload:Boolean(raw.isDeload??raw.is_deload),exercises:exercises.map(x=>({name:String(x.name).trim(),sets:String(x.sets??''),reps:String(x.reps??''),load:Number(x.load)||null,done:Boolean(x.done)})),coachNote:String(raw.coachNote??raw.notes??'').trim(),completed:raw.completed!==false};
    const key=workoutKey(workout);
    if(seen.has(key)){duplicates.push({row,workout});return;}
    seen.add(key);accepted.push(workout);
  });
  return {accepted,duplicates,rejected};
}

export function workoutKey(workout) {
  const exerciseSignature=(workout.exercises||[]).map(x=>`${String(x.name).trim().toLowerCase()}:${x.sets||''}:${x.reps||''}:${x.load||''}`).sort().join(',');
  return [workout.athleteId,workout.date,workout.block,String(workout.title||'').trim().toLowerCase(),exerciseSignature].join('|');
}

export function personalRecords(records, athleteId) {
  const byMetric=new Map();
  for (const record of records.filter(r=>r.athleteId===athleteId)) {
    const metric=METRICS.find(m=>m.id===record.metric);
    if (!metric || metric.direction==='none') continue;
    const previous=byMetric.get(record.metric);
    const best=!previous || (metric.direction==='min'?Number(record.value)<Number(previous.value):Number(record.value)>Number(previous.value));
    if (best) byMetric.set(record.metric,record);
  }
  return byMetric;
}

export function nextBlock(block) {
  const i=BLOCK_CYCLE.indexOf(block);
  return BLOCK_CYCLE[(i+1+BLOCK_CYCLE.length)%BLOCK_CYCLE.length];
}

// Performance tests and training KPIs; body weight is background data, never a competition.
export const LEADERBOARD_METRICS = METRICS.filter(m=>m.direction!=='none' &&
  (['Vertical jumps','Sprint tests','Training & KPI'].includes(m.group) || m.id==='broad-jump'));

export function metricLeaderboard(athletes, records, metricId, sex) {
  const metric=LEADERBOARD_METRICS.find(m=>m.id===metricId);
  if(!metric || !['female','male'].includes(sex))return [];
  const eligible=new Map(athletes.filter(a=>a.sex===sex).map(a=>[a.id,a]));
  const best=new Map();
  for(const record of records){
    if(record.metric!==metricId || !eligible.has(record.athleteId) ||
      typeof record.value!=='number' || !Number.isFinite(record.value) || record.value<0)continue;
    const previous=best.get(record.athleteId);
    if(!previous || (metric.direction==='min'?record.value<previous.value:record.value>previous.value) ||
      (record.value===previous.value && String(record.date||'')<String(previous.date||'')))best.set(record.athleteId,record);
  }
  const entries=[...best.values()].map(r=>({athleteId:r.athleteId,name:eligible.get(r.athleteId).name,value:r.value,date:r.date||null}));
  entries.sort((a,b)=>(metric.direction==='min'?a.value-b.value:b.value-a.value) || a.name.localeCompare(b.name) || a.athleteId.localeCompare(b.athleteId));
  let rank=0;
  return entries.slice(0,10).map((entry,index)=>{
    if(index===0 || entry.value!==entries[index-1].value)rank=index+1;
    return {rank,...entry};
  });
}

export function teamLeaderboards(athletes, records) {
  return LEADERBOARD_METRICS.map(metric=>({metricId:metric.id,
    girls:metricLeaderboard(athletes,records,metric.id,'female'),
    boys:metricLeaderboard(athletes,records,metric.id,'male')}));
}
