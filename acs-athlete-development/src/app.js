import { BLOCK_CYCLE, LEADERBOARD_METRICS, METRICS, METRIC_GROUPS, calculateBenchConversion, displayValue, getStartingLoad, nextBlock, personalRecords, previewImport, previewWorkoutImport, progressionStatus } from './domain.js';

const KEY='acs-athlete-development.local.v1';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const html=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateToday=()=>{const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${d.getFullYear()}-${m}-${day}`};

function emptyDB(){return {schemaVersion:1,athletes:[],records:[],plans:[],workouts:[],selectedAthleteId:null};}
let db=emptyDB();
let revision=0;
let user=null;
let activePage='home';
let viewMode='coach';
let pendingImport=null;
let boards=null;
let leaderboardMetric='cmj';
let leaderboardError='';
let leaderboardLoading=false;
let saving=false;
let workspaceReady=false;
async function api(path,method='GET',data){
  const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error || 'Request failed');
  return result;
}
function applyWorkspace(result){
  const selected=db.selectedAthleteId;
  db={...emptyDB(),...result.data};leaderboardError='';revision=result.revision;workspaceReady=true;boards=null;
  db.selectedAthleteId=db.athletes.some(a=>a.id===selected)?selected:(db.athletes[0]?.id || null);
}
async function refreshWorkspace(){applyWorkspace(await api('workspace'));render();}
async function save(){
  if(!workspaceReady){alert('Refresh shared data before saving again.');return false;}
  if(saving){alert('Please wait for the current save.');return false;}
  saving=true;$('#app-shell').inert=true;$('#modal').inert=true;setStatus('Saving…');
  try{applyWorkspace(await api('workspace','PUT',{revision,data:db}));setStatus('Saved to shared database');return true;}
  catch(error){workspaceReady=false;setStatus('Save failed');alert(error.message+' Your change was not saved.');try{await refreshWorkspace();}catch{}return false;}
  finally{saving=false;$('#app-shell').inert=false;$('#modal').inert=false;}
}
function setStatus(text){$('#sync-status').textContent=text;}
function athlete(id=db.selectedAthleteId){return db.athletes.find(a=>a.id===id)||null;}
function uniqueId(){return `ACS-${Math.random().toString(36).slice(2,7).toUpperCase()}`;}
function showModal(content){const modal=$('#modal');modal.innerHTML=content;modal.showModal();}
function closeModal(){const modal=$('#modal');if(modal.open)modal.close();}
function selectAthlete(id){db.selectedAthleteId=id;render();}
function go(page){activePage=page;$$('.nav-item').forEach(b=>{b.classList.toggle('is-current',b.dataset.page===page)});render();}

function athletePicker(){
  if(!db.athletes.length)return '<span class="muted small">No athlete selected</span>';
  const options=db.athletes.map(a=>`<option value="${html(a.id)}" ${a.id===db.selectedAthleteId?'selected':''}>${html(a.name)}</option>`).join('');
  return `<label class="picker-wrap"><span>Active athlete</span><select id="athlete-picker">${options}</select></label>`;
}

function pageHeader(title,subtitle,actions=''){
  return `<div class="page-heading"><div><p class="eyebrow">ACS · ATHLETE DEVELOPMENT</p><h2>${title}</h2><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function render(){
  const main=$('#app-main');
  const content={home:renderHome,athletes:renderAthletes,training:renderTraining,performance:renderPerformance,history:renderHistory,leaderboard:renderLeaderboard}[activePage]();
  const modeNote=viewMode==='athlete'?'<div class="mode-note"><strong>Athlete account</strong><span>Your training and results. Your coach manages your profile and plans.</span></div>':'';
  main.innerHTML=`${modeNote}<div class="content-wrap">${content}</div>`;
  $('#athlete-picker')?.addEventListener('change',e=>selectAthlete(e.target.value));
  bindMainActions();
  if(activePage==='leaderboard' && boards===null && !leaderboardLoading && !leaderboardError)loadLeaderboards();
}

function renderHome(){
  const selected=athlete();
  const totalRecords=db.records.length;
  const actions=`<button class="button button-primary" data-action="add-athlete">＋ Add athlete</button>`;
  let intro=`<div class="page-heading"><div><p class="eyebrow">ACS · ATHLETE DEVELOPMENT</p><h2>Training built around the athlete.</h2><p class="page-subtitle">Track development, assign workouts, and keep performance history in one place.</p></div><div class="heading-actions">${actions}</div></div>`;
  if(!db.athletes.length){
    return `${intro}<section class="welcome-grid"><article class="welcome-card welcome-primary"><div class="welcome-mark">ACS</div><div><span class="card-overline">START HERE</span><h3>Set up your first athlete</h3><p>Add a profile, assign a simple starting load, and begin recording training and performance history.</p><button class="button button-light" data-action="add-athlete">Create athlete profile</button></div></article><div class="welcome-side"><article class="mini-note"><span class="mini-icon">A/C/B</span><div><strong>A/C/B training cycle</strong><p>Keep block order visible. Add coach-approved sessions without guessing exercise prescriptions.</p></div></article><article class="mini-note"><span class="mini-icon">PR</span><div><strong>Performance history</strong><p>Keep vertical jump results in inches and horizontal jumps in feet and inches.</p></div></article><button class="button button-secondary full" data-action="import">Import past records</button></div></section><section class="local-notice"><strong>Shared workspace</strong><span>Changes are saved to the team database.</span></section>`;
  }
  if(!selected) db.selectedAthleteId=db.athletes[0].id;
  const current=athlete();
  const athleteRecords=db.records.filter(r=>r.athleteId===current.id);
  const prs=personalRecords(db.records,current.id);
  const next=nextWorkout(current.id);
  return `${intro}<div class="toolbar-row">${athletePicker()}<span class="view-caption">${viewMode==='coach'?'Coach overview':'Athlete workspace'}</span></div><section class="stat-grid"><article class="stat-card"><span>Roster</span><strong>${db.athletes.length}</strong><small>athlete${db.athletes.length===1?'':'s'} in this workspace</small></article><article class="stat-card"><span>Records</span><strong>${totalRecords}</strong><small>historical and new results</small></article><article class="stat-card"><span>Personal records</span><strong>${prs.size}</strong><small>best marks recorded</small></article><article class="stat-card stat-card-accent"><span>Development level</span><strong>${current.level}</strong><small>${html(current.name)}</small></article></section><section class="dashboard-grid"><article class="panel session-panel"><div class="panel-heading"><div><p class="eyebrow">NEXT UP</p><h3>${next?html(next.title):'Build the next session'}</h3></div><span class="pill ${next?.isDeload?'pill-neutral':'pill-burgundy'}">${next?html(next.block):'A / C / B'}</span></div>${next?`<p class="body-copy">${html(next.date||'Date not set')} · ${next.exercises.length} exercise${next.exercises.length===1?'':'s'}</p><div class="session-lines">${next.exercises.slice(0,3).map(ex=>`<div><span>${html(ex.name)}</span><b>${html(ex.sets||'—')} × ${html(ex.reps||'—')}</b></div>`).join('')||'<p class="muted">No exercises have been entered yet.</p>'}</div><div class="panel-footer"><button class="button button-secondary" data-action="complete-workout" data-id="${html(next.id)}">Log session</button><button class="button button-quiet" data-page="training">Training plans</button></div>`:`<p class="body-copy">A/C/B order stays visible. The coach controls exercise selection and phase-specific loads.</p><div class="cycle-track">${BLOCK_CYCLE.map((x,i)=>`<div class="cycle-step"><span>${x}</span><small>${i===0?'A':'Block '+x}</small></div>${i<2?'<i class="cycle-line"></i>':''}`).join('')}</div><div class="panel-footer"><button class="button button-secondary" data-page="training">Create a session</button></div>`}</article><article class="panel athlete-summary"><div class="panel-heading"><div><p class="eyebrow">ATHLETE SNAPSHOT</p><h3>${html(current.name)}</h3></div><span class="avatar-circle">${html(current.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span></div><p class="body-copy">${html(current.grade||'Grade not set')} · Level ${current.level}${current.events?.length?' · '+html(current.events.join(', ')):''}</p><div class="snapshot-metrics">${['100m','long-jump','cmj'].map(id=>{const pr=prs.get(id);const meta=METRICS.find(m=>m.id===id);return `<div class="snapshot-item"><span>${meta.label}</span><b>${pr?displayValue(id,pr.value):'—'}</b></div>`}).join('')}</div><div class="panel-footer"><button class="button button-quiet" data-page="performance">View performance</button><button class="button button-quiet" data-page="athletes">Roster</button></div></article></section><section class="callout-row"><div><b>Coach note</b><span>Early and mid-season pre-meets should keep a training purpose; don’t default to an overly light session.</span></div><button class="button button-quiet" data-page="training">Review programming rules</button></section>`;
}

function renderAthletes(){
  return `${pageHeader('Athletes','Create profiles and assign a comfortable starting load.',`<button class="button button-primary" data-action="add-athlete">＋ Add athlete</button>`)}<div class="toolbar-row">${athletePicker()}<span class="view-caption">${db.athletes.length} athlete${db.athletes.length===1?'':'s'}</span></div>${db.athletes.length?`<section class="athlete-grid">${db.athletes.map(a=>`<article class="athlete-card ${a.id===db.selectedAthleteId?'selected':''}"><button class="athlete-card-main" data-action="select-athlete" data-id="${html(a.id)}"><span class="avatar-circle">${html(a.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span><span class="athlete-card-copy"><strong>${html(a.name)}</strong><small>${html(a.grade||'Grade not set')} · Level ${a.level}</small><small>${a.sex==='female'?'Female · Girls leaderboard':a.sex==='male'?'Male · Boys leaderboard':'Sex not recorded'}</small><small class="muted">ID ${html(a.id)}</small></span><span class="level-chip">L${a.level}</span></button><div class="athlete-card-bottom"><span>${html((a.events||[]).join(' · ')||'Events not set')}</span><button class="text-button" data-action="edit-sex" data-id="${html(a.id)}">Set sex</button><button class="text-button" data-action="view-athlete" data-id="${html(a.id)}">Open</button></div></article>`).join('')}</section>`:`<div class="empty-panel"><div class="empty-icon">♙</div><h3>No profiles yet</h3><p>Create an athlete profile to begin assigning training and recording history.</p><button class="button button-primary" data-action="add-athlete">Create athlete</button></div>`}<section class="local-notice"><strong>Simple intake</strong><span>Use an estimated 1RM or a very comfortable standard 3×4 weight. For Levels 1–3, an estimated 1RM is stored as context and is not converted into a working load.</span></section>`;
}

function renderTraining(){
  const current=athlete();
  const plans=current?db.plans.filter(p=>p.athleteId===current.id && p.status!=='completed').sort((a,b)=>(b.date||'').localeCompare(a.date||'')):[];
  const workouts=current?db.workouts.filter(w=>w.athleteId===current.id).sort((a,b)=>(b.date||'').localeCompare(a.date||'')):[];
  return `${pageHeader('Training','Create coach-directed sessions and record the work completed.',`<button class="button button-primary" data-action="create-workout" ${current?'':'disabled'}>＋ New session</button>`)}<div class="toolbar-row">${athletePicker()}<span class="view-caption">A/C/B cycle · configurable by coach</span></div>${!current?`<div class="empty-panel"><h3>Add an athlete first</h3><p>Training plans are attached to an athlete profile.</p><button class="button button-primary" data-action="add-athlete">Add athlete</button></div>`:`<div class="training-rules-grid"><article class="rule-card"><span class="rule-number">01</span><div><b>Levels 1–3</b><p>Start with the comfortable 3×4 weight when recorded. Keep progression gradual; no RIR prompts or 1RM-driven load jumps.</p></div></article><article class="rule-card"><span class="rule-number">02</span><div><b>Levels 4+</b><p>A phase-adjusted estimate can be calculated, but the coach reviews the working load before it is assigned.</p></div></article><article class="rule-card"><span class="rule-number">03</span><div><b>Deloads</b><p>Log the session, but exclude it from progression decisions.</p></div></article></div><section class="panel"><div class="panel-heading"><div><p class="eyebrow">PLAN HISTORY</p><h3>Sessions</h3></div><span class="subtle">${plans.length+workouts.length} total</span></div>${plans.length||workouts.length?`<div class="session-list">${[...plans.map(p=>({...p,kind:'Planned'})),...workouts.map(w=>({...w,kind:w.completed?'Completed':'Logged'}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>`<article class="session-row"><div class="session-date"><b>${formatDate(p.date)}</b><small>${p.kind}</small></div><div class="session-title"><strong>${html(p.title||`Block ${p.block} session`)}</strong><small>${html(p.block||'—')} block${p.isDeload?' · Deload':''} · ${(p.exercises||[]).length} exercises</small></div><button class="button button-small button-quiet" data-action="${p.kind==='Planned'?'view-plan':'view-workout'}" data-id="${html(p.id)}">Details</button></article>`).join('')}</div>`:`<div class="empty-inline"><p>No sessions yet. Set the block, exercise list, sets and reps; the app will keep the A/C/B cycle ordered.</p><button class="button button-secondary" data-action="create-workout">Create first session</button></div>`}</section><section class="callout-row"><div><b>Pre-meet planning</b><span>Early/mid-season work should not be overly light. Isometric examples from the coaching notes: 3×3 or 5×5×1-second holds.</span></div><span class="pill pill-neutral">State peaking plan still needs coach review</span></section><section class="local-notice"><strong>Bench conversion</strong><span>Dumbbell bench to barbell bench: 90% of the combined dumbbell load, rounded down. This conversion is specific to bench press.</span></section>`}`;
}

function renderPerformance(){
  const current=athlete();
  const actions=`<button class="button button-primary" data-action="add-record" ${current?'':'disabled'}>＋ Add result</button>`;
  const prs=current?personalRecords(db.records,current.id):new Map();
  const records=current?db.records.filter(r=>r.athleteId===current.id).sort((a,b)=>b.date.localeCompare(a.date)):[];
  const groups=METRIC_GROUPS.map(group=>{
    const metrics=METRICS.filter(m=>m.group===group);
    return `<section class="metric-group"><div class="section-title"><h3>${html(group)}</h3><span>${group==='Vertical jumps'?'Displayed in inches':group==='Horizontal jumps'?'Displayed in feet and inches':'Best recorded mark'}</span></div><div class="metric-grid">${metrics.map(m=>{const pr=prs.get(m.id);const count=records.filter(r=>r.metric===m.id).length;return `<article class="metric-card ${pr?'has-result':''}"><div class="metric-card-head"><span>${html(m.label)}</span><span class="metric-count">${count} ${count===1?'mark':'marks'}</span></div><strong>${pr?displayValue(m.id,pr.value):'<span class="no-mark">No result yet</span>'}</strong><small>${pr?`PR · ${formatDate(pr.date)}`:'Record a first mark'}</small></article>`}).join('')}</div></section>`;
  }).join('');
  return `${pageHeader('Performance','A personal-record wall across events, tests, and training indicators.',actions)}<div class="toolbar-row">${athletePicker()}<span class="view-caption">${records.length} performance entr${records.length===1?'y':'ies'}</span></div>${current?groups:`<div class="empty-panel"><h3>Select an athlete</h3><p>Create or choose an athlete profile to see performance cards.</p><button class="button button-primary" data-action="add-athlete">Add athlete</button></div>`}<section class="panel records-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT HISTORY</p><h3>Latest entries</h3></div><button class="button button-quiet" data-page="history">Open past records</button></div>${records.length?`<div class="table-scroll"><table><thead><tr><th>Date</th><th>Measure</th><th>Result</th><th>Note</th><th></th></tr></thead><tbody>${records.slice(0,8).map(r=>`<tr><td>${formatDate(r.date)}</td><td>${html(METRICS.find(m=>m.id===r.metric)?.label||r.metric)}</td><td><strong>${displayValue(r.metric,r.value)}</strong></td><td>${html(r.note||'—')}</td><td><button class="text-button danger-text" data-action="delete-record" data-id="${html(r.id)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-inline"><p>No performance records yet.</p>${current?'<button class="button button-secondary" data-action="add-record">Add first result</button>':''}</div>`}</section>`;
}

async function loadLeaderboards(){
  leaderboardLoading=true;
  try{boards=(await api('leaderboards')).leaderboards;leaderboardError='';}
  catch(error){leaderboardError=error.message;}
  finally{leaderboardLoading=false;if(activePage==='leaderboard')render();}
}
function renderLeaderboard(){
  const metric=LEADERBOARD_METRICS.find(m=>m.id===leaderboardMetric);
  const board=boards?.find(b=>b.metricId===metric.id);
  const list=(title,entries)=>`<section class="panel leaderboard-panel"><div class="panel-heading"><h3>${title} · Top 10</h3></div>${entries.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Rank</th><th scope="col">Athlete</th><th scope="col">Best result</th><th scope="col">Date</th></tr></thead><tbody>${entries.map(e=>`<tr ${e.athleteId===user.athleteId?'class="leaderboard-self"':''}><td>${e.rank}</td><td>${html(e.name)}${e.athleteId===user.athleteId?' <small>(you)</small>':''}</td><td><strong>${displayValue(metric.id,e.value)}</strong><small class="leaderboard-mobile-date">${e.date?formatDate(e.date):''}</small></td><td>${e.date?formatDate(e.date):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-inline"><p>No eligible results yet.</p></div>'}</section>`;
  const missing=user.role==='coach'?db.athletes.filter(a=>!a.sex).length:0;
  return `${pageHeader('Leaderboards','Team bests across performance tests and training KPIs.')}<div class="toolbar-row"><label class="picker-wrap"><span>Metric</span><select id="leaderboard-metric">${LEADERBOARD_METRICS.map(m=>`<option value="${m.id}" ${m.id===leaderboardMetric?'selected':''}>${html(m.label)}</option>`).join('')}</select></label><span class="view-caption">${metric.direction==='min'?'Lower':'Higher'} is better · All-time best</span></div>${missing?`<section class="local-notice"><strong>${missing} athlete${missing===1?'':'s'} need sex recorded</strong><span>Set sex in Athletes to include them in a leaderboard.</span><button class="text-button" data-page="athletes">Open athletes</button></section>`:''}${leaderboardError?`<div class="empty-panel" role="alert"><p>${html(leaderboardError)}</p><button class="button button-secondary" id="retry-leaderboards">Retry</button></div>`:!board?'<p role="status">Loading team rankings…</p>':`<div class="leaderboard-grid">${list('Girls',board.girls)}${list('Boys',board.boys)}</div>`}<section class="local-notice"><strong>One spot per athlete</strong><span>Best recorded mark for each metric. Ties share a rank; each list shows at most 10 athletes. Athletes without sex recorded are excluded. Body weight is never ranked.</span></section>`;
}

function renderHistory(){
  const rows=athlete()?db.records.filter(r=>r.athleteId===db.selectedAthleteId):db.records;
  const ordered=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
  return `${pageHeader('Past records','Import, preview, sort, and preserve performance history.',`<button class="button button-secondary" data-action="import">Import records</button><button class="button button-primary" data-action="add-record" ${athlete()?'':'disabled'}>＋ Add result</button>`)}<div class="toolbar-row">${athletePicker()}<span class="view-caption">${ordered.length} record${ordered.length===1?'':'s'} shown</span></div><section class="import-callout"><div><div class="import-icon">↥</div><div><h3>Bring in historical results</h3><p>Preview the rows first. Valid athlete IDs are required; duplicates are skipped and existing records are never overwritten.</p></div></div><button class="button button-dark" data-action="import">Choose CSV or JSON</button></section><section class="panel records-panel"><div class="panel-heading"><div><p class="eyebrow">SORTED BY DATE</p><h3>Performance record history</h3></div><button class="button button-quiet" id="export-records">Export JSON backup</button></div>${ordered.length?`<div class="table-scroll"><table><thead><tr><th>Date</th><th>Athlete ID</th><th>Measure</th><th>Result</th><th>Note</th><th></th></tr></thead><tbody>${ordered.map(r=>{const a=db.athletes.find(x=>x.id===r.athleteId);return `<tr><td>${formatDate(r.date)}</td><td><span class="id-tag">${html(a?.id||r.athleteId)}</span></td><td>${html(METRICS.find(m=>m.id===r.metric)?.label||r.metric)}</td><td><strong>${displayValue(r.metric,r.value)}</strong></td><td>${html(r.note||'—')}</td><td><button class="text-button danger-text" data-action="delete-record" data-id="${html(r.id)}">Remove</button></td></tr>`}).join('')}</tbody></table></div>`:`<div class="empty-inline"><p>No saved records yet. Import a file or add results manually.</p><button class="button button-secondary" data-action="import">Import history</button></div>`}</section><section class="local-notice"><strong>Merge-only import</strong><span>New rows are appended. Matching entries are skipped; existing data is never replaced.</span></section>`;
}

function bindMainActions(){
  $('#leaderboard-metric')?.addEventListener('change',e=>{leaderboardMetric=e.target.value;render();});
  $('#retry-leaderboards')?.addEventListener('click',()=>{leaderboardError='';loadLeaderboards();});
  if(viewMode==='athlete'){
    $('#import-shortcut').hidden=true;
    $('#manage-account').hidden=true;
    $('#migrate-local').hidden=true;
    $$('#app-main [data-action="add-athlete"], #app-main [data-action="add-record"], #app-main [data-action="delete-record"], #app-main [data-action="import"], #app-main [data-action="create-workout"], #app-main [data-action="edit-sex"]').forEach(el=>el.hidden=true);
    $$('#app-main .import-callout').forEach(el=>el.hidden=true);
  }
  $$('#app-main [data-page]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.page)));
  $$('#app-main [data-action]').forEach(btn=>btn.addEventListener('click',()=>handleAction(btn.dataset.action,btn.dataset.id)));
  $('#export-records')?.addEventListener('click',exportBackup);
  const benchNotice=$$('#app-main .local-notice').find(el=>el.querySelector('strong')?.textContent==='Bench conversion');
  if(benchNotice){
    benchNotice.classList.add('bench-notice');
    benchNotice.innerHTML='<div><strong>Dumbbell → barbell bench</strong><span>90% of the combined dumbbell load, rounded down.</span></div><label class="bench-calculator"><span>Dumbbell weight per hand</span><input id="bench-dumbbell" type="number" min="0" step="0.5" placeholder="lb"><output id="bench-barbell" aria-live="polite">Enter a weight</output></label>';
    $('#bench-dumbbell').addEventListener('input',e=>{const value=calculateBenchConversion(e.target.value);$('#bench-barbell').textContent=value===null?'Enter a weight':`${value} lb barbell estimate`});
  }
}
function bindNav(){
  $$('#main-nav .nav-item').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.page)));
  $('#manage-account').addEventListener('click',accountForm);
  $('#refresh-data').addEventListener('click',()=>refreshWorkspace().catch(e=>alert(e.message)));
  $('#sign-out').addEventListener('click',async()=>{try{await api('logout','POST',{});location.reload();}catch(e){alert(e.message)}});
  $('#migrate-local').addEventListener('click',migrateLocal);
  $('#change-password').addEventListener('click',passwordForm);
  $('#export-data').addEventListener('click',exportBackup);
  $('#import-shortcut').addEventListener('click',()=>$('#file-input').click());
  $('#file-input').addEventListener('change',handleFile);
}
function handleAction(action,id){
  if(user.role!=='coach' && ['add-athlete','add-record','delete-record','create-workout','import','edit-sex'].includes(action))return;
  switch(action){
    case 'add-athlete':return athleteForm();
    case 'edit-sex':return sexForm(id);
    case 'select-athlete':selectAthlete(id);return;
    case 'view-athlete':selectAthlete(id);go('home');return;
    case 'add-record':return recordForm();
    case 'delete-record':return deleteRecord(id);
    case 'create-workout':return workoutForm();
    case 'complete-workout':return workoutLogForm(id);
    case 'view-plan':return viewPlan(id);
    case 'view-workout':return viewWorkout(id);
    case 'import':$('#file-input').click();return;
  }
}

function athleteForm(){
  showModal(`<form method="dialog" id="athlete-form" class="modal-card"><div class="modal-head"><div><p class="eyebrow">ATHLETE INTAKE</p><h2>New athlete</h2></div><button type="button" class="close-button" data-close aria-label="Close">×</button></div><div class="form-grid"><label class="field span-two"><span>Full name</span><input name="name" required autocomplete="name" placeholder="Athlete name"></label><label class="field"><span>Athlete ID</span><input name="id" value="${uniqueId()}" required><small>Use the same ID in historical imports.</small></label><label class="field"><span>Sex</span><select name="sex" required><option value="">Choose sex</option><option value="female">Female (girls)</option><option value="male">Male (boys)</option></select><small>Used for girls and boys leaderboards.</small></label><label class="field"><span>Grade / year</span><input name="grade" placeholder="e.g. 10th grade"></label><label class="field"><span>Development level</span><select name="level"><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4">Level 4</option><option value="5">Level 5</option></select></label><label class="field"><span>Primary event focus</span><input name="events" placeholder="e.g. 100m, long jump"></label></div><div class="form-divider"><div><h3>Starting load (optional)</h3><p>Accept either an easy 3×4 weight or an estimated 1RM.</p></div></div><div class="form-grid"><label class="field"><span>Exercise</span><input name="exercise" placeholder="Coach-selected exercise"></label><label class="field"><span>Intake type</span><select name="intakeType"><option value="comfortable-3x4">Comfortable standard 3×4 load</option><option value="estimated-1rm">Estimated 1RM</option></select></label><label class="field"><span>Weight (lb)</span><input name="weight" type="number" min="0" step="0.5" placeholder="Optional"></label><label class="field"><span>Starting body weight (optional)</span><div class="inline-inputs"><input name="bodyWeight" type="number" min="0" step="0.1" placeholder="lb"><input name="bodyWeightDate" type="date" value="${dateToday()}" aria-label="Body weight date"></div><small>Occasional reference only; not a weigh-in schedule.</small></label></div><p class="form-hint level-hint">Levels 1–3: comfortable 3×4 loads are used as the starting point. An estimated 1RM is stored for reference and is not converted into a working load.</p><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button type="submit" class="button button-primary">Save athlete</button></div></form>`);
  const form=$('#athlete-form');
  $('[data-close]',form).addEventListener('click',closeModal);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const d=new FormData(form);const id=String(d.get('id')).trim();
    if(db.athletes.some(a=>a.id===id)){alert('That athlete ID is already in use. Choose a unique ID.');return;}
    const a={id,sex:String(d.get('sex')),name:String(d.get('name')).trim(),grade:String(d.get('grade')).trim(),level:Number(d.get('level')),events:String(d.get('events')).split(',').map(x=>x.trim()).filter(Boolean),createdAt:new Date().toISOString(),baselines:[]};
    const exercise=String(d.get('exercise')).trim(),weight=Number(d.get('weight'));
    if(exercise&&weight>0)a.baselines.push({name:exercise,intakeType:String(d.get('intakeType')),startWeight:String(d.get('intakeType'))==='comfortable-3x4'?weight:null,estimated1RM:String(d.get('intakeType'))==='estimated-1rm'?weight:null});
    db.athletes.push(a);db.selectedAthleteId=a.id;
    const bw=Number(d.get('bodyWeight'));
    if(bw>0)db.records.push({id:crypto.randomUUID(),athleteId:a.id,metric:'body-weight',date:String(d.get('bodyWeightDate')||dateToday()),value:bw,unit:'lb',note:'Starting reference'});
    if(!await save())return;closeModal();go('athletes');
  });
}

function sexForm(id){
  if(user.role!=='coach')return;
  const profile=athlete(id);if(!profile)return;
  showModal(`<form id="sex-form" class="modal-card"><h2>Sex · ${html(profile.name)}</h2><label class="field"><span>Sex</span><select name="sex"><option value="">Not recorded</option><option value="female" ${profile.sex==='female'?'selected':''}>Female (girls)</option><option value="male" ${profile.sex==='male'?'selected':''}>Male (boys)</option></select></label><p>Used to group leaderboard results. Leave unrecorded if it is unknown.</p><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button type="submit" class="button button-primary">Save sex</button></div></form>`);
  $('#sex-form').addEventListener('submit',async e=>{e.preventDefault();profile.sex=new FormData(e.target).get('sex') || null;if(!await save())return;closeModal();render();});
}

function recordForm(){
  if(!athlete()){alert('Create or select an athlete first.');return;}
  const options=METRIC_GROUPS.map(g=>`<optgroup label="${html(g)}">${METRICS.filter(m=>m.group===g).map(m=>`<option value="${m.id}">${html(m.label)} · ${m.unit==='in'?'inches':m.unit==='ft-in'?'feet and inches':m.unit}</option>`).join('')}</optgroup>`).join('');
  showModal(`<form method="dialog" id="record-form" class="modal-card"><div class="modal-head"><div><p class="eyebrow">PERFORMANCE LOG</p><h2>Add a result</h2></div><button type="button" class="close-button" data-close>×</button></div><div class="form-grid"><label class="field span-two"><span>Athlete</span><select name="athleteId">${db.athletes.map(a=>`<option value="${html(a.id)}" ${a.id===db.selectedAthleteId?'selected':''}>${html(a.name)} · ${html(a.id)}</option>`).join('')}</select></label><label class="field"><span>Measure</span><select name="metric" id="record-metric">${options}</select></label><label class="field"><span>Date</span><input name="date" type="date" value="${dateToday()}" required></label><label class="field span-two" id="record-value-wrap"><span>Result</span><input name="value" type="number" step="any" min="0" required><small id="record-unit-note">Vertical jumps are recorded in inches.</small></label><label class="field span-two"><span>Note (optional)</span><input name="note" placeholder="Conditions, test details, or coach observation"></label></div><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button class="button button-primary" type="submit">Save result</button></div></form>`);
  const form=$('#record-form'), metric=$('#record-metric');
  $('[data-close]',form).addEventListener('click',closeModal);
  const updateUnit=()=>{
    const selected=METRICS.find(m=>m.id===metric.value),wrap=$('#record-value-wrap',form);
    if(selected.unit==='ft-in'){
      wrap.innerHTML='<span>Result</span><div class="inline-inputs"><input name="feet" type="number" min="0" step="1" placeholder="Feet" required><input name="inches" type="number" min="0" max="11.99" step="0.1" placeholder="Inches" required></div><small>Horizontal jumps are stored and shown in feet and inches.</small>';
    }else{
      wrap.innerHTML=`<span>Result</span><input name="value" type="number" step="any" min="0" required><small>${selected.unit==='in'?'Vertical jumps are recorded in inches.':`Unit: ${html(selected.unit)}`}</small>`;
    }
  };
  metric.addEventListener('change',updateUnit);updateUnit();
  form.addEventListener('submit',async e=>{
    e.preventDefault();const d=new FormData(form),metricId=String(d.get('metric'));
    const metricInfo=METRICS.find(m=>m.id===metricId);
    const value=metricInfo.unit==='ft-in'?Number(d.get('feet'))*12+Number(d.get('inches')):Number(d.get('value'));
    if(!Number.isFinite(value)||value<0){alert('Enter a valid result.');return;}
    db.records.push({id:crypto.randomUUID(),athleteId:String(d.get('athleteId')),metric:metricId,date:String(d.get('date')),value,unit:metricInfo.unit,note:String(d.get('note')||'').trim()});
    if(!await save())return;closeModal();go('performance');
  });
}

function workoutForm(){
  const current=athlete();if(!current){alert('Create an athlete first.');return;}
  const prior=db.plans.filter(p=>p.athleteId===current.id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
  const suggested=prior?nextBlock(prior.block):'A';
  const baselineOptions=(current.baselines||[]).map(b=>`<option value="${html(b.name)}">${html(b.name)}</option>`).join('');
  showModal(`<form id="workout-form" class="modal-card modal-wide"><div class="modal-head"><div><p class="eyebrow">COACH WORKSPACE</p><h2>Build a session</h2><p class="page-subtitle">${html(current.name)} · Level ${current.level}</p></div><button type="button" class="close-button" data-close>×</button></div><div class="form-grid"><label class="field"><span>Block</span><select name="block">${BLOCK_CYCLE.map(b=>`<option value="${b}" ${b===suggested?'selected':''}>${b}</option>`).join('')}</select><small>A/C/B cycle; suggested next from the last plan.</small></label><label class="field"><span>Session date</span><input name="date" type="date" value="${dateToday()}"></label><label class="field"><span>Session focus</span><input name="title" placeholder="e.g. Acceleration + strength"></label><label class="field"><span>Phase target for Level 4+</span><div class="percent-input"><input name="targetPercent" type="number" min="1" max="100" step="1" placeholder="Coach sets"><span>% of estimate</span></div><small>Leave blank until the coach sets a phase target.</small></label></div><div class="switch-row"><label class="check-label"><input type="checkbox" name="isDeload"><span>Deload session</span></label><span>Logged for history; excluded from progression decisions.</span></div><div class="exercise-builder"><div class="section-title"><h3>Exercises</h3><span>Exercise prescriptions remain coach-selected.</span></div><div id="exercise-rows"></div><div class="builder-footer"><button type="button" class="button button-quiet" id="add-exercise-row">＋ Add exercise</button>${baselineOptions?`<label class="quick-add"><span>Starting-load exercise</span><select id="baseline-picker"><option value="">Choose…</option>${baselineOptions}</select></label>`:''}</div></div><div class="form-hint">Pre-meet note: early/mid-season sessions should keep a training purpose. Examples already used include 3×3 or 5×5×1-second isometrics. Championship peaking needs coach review; the old one-set rule is only an unconfirmed pilot.</div><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button class="button button-primary" type="submit">Save session</button></div></form>`);
  const form=$('#workout-form'),rows=$('#exercise-rows',form);
  $('[data-close]',form).addEventListener('click',closeModal);
  const addRow=(name='',sets='',reps='',load='')=>{
    const row=document.createElement('div');row.className='exercise-row';
    row.innerHTML=`<label class="field"><span>Exercise</span><input name="exerciseName" value="${html(name)}" placeholder="Coach-selected exercise" required></label><label class="field compact"><span>Sets</span><input name="sets" type="number" min="1" step="1" value="${html(sets)}" placeholder="—"></label><label class="field compact"><span>Reps / hold</span><input name="reps" value="${html(reps)}" placeholder="e.g. 4"></label><label class="field compact"><span>Load</span><input name="load" type="number" min="0" step="0.5" value="${html(load)}" placeholder="—"></label><button type="button" class="remove-row" aria-label="Remove exercise">×</button>`;
    $('.remove-row',row).addEventListener('click',()=>row.remove());rows.append(row);
  };
  addRow();$('#add-exercise-row',form).addEventListener('click',()=>addRow());
  $('#baseline-picker',form)?.addEventListener('change',e=>{
    const baseline=current.baselines.find(b=>b.name===e.target.value);if(!baseline)return;
    const row=document.createElement('div');row.className='exercise-row';row.dataset.baselineName=baseline.name;
    const target=Number($('[name="targetPercent"]',form).value)/100||null;
    const startInfo=getStartingLoad(current,baseline,target),start=startInfo.load;
    row.innerHTML=`<label class="field"><span>Exercise</span><input name="exerciseName" value="${html(baseline.name)}" required></label><label class="field compact"><span>Sets</span><input name="sets" type="number" min="1" step="1" placeholder="—"></label><label class="field compact"><span>Reps / hold</span><input name="reps" placeholder="e.g. 4"></label><label class="field compact"><span>Load ${baseline.intakeType==='estimated-1rm'&&Number(current.level)>=4?'(review)':'(lb)'}</span><input name="load" type="number" min="0" step="0.5" value="${start??''}" placeholder="${baseline.intakeType==='estimated-1rm'?'Coach review':'—'}"></label><small class="exercise-basis">${baseline.intakeType==='estimated-1rm'?`Estimated 1RM: ${baseline.estimated1RM} lb · ${Number(current.level)<=3?'No automatic load calculation for Levels 1–3.':'Set a phase target above; review the proposal before assigning.'}`:'Comfortable 3×4 starting load.'}</small><button type="button" class="remove-row" aria-label="Remove exercise">×</button>`;
    $('.remove-row',row).addEventListener('click',()=>row.remove());rows.append(row);e.target.value='';
  });
  const refreshLevel4Loads=()=>{
    const pct=Number($('[name="targetPercent"]',form).value)/100;
    $$('.exercise-row[data-baseline-name]',rows).forEach(row=>{
      const baseline=current.baselines.find(b=>b.name===row.dataset.baselineName);
      if(!baseline||baseline.intakeType!=='estimated-1rm'||Number(current.level)<=3)return;
      const proposed=getStartingLoad(current,baseline,pct||null);
      const loadInput=$('[name="load"]',row);
      if(!loadInput.dataset.edited)loadInput.value=proposed.load??'';
      const note=$('.exercise-basis',row);
      if(note)note.textContent=`Estimated 1RM: ${baseline.estimated1RM} lb${proposed.load!==null?` · proposed ${Math.round(pct*100)}% load: ${proposed.load} lb · coach review required`:' · set a phase target to calculate a proposal'}`;
    });
  };
  $('[name="targetPercent"]',form).addEventListener('input',refreshLevel4Loads);
  rows.addEventListener('input',e=>{if(e.target.name==='load')e.target.dataset.edited='true'});
  form.addEventListener('submit',async e=>{
    e.preventDefault();const d=new FormData(form),exerciseRows=$$('.exercise-row',rows);
    const exercises=exerciseRows.map(row=>({name:$('[name="exerciseName"]',row).value.trim(),sets:$('[name="sets"]',row).value.trim(),reps:$('[name="reps"]',row).value.trim(),load:$('[name="load"]',row).value?Number($('[name="load"]',row).value):null})).filter(x=>x.name);
    if(!exercises.length){alert('Add at least one exercise.');return;}
    const block=String(d.get('block'));
    const plan={id:crypto.randomUUID(),athleteId:current.id,block,date:String(d.get('date')||''),title:String(d.get('title')||`Block ${block} session`).trim(),targetPercent:Number(d.get('targetPercent'))?Number(d.get('targetPercent'))/100:null,isDeload:d.get('isDeload')==='on',exercises,createdAt:new Date().toISOString(),status:'planned'};
    db.plans.push(plan);if(!await save())return;closeModal();go('training');
  });
}

function workoutLogForm(id){
  const plan=db.plans.find(p=>p.id===id);if(!plan)return;
  const a=db.athletes.find(x=>x.id===plan.athleteId);
  const status=progressionStatus({level:a.level,isDeload:plan.isDeload,completed:true});
  showModal(`<form id="workout-log-form" class="modal-card"><div class="modal-head"><div><p class="eyebrow">SESSION LOG</p><h2>${html(plan.title)}</h2><p class="page-subtitle">${html(a.name)} · Block ${plan.block}</p></div><button type="button" class="close-button" data-close>×</button></div><div class="log-exercise-list">${plan.exercises.map((x,i)=>`<div class="log-exercise"><div><b>${html(x.name)}</b><small>${html(x.sets||'—')} × ${html(x.reps||'—')} ${x.load?`· ${html(x.load)} lb`:''}</small></div><label class="check-label"><input type="checkbox" name="done-${i}" checked><span>Done</span></label></div>`).join('')}</div><label class="field"><span>Coach observation (optional)</span><textarea name="notes" rows="3" placeholder="What did you observe? No reps-in-reserve question."></textarea></label><div class="notice-box ${plan.isDeload?'notice-neutral':''}">${html(status.message)}</div><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button type="submit" class="button button-primary">Save log</button></div></form>`);
  const form=$('#workout-log-form');$('[data-close]',form).addEventListener('click',closeModal);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const d=new FormData(form),button=$('[type="submit"]',form);button.disabled=true;
    try{applyWorkspace(await api('workouts','POST',{planId:plan.id,done:plan.exercises.map((x,i)=>d.get(`done-${i}`)==='on'),note:String(d.get('notes')||'').trim()}));setStatus('Workout saved');closeModal();go('training');}
    catch(error){alert(error.message);button.disabled=false;}
  });
}

