/* Gym Tracker core SPA (no build) */
const DB_KEY = 'gym-tracker-db-v1';

const defaultMovements = [
  { id: 'm-bench', name:'Barbell Bench Press', pictureUrl:'', tags:['Chest','Triceps'], instructions:'Lie on a bench, lower bar to mid-chest, press upward.' },
  { id: 'm-squat', name:'Back Squat', pictureUrl:'', tags:['Legs','Glutes'], instructions:'Bar on back, sit down to parallel, drive up.' },
  { id: 'm-dead', name:'Conventional Deadlift', pictureUrl:'', tags:['Back','Hamstrings'], instructions:'Hinge, brace, push floor, lockout with neutral spine.' },
  { id: 'm-ohp', name:'Overhead Press', pictureUrl:'', tags:['Shoulders','Triceps'], instructions:'Press bar/dumbbells overhead, ribs down, lockout.' },
  { id: 'm-row', name:'Bent Over Row', pictureUrl:'', tags:['Back','Biceps'], instructions:'Hinge torso, row to lower ribs, control eccentric.' },
];

function loadDB(){
  let raw = localStorage.getItem(DB_KEY);
  if(!raw){
    const today = new Date();
    const dstr = toISODate(today);
    const seed = {
      movements: Object.fromEntries(defaultMovements.map(m=>[m.id,m])),
      plan: { [dstr]: ['m-bench','m-squat'] },
      logs: [],
    };
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  }
  try { return JSON.parse(raw); } catch(e){ console.warn('DB parse error, resetting', e); localStorage.removeItem(DB_KEY); return loadDB(); }
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

/* Utils */
function uid(prefix='id'){ return prefix+'-'+Math.random().toString(36).slice(2,9); }
function toISODate(d){ return d.toISOString().slice(0,10); }
function fromISO(s){ const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd); }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){
  const x = new Date(d);
  const day = (x.getDay()+6)%7; // Mon=0
  x.setDate(x.getDate()-day);
  x.setHours(0,0,0,0);
  return x;
}
function weekKey(d){ const s=startOfWeek(d); return toISODate(s); }
function fmtKg(n){ return (Math.round(n*10)/10).toString(); }

/* Epley 1RM */
function epley1RM(weight, reps){ return weight * (1 + reps/30); }

/* State */
let DB = loadDB();

/* Tabs */
const tabBtns = Array.from(document.querySelectorAll('.tab'));
const sections = ['home','planner','logger','library','prs','analytics'];
tabBtns.forEach(btn=>btn.addEventListener('click',()=>{
  tabBtns.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  sections.forEach(s=>document.getElementById(s).style.display = (btn.dataset.tab===s)?'grid':'none');
  if(btn.dataset.tab==='analytics') drawVolumeChart();
  if(btn.dataset.tab==='prs') renderPRs();
  if(btn.dataset.tab==='library') renderLibrary();
  if(btn.dataset.tab==='planner') { syncPlanDate(); renderPlanner(); }
  if(btn.dataset.tab==='logger'){ syncLogDate(); populateLogMovement(); renderLogsForSelectedDay(); ensureOneSetRow(); }
}));

/* EXPORT / IMPORT */
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = JSON.stringify(DB, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gym-tracker-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const obj = JSON.parse(text);
    if(!obj.movements || !obj.plan || !Array.isArray(obj.logs)) throw new Error('Invalid schema');
    if(confirm('Replace your current data with this file? This will OVERWRITE.')){
      DB = obj;
      saveDB(DB);
      refreshAll();
      alert('Import complete.');
    }
  }catch(err){
    alert('Import failed: '+err.message);
  }finally{
    e.target.value = '';
  }
});

/* CALENDAR PAGE */
let currentMonth = startOfMonth(new Date());
document.getElementById('prevMonth').addEventListener('click', ()=>{ currentMonth = startOfMonth(addDays(currentMonth, -1)); renderCalendar(); });
document.getElementById('nextMonth').addEventListener('click', ()=>{ currentMonth = startOfMonth(addDays(endOfMonth(currentMonth), +1)); renderCalendar(); });