function viewPlan(id){
  const plan=db.plans.find(p=>p.id===id);if(!plan)return;
  showModal(`<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">PLANNED SESSION</p><h2>${html(plan.title)}</h2></div><button type="button" class="close-button" data-close>×</button></div><p class="body-copy">${formatDate(plan.date)} · Block ${html(plan.block)}${plan.isDeload?' · Deload':''}</p><div class="session-lines">${plan.exercises.map(x=>`<div><span>${html(x.name)}</span><b>${html(x.sets||'—')} × ${html(x.reps||'—')} ${x.load?`· ${html(x.load)} lb`:''}</b></div>`).join('')}</div><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Close</button><button type="button" class="button button-primary" id="log-this-plan">Log session</button></div></div>`);
  $('[data-close]',$('#modal')).addEventListener('click',closeModal);$('#log-this-plan').addEventListener('click',()=>{closeModal();workoutLogForm(id)});
}
function viewWorkout(id){
  const item=db.workouts.find(w=>w.id===id);if(!item)return;
  showModal(`<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">SESSION HISTORY</p><h2>${html(item.title)}</h2></div><button type="button" class="close-button" data-close>×</button></div><p class="body-copy">${formatDate(item.date)} · Block ${html(item.block)}${item.isDeload?' · Deload':''}</p><div class="session-lines">${item.exercises.map(x=>`<div><span>${html(x.name)}</span><b>${x.done?'Completed':'Modified / not completed'} · ${html(x.sets||'—')} × ${html(x.reps||'—')}</b></div>`).join('')}</div>${item.coachNote?`<div class="notice-box">${html(item.coachNote)}</div>`:''}<div class="notice-box ${item.isDeload?'notice-neutral':''}">${html(item.isDeload?'Deload excluded from progression decisions.':'Progression review remains coach-directed.')}</div><div class="modal-actions"><button class="button button-quiet" data-close>Close</button></div></div>`);
  $('[data-close]',$('#modal')).addEventListener('click',closeModal);
}