function renderCalendar(){
  const label = currentMonth.toLocaleString(undefined, { month:'long', year:'numeric' });
  document.getElementById('monthLabel').textContent = label;
  const cal = document.getElementById('calendar'); cal.innerHTML='';
  const first = startOfMonth(currentMonth);
  const last = endOfMonth(currentMonth);
  const offset = (first.getDay()+6)%7; // Mon=0
  for(let i=0;i<offset;i++) cal.appendChild(document.createElement('div')); // blanks

  for(let day=1;day<=last.getDate();day++){
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dstr = toISODate(d);
    const el = document.createElement('div'); el.className='day'; el.dataset.date=dstr;
    const dd = document.createElement('div'); dd.className='date'; dd.textContent = String(day);
    const badges = document.createElement('div'); badges.className='badges';
    const hasPlan = Array.isArray(DB.plan[dstr]) && DB.plan[dstr].length>0;
    const hasLogs = DB.logs.some(l=>l.date===dstr);
    if(hasPlan){ const b=document.createElement('div'); b.className='badge p'; b.textContent='Planned'; badges.appendChild(b); }
    if(hasLogs){ const b=document.createElement('div'); b.className='badge l'; b.textContent='Logged'; badges.appendChild(b); }
    el.append(dd, badges);
    el.addEventListener('click', ()=>{ showDayDetails(dstr); });
    cal.appendChild(el);
  }
  // also sync logger/planner date pickers to current displayed month when landing on page
}

function showDayDetails(dstr){
  const wrap = document.getElementById('dayDetails');
  const plans = DB.plan[dstr] || [];
  const logs = DB.logs.filter(l=>l.date===dstr);
  const title = new Date(dstr).toLocaleDateString(undefined,{weekday:'short', year:'numeric', month:'short', day:'numeric'});
  let html = `<div class="title">${title}</div>`;
  if(plans.length){
    html += `<div class="muted">Planned:</div><ul>`+plans.map(id=>`<li>${DB.movements[id]?.name||id}</li>`).join('')+`</ul>`;
  }else{
    html += `<div class="muted">No plan.</div>`;
  }
  if(logs.length){
    html += `<div class="muted" style="margin-top:.5rem">Logs:</div>`;
    html += logs.map(l=>renderLogRowHTML(l)).join('');
  }else{
    html += `<div class="muted">No logs yet.</div>`;
  }
  wrap.innerHTML = html;
  // Sync other tabs to this date
  document.getElementById('planDate').value = dstr;
  document.getElementById('logDate').value = dstr;
  populateLogMovement();
  renderLogsForSelectedDay();
}
function renderLogRowHTML(l){
  const mv = DB.movements[l.movementId];
  const maxE = Math.max(...l.sets.map(s=>epley1RM(Number(s.weight||0), Number(s.reps||0))), 0);
  const bestForMove = getBestEpleyByMovement()[l.movementId] || 0;
  const isPR = Math.abs(maxE - bestForMove) < 1e-6 && maxE>0;
  const sets = l.sets.map(s=>`${s.weight}×${s.reps}`).join(', ');
  return `<div class="row" style="gap:.25rem">
    <div>${mv?mv.name:l.movementId}</div>
    <div class="muted">(${sets})</div>
    ${isPR?'<div class="pr">🏆 PR</div>':''}
    <div class="muted right">${l.feeling||''}</div>
  </div>`;
}

/* PLANNER */
function syncPlanDate(){
  const inp = document.getElementById('planDate');
  if(!inp.value) inp.value = toISODate(new Date());
}
document.getElementById('planDate').addEventListener('change', renderPlanner);
document.getElementById('libSearch').addEventListener('input', renderPlanner);

function renderPlanner(){
  const dstr = document.getElementById('planDate').value || toISODate(new Date());
  const planned = DB.plan[dstr] || [];
  const host = document.getElementById('plannedList');
  host.innerHTML = planned.length? planned.map(id=>{
    const mv = DB.movements[id];
    return `<div class="row"><div>${mv?mv.name:id}</div><button class="btn ghost right" data-remove="${id}">Remove</button></div>`;
  }).join(''): `<div class="muted">No movements planned for this date.</div>`;
  host.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{
    const id = btn.dataset.remove;
    DB.plan[dstr] = (DB.plan[dstr]||[]).filter(x=>x!==id);
    if(DB.plan[dstr].length===0) delete DB.plan[dstr];
    saveDB(DB); renderPlanner(); renderCalendar();
  }));

  // Library search results
  const q = (document.getElementById('libSearch').value||'').toLowerCase();
  const results = Object.values(DB.movements).filter(m=>!q || m.name.toLowerCase().includes(q) || (m.tags||[]).some(t=>t.toLowerCase().includes(q)));
  const wrap = document.getElementById('libResults'); wrap.innerHTML='';
  results.forEach(mv=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div class="row"><div class="title">${mv.name}</div><div class="right muted">${(mv.tags||[]).join(', ')}</div></div>
      ${mv.pictureUrl?`<img src="${mv.pictureUrl}" alt="" style="max-width:100%;border-radius:.5rem;border:1px solid #20305d">`:''}
      <div class="muted" style="margin-top:.25rem">${mv.instructions||''}</div>
      <div class="row" style="margin-top:.5rem">
        <button class="btn" data-add="${mv.id}">Add to plan</button>
        <button class="btn ghost right" data-edit="${mv.id}">Edit</button>
      </div>`;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.add;
    DB.plan[dstr]=DB.plan[dstr]||[];
    if(!DB.plan[dstr].includes(id)) DB.plan[dstr].push(id);
    saveDB(DB); renderPlanner(); renderCalendar();
  }));
  wrap.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openMovementDialog(btn.dataset.edit)));
}

/* LOGGER */
function syncLogDate(){
  const inp = document.getElementById('logDate');
  if(!inp.value) inp.value = toISODate(new Date());
}

function populateLogMovement(){
  const select = document.getElementById('logMovement');
  const dstr = document.getElementById('logDate').value || toISODate(new Date());
  const planned = DB.plan[dstr] || [];
  // show planned first, then others
  const ids = [...planned, ...Object.keys(DB.movements).filter(id=>!planned.includes(id))];
  select.innerHTML = ids.map(id=>`<option value="${id}">${DB.movements[id].name}</option>`).join('');
}

function ensureOneSetRow(){ if(!document.querySelector('.set-row')) addSetRow(); }
document.getElementById('addSet').addEventListener('click', addSetRow);
function addSetRow(){
  const host = document.getElementById('setRows');
  const row = document.createElement('div'); row.className='row set-row';
  row.innerHTML = `
    <label style="flex:1">Weight(kg)<input type="number" step="0.5" class="set-weight"></label>
    <label style="flex:1">Reps<input type="number" step="1" class="set-reps"></label>
    <button class="btn ghost" title="remove">✖</button>`;
  row.querySelector('button').addEventListener('click',()=>row.remove());
  host.appendChild(row);
}

document.getElementById('saveLog').addEventListener('click', ()=>{
  const date = document.getElementById('logDate').value || toISODate(new Date());
  const movementId = document.getElementById('logMovement').value;
  const sets = Array.from(document.querySelectorAll('.set-row')).map(r=>({
    weight: Number(r.querySelector('.set-weight').value||0),
    reps: Number(r.querySelector('.set-reps').value||0),
  })).filter(s=>s.weight>0 && s.reps>0);
  if(sets.length===0) return alert('Please add at least one valid set.');
  const feeling = document.getElementById('feeling').value;
  const notes = document.getElementById('notes').value;
  const log = { id: uid('log'), date, movementId, sets, feeling, notes, createdAt: new Date().toISOString() };
  DB.logs.push(log);
  saveDB(DB);
  // clear sets
  document.getElementById('setRows').innerHTML='';
  ensureOneSetRow();
  document.getElementById('notes').value='';
  renderCalendar();
  renderLogsForSelectedDay();
  alert('Saved ✓');
});

function renderLogsForSelectedDay(){
  const dstr = document.getElementById('logDate').value || toISODate(new Date());
  const host = document.getElementById('logsForDay');
  const items = DB.logs.filter(l=>l.date===dstr);
  host.innerHTML = items.length? items.map(renderLogRowHTML).join('') : '<div class="muted">No logs for this day.</div>';
}

/* LIBRARY CRUD */
function renderLibrary(){
  const wrap = document.getElementById('libraryList');
  const list = Object.values(DB.movements).sort((a,b)=>a.name.localeCompare(b.name));
  wrap.innerHTML = list.map(mv=>{
    return `<div class="card">
      <div class="row"><div class="title">${mv.name}</div><div class="right muted">${(mv.tags||[]).join(', ')}</div></div>
      ${mv.pictureUrl?`<img src="${mv.pictureUrl}" alt="" style="max-width:100%;border-radius:.5rem;border:1px solid #20305d">`:''}
      <div class="muted" style="margin-top:.25rem">${mv.instructions||''}</div>
      <div class="row" style="margin-top:.5rem">
        <button class="btn" data-edit="${mv.id}">Edit</button>
        <button class="btn ghost right" data-del="${mv.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openMovementDialog(b.dataset.edit)));
  wrap.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.del;
    if(!confirm('Delete this movement from library? This will not delete past logs.')) return;
    delete DB.movements[id];
    // remove from plans
    Object.keys(DB.plan).forEach(d=>{ DB.plan[d] = (DB.plan[d]||[]).filter(x=>x!==id); if(DB.plan[d].length===0) delete DB.plan[d]; });
    saveDB(DB);
    renderLibrary(); renderPlanner(); renderCalendar(); populateLogMovement();
  }));
}
document.getElementById('addMovementBtn').addEventListener('click',()=>openMovementDialog(null));