function nextWorkout(athleteId){return db.plans.filter(p=>p.athleteId===athleteId&&p.status!=='completed').sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0]||null;}
async function deleteRecord(id){
  if(!confirm('Remove this incorrect record?'))return;
  db.records=db.records.filter(r=>r.id!==id);if(!await save())return;render();
}

function handleFile(e){
  const file=e.target.files?.[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      let rows=[],workouts=[];
      if(file.name.toLowerCase().endsWith('.csv')) rows=parseCSV(String(reader.result));
      else{
        const parsed=JSON.parse(String(reader.result));
        rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed.records)?parsed.records:[]);
        workouts=!Array.isArray(parsed)&&Array.isArray(parsed.workouts)?parsed.workouts:[];
      }
      pendingImport={...previewImport(rows,db.athletes,db.records),workouts:previewWorkoutImport(workouts,db.athletes,db.workouts)};
      showImportPreview(file.name,rows.length+workouts.length);
    }catch(err){alert(`Could not read that file: ${err.message}`)}
    e.target.value='';
  };
  reader.readAsText(file);
}
function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  if(lines.length<2)return [];
  const parseLine=line=>{const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&quoted){value+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===','&&!quoted){out.push(value);value=''}else value+=c;}out.push(value);return out};
  const headers=parseLine(lines[0]).map(x=>x.trim().toLowerCase().replace(/[\s-]+/g,'_'));
  return lines.slice(1).map(line=>{const cells=parseLine(line);const row={};headers.forEach((h,i)=>row[h]=cells[i]??'');return row;});
}
function showImportPreview(name,rowCount){
  const preview=pendingImport||{accepted:[],duplicates:[],rejected:[],workouts:{accepted:[],duplicates:[],rejected:[]}};
  const records=preview.accepted||[],workouts=preview.workouts?.accepted||[];
  const duplicates=(preview.duplicates?.length||0)+(preview.workouts?.duplicates?.length||0);
  const rejected=[...(preview.rejected||[]),...(preview.workouts?.rejected||[])];
  const acceptedCount=records.length+workouts.length;
  showModal(`<div class="modal-card modal-wide"><div class="modal-head"><div><p class="eyebrow">HISTORY IMPORT PREVIEW</p><h2>Review before saving</h2><p class="page-subtitle">${html(name)} · ${rowCount} rows checked</p></div><button type="button" class="close-button" data-close>×</button></div><div class="import-summary"><div><b>${acceptedCount}</b><span>new items</span></div><div><b>${duplicates}</b><span>duplicates skipped</span></div><div><b>${rejected.length}</b><span>rows need correction</span></div></div><p class="form-hint">Existing history stays intact. Only valid, new rows will be added.</p>${records.length?`<div class="section-title preview-heading"><h3>Performance records</h3></div><div class="table-scroll preview-scroll"><table><thead><tr><th>Row</th><th>Athlete ID</th><th>Measure</th><th>Date</th><th>Result</th></tr></thead><tbody>${records.map((r,i)=>`<tr><td>${i+1}</td><td>${html(r.athleteId)}</td><td>${html(METRICS.find(m=>m.id===r.metric)?.label||r.metric)}</td><td>${formatDate(r.date)}</td><td>${displayValue(r.metric,r.value)}</td></tr>`).join('')}</tbody></table></div>`:''}${workouts.length?`<div class="section-title preview-heading"><h3>Workout history</h3></div><div class="table-scroll preview-scroll"><table><thead><tr><th>Athlete ID</th><th>Session</th><th>Date</th><th>Block</th><th>Exercises</th></tr></thead><tbody>${workouts.map(w=>`<tr><td>${html(w.athleteId)}</td><td>${html(w.title)}</td><td>${formatDate(w.date)}</td><td>${html(w.block)}</td><td>${w.exercises.length}</td></tr>`).join('')}</tbody></table></div>`:''}${rejected.length?`<div class="rejected-list"><h3>Rows to fix</h3>${rejected.slice(0,8).map(x=>`<p><b>Row ${x.row}:</b> ${html(x.reason)}</p>`).join('')}${rejected.length>8?`<small>and ${rejected.length-8} more</small>`:''}</div>`:''}<div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button type="button" class="button button-primary" id="save-import" ${acceptedCount?'':'disabled'}>Add ${acceptedCount} new item${acceptedCount===1?'':'s'}</button></div></div>`);
  $('[data-close]',$('#modal')).addEventListener('click',()=>{pendingImport=null;closeModal()});
  $('#save-import')?.addEventListener('click',async()=>{db.records.push(...records);db.workouts.push(...workouts);if(!await save())return;pendingImport=null;closeModal();go('history')});
}