function openMovementDialog(id){
  const dlg = document.getElementById('movementDlg');
  const form = document.getElementById('movementForm');
  const isEdit = !!id;
  document.getElementById('dlgTitle').textContent = isEdit? 'Edit Movement':'New Movement';
  const mov = isEdit? DB.movements[id] : { id: uid('m'), name:'', pictureUrl:'', tags:[], instructions:'' };
  document.getElementById('movId').value = mov.id;
  document.getElementById('movName').value = mov.name;
  document.getElementById('movPic').value = mov.pictureUrl||'';
  document.getElementById('movTags').value = (mov.tags||[]).join(', ');
  document.getElementById('movInstr').value = mov.instructions||'';
  dlg.showModal();

  document.getElementById('saveMovement').onclick = (ev)=>{
    ev.preventDefault();
    const id = document.getElementById('movId').value || uid('m');
    const name = document.getElementById('movName').value.trim();
    if(!name) return;
    const pictureUrl = document.getElementById('movPic').value.trim();
    const tags = document.getElementById('movTags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const instructions = document.getElementById('movInstr').value.trim();
    DB.movements[id] = { id, name, pictureUrl, tags, instructions };
    saveDB(DB);
    dlg.close();
    renderLibrary(); renderPlanner(); populateLogMovement();
  };
}

/* PRs */
function getBestEpleyByMovement(){
  const best = {};
  for(const l of DB.logs){
    let max = 0;
    for(const s of l.sets){
      const est = epley1RM(Number(s.weight||0), Number(s.reps||0));
      if(est>max) max=est;
    }
    if(max>0){
      best[l.movementId] = Math.max(best[l.movementId]||0, max);
    }
  }
  return best;
}
function renderPRs(){
  const wrap = document.getElementById('prsList');
  const best = getBestEpleyByMovement();
  const rows = Object.entries(best).map(([mid, val])=>{
    // find latest date that hits this PR (in case multiple)
    const hits = DB.logs.filter(l=>l.movementId===mid).filter(l=>{
      const max = Math.max(...l.sets.map(s=>epley1RM(Number(s.weight||0), Number(s.reps||0))), 0);
      return Math.abs(max - val) < 1e-6;
    }).sort((a,b)=>b.date.localeCompare(a.date));
    const date = hits[0]?.date || '';
    const mv = DB.movements[mid];
    return { name: mv?mv.name:mid, pr: val, date };
  }).sort((a,b)=>a.name.localeCompare(b.name));
  if(rows.length===0){ wrap.innerHTML = '<div class="muted">No PRs yet. Log some sets!</div>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>Movement</th><th>PR (Epley 1RM)</th><th>Date</th></tr></thead><tbody>${
    rows.map(r=>`<tr><td>${r.name}</td><td>${fmtKg(r.pr)}</td><td>${r.date}</td></tr>`).join('')
  }</tbody></table>`;
}

/* ANALYTICS */
const BODY_PARTS = ['Chest','Back','Shoulders','Legs','Glutes','Biceps','Triceps','Core','Hamstrings','Quads','Calves'];
let activeParts = new Set(); // empty = all

function getVolumeByWeek(weeks=8){
  // returns {labels:[], data:[]}, last N weeks including current
  const map = new Map(); // weekStartISO -> volume
  const today = new Date();
  for(let i=weeks-1;i>=0;i--){
    const d = addDays(today, -7*i);
    const wk = weekKey(d);
    map.set(wk, 0);
  }
  for(const l of DB.logs){
    const mv = DB.movements[l.movementId];
    if(activeParts.size){
      const tags = new Set((mv?.tags)||[]);
      let ok=false;
      for(const p of activeParts){ if(tags.has(p)) {ok=true;break;} }
      if(!ok) continue;
    }
    const wk = weekKey(fromISO(l.date));
    if(map.has(wk)){
      const vol = l.sets.reduce((s,st)=>s + Number(st.weight||0)*Number(st.reps||0), 0);
      map.set(wk, map.get(wk) + vol);
    }
  }
  const labels = Array.from(map.keys()).map(s=>{
    const d = fromISO(s);
    const end = addDays(d,6);
    return `${d.getMonth()+1}/${d.getDate()}–${end.getMonth()+1}/${end.getDate()}`;
  });
  const data = Array.from(map.values());
  return { labels, data };
}

let chart;
function drawVolumeChart(){
  const chipsHost = document.getElementById('tagChips');
  chipsHost.innerHTML = '<span class="chip '+(activeParts.size===0?'active':'')+'" data-part="__ALL__">All</span> ' + BODY_PARTS.map(p=>`<span class="chip ${activeParts.has(p)?'active':''}" data-part="${p}">${p}</span>`).join(' ');
  chipsHost.querySelectorAll('.chip').forEach(ch=>ch.addEventListener('click', ()=>{
    const p = ch.dataset.part;
    if(p==='__ALL__'){ activeParts.clear(); }
    else{
      if(activeParts.has(p)) activeParts.delete(p); else activeParts.add(p);
    }
    drawVolumeChart();
  }));

  const ctx = document.getElementById('volumeChart').getContext('2d');
  const {labels, data} = getVolumeByWeek(8);
  if(chart){ chart.destroy(); }
  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Weekly Volume (kg)', data }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true }}}
  });
}

/* Refresh helpers */
function refreshAll(){
  renderCalendar();
  renderPlanner();
  populateLogMovement();
  renderLogsForSelectedDay();
  renderPRs();
  drawVolumeChart();
}

/* INITIALIZE */
renderCalendar();
syncPlanDate();
renderPlanner();
syncLogDate();
populateLogMovement();
renderLogsForSelectedDay();
drawVolumeChart();
renderLibrary();