function exportBackup(){
  const payload={app:'ACS Athlete Development',schemaVersion:db.schemaVersion,exportedAt:new Date().toISOString(),...db};
  download(`acs-athlete-development-${dateToday()}.json`,JSON.stringify(payload,null,2),'application/json');
}
function download(name,content,type){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([content],{type}));link.download=name;link.click();URL.revokeObjectURL(link.href)}
function formatDate(date){if(!date)return 'Date not set';const d=new Date(`${date}T12:00:00`);return Number.isNaN(d.getTime())?html(date):new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d)}

$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')||e.target.closest('[data-close]'))closeModal()});
async function initialize(){
  try{
    const session=await api('session');
    if(!session.user){showLogin(session.setupAvailable);return;}
    user=session.user;viewMode=user.role;
    $('#account-label').textContent=`${user.email} · ${user.role}`;
    $('#app-shell').hidden=false;$('#auth-screen').hidden=true;
    $('#manage-account').hidden=user.role!=='coach';$('#migrate-local').hidden=user.role!=='coach';
    $('#import-shortcut').hidden=user.role!=='coach';
    bindNav();await refreshWorkspace();setStatus('Connected to shared database');
  }catch(error){$('#auth-screen').hidden=false;$('#auth-screen').textContent='Unable to connect: '+error.message;}
}
function showLogin(setup){
  $('#app-shell').hidden=true;
  const screen=$('#auth-screen');screen.hidden=false;
  screen.innerHTML=`<form id="login-form" class="modal-card"><p class="eyebrow">ACS ATHLETE DEVELOPMENT</p><h2>${setup?'Set up your coach account':'Sign in'}</h2><p>${setup?'Create the first coach account for this local development workspace.':'Use the account your coach created for you.'}</p><label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label><label class="field"><span>Password</span><input type="password" name="password" autocomplete="${setup?'new-password':'current-password'}" minlength="12" maxlength="128" required></label><p id="login-error" role="alert"></p><button type="submit" class="button button-primary">${setup?'Create coach account':'Sign in'}</button></form>`;
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('[type="submit"]',e.target);button.disabled=true;const d=new FormData(e.target);try{await api(setup?'setup':'login','POST',{email:d.get('email'),password:d.get('password')});location.reload();}catch(error){$('#login-error').textContent=error.message;button.disabled=false;}});
}
async function accountForm(){
  if(user.role!=='coach')return;
  let accounts;try{accounts=(await api('accounts')).accounts;}catch(e){alert(e.message);return;}
  showModal(`<form id="account-form" class="modal-card"><h2>Manage accounts</h2><div>${accounts.map(a=>`<p>${html(a.email)} · ${html(a.role)} ${a.id!==user.id?`<button type="button" class="text-button" data-remove-account="${html(a.id)}">Remove access</button>`:' (you)'}</p>`).join('')}</div><h3>Create an account</h3><label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label><label class="field"><span>Initial password (at least 12 characters)</span><input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label class="field"><span>Permission</span><select name="role"><option value="athlete">Athlete</option><option value="coach">Coach</option></select></label><label class="field"><span>Linked athlete (required for athlete accounts)</span><select name="athleteId"><option value="">Choose athlete</option>${db.athletes.map(a=>`<option value="${html(a.id)}">${html(a.name)} · ${html(a.id)}</option>`).join('')}</select></label><p>Athletes can view only their own data and log their assigned workouts. Coaches can manage the full team. Share the initial password privately; the account holder can change it after signing in.</p><p role="alert" id="account-error"></p><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button class="button button-primary" type="submit">Create account</button></div></form>`);
  $$('[data-remove-account]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Remove this account and sign it out on all devices? Athlete history will be kept.'))return;try{await api('accounts','DELETE',{id:button.dataset.removeAccount});closeModal();await accountForm();}catch(e){alert(e.message)}}));
  $('#account-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('[type="submit"]',e.target);button.disabled=true;try{await api('accounts','POST',Object.fromEntries(new FormData(e.target)));closeModal();alert('Account created.');}catch(error){$('#account-error').textContent=error.message;button.disabled=false;}});
}
function passwordForm(){
  showModal(`<form id="password-form" class="modal-card"><h2>Change password</h2><label class="field"><span>Current password</span><input type="password" name="currentPassword" autocomplete="current-password" required></label><label class="field"><span>New password (at least 12 characters)</span><input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p role="alert" id="password-error"></p><div class="modal-actions"><button type="button" class="button button-quiet" data-close>Cancel</button><button type="submit" class="button button-primary">Save password</button></div></form>`);
  $('#password-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('[type="submit"]',e.target);button.disabled=true;try{await api('password','POST',Object.fromEntries(new FormData(e.target)));closeModal();alert('Password changed. Other sessions have been signed out.');}catch(error){$('#password-error').textContent=error.message;button.disabled=false;}});
}
async function migrateLocal(){
  if(user.role!=='coach')return;
  try{
    const saved=JSON.parse(localStorage.getItem(KEY));
    if(!saved?.athletes?.length){alert('No old prototype data found in this browser at this address. Keep a JSON backup from the original browser.');return;}
    if(db.athletes.length || db.records.length || db.plans.length || db.workouts.length){alert('Local migration is only available into an empty workspace to avoid overwriting shared records.');return;}
    if(!confirm(`Copy ${saved.athletes.length} local athlete profiles and their history to the shared database? The local copy will be kept.`))return;
    db={...emptyDB(),...saved};if(await save())render();
  }catch(error){alert('Could not migrate: '+error.message);}
}
initialize();
