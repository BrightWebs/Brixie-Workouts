"use strict";

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const QUICK_TIMES=[10,15,30,45,60];
const PROGRAMS={
 beginner:{name:'Beginner foundations',weeks:4,level:'beginner',sets:1},
 intermediate:{name:'Intermediate upper / lower',weeks:6,level:'intermediate',sets:2},
 advanced:{name:'Advanced upper / lower',weeks:8,level:'advanced',sets:3}
};
let PLANNER_MODE='list',PLANNER_ERROR='',DRAFT=null,SCHEDULE_FORM=null,PICK_QUERY='',WEEK_OFFSET=0;
const clone=value=>JSON.parse(JSON.stringify(value));
const newId=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&localDate(new Date(s+'T12:00:00'))===s;
const numberOK=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const intOK=(v,min,max)=>numberOK(v,min,max)&&Number.isInteger(v);
const idOK=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
function equipmentFor(e){
  const text=e.equip.toLowerCase(),groups=[];
  if(/dumbbell/.test(text))groups.push('dumbbells');
  if(/barbell/.test(text))groups.push('barbells');
  if(/kettlebell/.test(text))groups.push('kettlebells');
  if(/resistance band/.test(text))groups.push('bands');
  if(/cable/.test(text))groups.push('cables');
  if(/bench/.test(text))groups.push('bench');
  if(/treadmill|elliptical|bike|stepmill|stair climber|rowing machine|arc trainer|recumbent stepper/.test(text))groups.push('cardio');
  else if(/machine|leg press|pec deck|smith/.test(text)&&!groups.includes('cables'))groups.push('machines');
  if(/suspension|ropes|medicine ball|balance trainer/.test(text))groups.push('functional');
  return groups.length?groups:['bodyweight'];
}
function availableExercise(e,equipment){return equipmentFor(e).every(group=>equipment.includes(group))}
function itemFromExercise(id,workout){
  const e=EXI[id];
  return{uid:newId('move'),exerciseId:id,sets:e.type==='sets'?e.sets:1,reps:firstNum(e.reps||10),
    weight:Math.max(0,Number(suggestW(e))||0),seconds:e.dur||60,rest:workout.restSet,tempo:3,
    group:EX_TARGETS[id]?.[0][0]||'abs'};
}
function blankRoutine(kind='free',minutes=DB.preferences.duration){
  return{id:newId('routine'),name:kind==='free'?'My workout':kind==='quick'?minutes+'-minute workout':'Guided workout',
    kind,difficulty:DB.preferences.experience==='regular'?'intermediate':'beginner',minutes,
    targets:[],equipment:DB.preferences.equipment.slice(),restSet:60,restExercise:30,restGroup:30,
    recoveryEvery:0,recoverySeconds:120,items:[]};
}
function validItem(item){
  return item&&idOK(item.uid)&&Object.hasOwn(EXI,item.exerciseId)&&intOK(item.sets,1,20)&&intOK(item.reps,1,300)
    &&numberOK(item.weight,0,2000)&&intOK(item.seconds,10,3600)&&intOK(item.rest,0,900)
    &&intOK(item.tempo,1,10)&&Object.hasOwn(MUSCLE_REGIONS,item.group);
}
function validRoutine(w){
  return w&&idOK(w.id)&&typeof w.name==='string'&&w.name.trim().length>0&&w.name.length<=100
    &&['free','guided','quick','program'].includes(w.kind)&&['beginner','intermediate','advanced'].includes(w.difficulty)
    &&intOK(w.minutes,5,240)&&Array.isArray(w.targets)&&w.targets.every(x=>Object.hasOwn(MUSCLE_REGIONS,x))
    &&Array.isArray(w.equipment)&&w.equipment.every(x=>Object.hasOwn(EQUIPMENT_TYPES,x))
    &&intOK(w.restSet,0,900)&&intOK(w.restExercise,0,900)&&intOK(w.restGroup,0,900)
    &&intOK(w.recoveryEvery,0,50)&&intOK(w.recoverySeconds,0,1800)
    &&Array.isArray(w.items)&&w.items.every(validItem)&&new Set(w.items.map(x=>x.uid)).size===w.items.length;
}
function validSchedule(s){
  return s&&idOK(s.id)&&idOK(s.workoutId)&&typeof s.recurring==='boolean'
    &&Array.isArray(s.days)&&s.days.every(d=>intOK(d,0,6))&&(!s.recurring||s.days.length>0)
    &&dateOK(s.startDate)&&(!s.endDate||dateOK(s.endDate)&&s.endDate>=s.startDate)
    &&typeof s.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)&&intOK(s.minutes,5,240);
}
function normalizePlanner(){
  if(DB.workouts===undefined)DB.workouts=[];
  if(DB.schedules===undefined)DB.schedules=[];
  if(DB.enrollments===undefined)DB.enrollments=[];
  if(!Array.isArray(DB.workouts)||!DB.workouts.every(validRoutine)||!Array.isArray(DB.schedules)||!DB.schedules.every(validSchedule)
    ||!Array.isArray(DB.enrollments)||!DB.enrollments.every(e=>e&&typeof e.id==='string'&&Object.hasOwn(PROGRAMS,e.programKey)&&dateOK(e.startDate)))
    throw new Error('Workout planner data is invalid');
  if(DB.workoutDraft&&!validRoutine(DB.workoutDraft))throw new Error('Workout draft is invalid');
  DRAFT=DB.workoutDraft?clone(DB.workoutDraft):null;
}
function persistDraft(){DB.workoutDraft=clone(DRAFT);return save()}
function transitionRest(w,index){
  if(index>=w.items.length-1)return 0;
  return w.restExercise+(w.items[index].group!==w.items[index+1].group?w.restGroup:0)
    +(w.recoveryEvery&&(index+1)%w.recoveryEvery===0?w.recoverySeconds:0);
}
function routineSeconds(w){
  return w.items.reduce((sum,item,index)=>{
    const e=EXI[item.exerciseId],work=e.type==='time'?item.seconds:
      item.sets*(e.unit==='sec'?item.reps:item.reps*item.tempo*(e.unit==='reps/side'?2:1));
    return sum+work+(e.type==='sets'?Math.max(0,item.sets-1)*item.rest:0)+transitionRest(w,index);
  },0);
}
function generatedRoutine(kind,minutes=DB.preferences.duration,override={}){
  const p={...DB.preferences,...override},w=blankRoutine(kind,minutes);
  w.equipment=p.equipment.slice();w.difficulty=p.experience==='regular'?'intermediate':'beginner';
  const focus=p.goal==='focus'?{upper:['chest','back','shoulders'],lower:['quads','glutes','hamstrings'],core:['abs','obliques']}[p.focus]:[];
  w.targets=focus.slice();
  const pool=EX.filter(e=>e.sec==='str'&&availableExercise(e,w.equipment)&&(!focus.length||EX_TARGETS[e.id][0].some(x=>focus.includes(x))));
  if(!pool.length)throw new Error('No strength exercise matches your muscle and equipment choices. Change the available equipment or focus.');
  const preferred=p.goal==='focus'?FOCUS_PLANS[p.focus]:JOURNEYS[p.goal].moves;
  const priority=[...preferred,'squatbw','pushup','bridge','plank','dbug'];
  pool.sort((a,b)=>{
    const ai=priority.indexOf(a.id),bi=priority.indexOf(b.id);
    return(ai<0?100:ai)-(bi<0?100:bi)||a.i-b.i;
  });
  w.restSet=minutes<=15?30:60;w.restExercise=minutes<=15?15:30;w.restGroup=minutes<=15?15:30;
  const warm=EX.find(e=>e.sec==='warm'&&availableExercise(e,w.equipment))||(availableExercise(EXI.bsq,w.equipment)?EXI.bsq:null);
  if(!warm)throw new Error('Allow bodyweight preparation or available cardio equipment before generating this workout.');
  const mobility=EX.find(e=>e.sec==='mob'&&availableExercise(e,w.equipment)&&e.id!==warm.id);
  const cool=EX.find(e=>e.sec==='cool'&&availableExercise(e,w.equipment));
  const preparation=[warm,...(mobility?[mobility]:[])].map(e=>{
    const item=itemFromExercise(e.id,w);item.seconds=minutes<=15?45:90;return item;
  });
  const cooldown=cool?itemFromExercise(cool.id,w):null;
  if(cooldown)cooldown.seconds=minutes<=15?45:60;
  w.items=[...preparation,...(cooldown?[cooldown]:[])];
  const maxMoves=minutes<=10?2:minutes<=15?3:minutes<=30?4:6;
  let count=0;
  for(const e of pool){
    if(count>=maxMoves)break;
    const item=itemFromExercise(e.id,w);item.sets=minutes<=10||p.experience==='new'?1:2;item.reps=8;item.rest=w.restSet;
    const at=w.items.length-(cooldown?1:0);w.items.splice(at,0,item);
    if(routineSeconds(w)>minutes*60){w.items.splice(at,1);continue}
    count++;
  }
  if(!count)throw new Error('The selected equipment and duration cannot fit a strength exercise with preparation and recovery. Choose more time.');
  w.name=kind==='quick'?minutes+'-minute '+JOURNEYS[p.goal].name.toLowerCase():JOURNEYS[p.goal].name;
  return w;
}
function beginBuilder(kind,minutes=DB.preferences.duration){
  try{DRAFT=kind==='free'?blankRoutine(kind,minutes):generatedRoutine(kind,minutes);persistDraft();PLANNER_MODE='edit';go('planner')}
  catch(error){toast(error.message)}
}
function editRoutine(id,duplicate=false){
  const w=DB.workouts.find(x=>x.id===id);if(!w){toast('Workout not found');return}
  DRAFT=clone(w);if(duplicate){DRAFT.id=newId('routine');DRAFT.name+=' copy'}
  persistDraft();PLANNER_MODE='edit';go('planner');
}
function draftField(key,value){
  const numeric=['minutes','restSet','restExercise','restGroup','recoveryEvery','recoverySeconds'];
  const next={...DRAFT,[key]:numeric.includes(key)?Number(value):value};
  if(!validRoutine(next)){toast('Check the setting: time 5-240 min, rest 0-900 sec, recovery up to 1800 sec');render();return}
  DRAFT=next;persistDraft();
}
function draftItemField(index,key,value){
  const item={...DRAFT.items[index],[key]:Number(value)};
  if(!validItem(item)){toast('Use valid sets, reps, load, duration and rest values');render();return}
  DRAFT.items[index]=item;persistDraft();
}
function toggleDraftTarget(id){
  const opened=[...document.querySelectorAll('#view details')].map(detail=>detail.open);
  DRAFT.targets=DRAFT.targets.includes(id)?DRAFT.targets.filter(x=>x!==id):[...DRAFT.targets,id];
  persistDraft();render();
  document.querySelectorAll('#view details').forEach((detail,index)=>{detail.open=opened[index]||false});
}
function toggleDraftEquipment(id){DRAFT.equipment=DRAFT.equipment.includes(id)?DRAFT.equipment.filter(x=>x!==id):[...DRAFT.equipment,id];persistDraft();render()}
function addDraftExercise(id){
  if(!EXI[id]){toast('Choose an exercise from the library');return}
  DRAFT.items.push(itemFromExercise(id,DRAFT));persistDraft();render();
}
function removeDraftExercise(index){DRAFT.items.splice(index,1);persistDraft();render()}
function reorderDraftExercise(index,delta){
  const next=index+delta;if(next<0||next>=DRAFT.items.length)return;
  [DRAFT.items[index],DRAFT.items[next]]=[DRAFT.items[next],DRAFT.items[index]];persistDraft();render();
}
function replaceDraftExercise(index,id){DRAFT.items[index]=itemFromExercise(id,DRAFT);persistDraft();render()}
function applyDraftRest(){DRAFT.items.forEach(item=>{item.rest=DRAFT.restSet});persistDraft();render()}
function previewDraft(){
  if(!DRAFT.items.length){toast('Add at least one exercise');return}
  PLANNER_MODE='preview';render();window.scrollTo(0,0);
}
function saveDraft(){
  if(!validRoutine(DRAFT)||!DRAFT.items.length){toast('Complete your workout settings and add an exercise');return false}
  const previous=DB.workouts;
  DB.workouts=[...previous.filter(x=>x.id!==DRAFT.id),clone(DRAFT)];
  if(!save()){DB.workouts=previous;return false}
  toast('Workout saved');return true;
}
function removeRoutine(id,button){
  if(!button.dataset.confirm){button.dataset.confirm='1';button.textContent='Confirm removal';return}
  const previous={workouts:DB.workouts,schedules:DB.schedules};
  DB.workouts=DB.workouts.filter(x=>x.id!==id);DB.schedules=DB.schedules.filter(x=>x.workoutId!==id);
  if(!save()){Object.assign(DB,previous);return}render();toast('Workout and its schedules removed; history kept');
}
function itemFields(item,index){
  const e=EXI[item.exerciseId],field=(key,label,min,max,step=1)=>`<label class="f"><span>${label}</span><input class="field" type="number" min="${min}" max="${max}" step="${step}" value="${item[key]}" onchange="draftItemField(${index},'${key}',this.value)" aria-label="${esc(e.name)} ${label}"></label>`;
  return `<div class="builder-fields">${e.type==='sets'?field('sets','Sets',1,20)+field('reps',e.unit==='sec'?'Hold seconds':e.unit==='reps/side'?'Reps / side':'Reps',1,300)+field('weight','Load (lb)',0,2000,.5)+field('rest','Set rest (sec)',0,900)+field('tempo','Seconds / rep (estimate)',1,10):field('seconds','Duration (sec)',10,3600)}</div>`;
}
function pickerExercises(){
  const q=PICK_QUERY.trim().toLowerCase();
  return EX.filter(e=>availableExercise(e,DRAFT.equipment)&&(!DRAFT.targets.length||EX_TARGETS[e.id].some(ids=>ids.some(id=>DRAFT.targets.includes(id))))
    &&`${e.name} ${e.muscles} ${e.equip}`.toLowerCase().includes(q));
}
function renderPicker(){
  const root=$('#builderPicker');if(!root)return;
  root.innerHTML=pickerExercises().map(e=>`<article class="builder-pick"><div class="row">${thumbSVG(e)}<div class="grow"><b>${esc(e.name)}</b><div class="small muted">${esc(e.equip)}</div></div></div><div class="row2"><button class="btn2 sm" onclick="openEx('${e.id}')">Demonstration</button><button class="btn2 sm" onclick="addDraftExercise('${e.id}')">Add</button></div></article>`).join('')||'<p class="muted">No matching exercises. Change equipment or muscle filters.</p>';
  mountAnims(root);
}
function equipmentPicker(selected,action){
  return `<div class="muscle-tags">${Object.entries(EQUIPMENT_TYPES).map(([id,name])=>`<button type="button" aria-pressed="${selected.includes(id)}" onclick="${action}('${id}')">${esc(name)}</button>`).join('')}</div>`;
}
function builderEditor(){
  const w=DRAFT,numberField=(key,label,min,max)=>`<label class="f"><span>${label}</span><input class="field" type="number" min="${min}" max="${max}" value="${w[key]}" onchange="draftField('${key}',this.value)"></label>`;
  return `<div class="row2"><button class="btn2 sm" onclick="PLANNER_MODE='list';render()">My Workouts</button><button class="btn sm" onclick="previewDraft()">Preview workout</button></div>
    <section class="card" style="margin-top:14px"><h2>Workout setup</h2><p class="small muted">Based on your profile. Every setting below is editable. A draft is saved on this device as you edit.</p>
    <label class="f"><span>Workout name</span><input class="field" maxlength="100" value="${esc(w.name)}" onchange="draftField('name',this.value)"></label>
    <div class="grid2">${numberField('minutes','Preferred total minutes',5,240)}<label class="f"><span>Difficulty</span><select class="field" onchange="draftField('difficulty',this.value)">${['beginner','intermediate','advanced'].map(v=>`<option ${v===w.difficulty?'selected':''}>${v}</option>`).join('')}</select></label></div>
    <details class="how"><summary>Target muscles and available equipment</summary>${muscleMap({id:'builder',name:'Workout target selection',sec:'str'},[w.targets,[]],true)}
    <div class="muscle-tags">${Object.entries(MUSCLE_REGIONS).map(([id,r])=>`<button aria-pressed="${w.targets.includes(id)}" onclick="toggleDraftTarget('${id}')">${esc(r.label)}</button>`).join('')}</div>
    ${equipmentPicker(w.equipment,'toggleDraftEquipment')}<p class="small muted">Filters guide exercise discovery. Previously added moves are kept if filters change; equipment requirements remain visible in the preview.</p></details>
    <details class="how"><summary>Rest and recovery settings</summary><div class="builder-fields">${numberField('restSet','Default between sets (sec)',0,900)}${numberField('restExercise','Between exercises (sec)',0,900)}${numberField('restGroup','Extra when changing muscle groups (sec)',0,900)}${numberField('recoveryEvery','Longer break every N exercises (0 = off)',0,50)}${numberField('recoverySeconds','Longer recovery (sec)',0,1800)}</div><button class="btn2 sm" onclick="applyDraftRest()">Apply default set rest to all moves</button><p class="small muted">Individual set rest remains editable. Group and recovery breaks are added to the exercise transition, not hidden in the estimate.</p></details></section>
    <section class="card"><h2>Your exercise order</h2><p class="small muted">Use the arrows to reorder. Replacing a move resets its load to that exercise's example starting load.</p>
    ${w.items.map((item,index)=>{const e=EXI[item.exerciseId];return `<article class="builder-move"><div class="row">${thumbSVG(e)}<div class="grow"><b>${index+1}. ${esc(e.name)}</b><p class="small muted">${esc(e.muscles)}<br>${esc(e.equip)}</p></div></div>${itemFields(item,index)}
      <div class="builder-actions"><button class="btn2 sm" onclick="openEx('${e.id}')">Guide</button><button class="btn2 sm" onclick="reorderDraftExercise(${index},-1)" ${index===0?'disabled':''} aria-label="Move ${esc(e.name)} up">&uarr;</button><button class="btn2 sm" onclick="reorderDraftExercise(${index},1)" ${index===w.items.length-1?'disabled':''} aria-label="Move ${esc(e.name)} down">&darr;</button><button class="btn2 sm danger" onclick="removeDraftExercise(${index})">Remove</button></div>
      <label class="f" style="margin-top:10px"><span>Replace with</span><select class="field" onchange="if(this.value)replaceDraftExercise(${index},this.value)"><option value="">Choose a replacement</option>${pickerExercises().map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label></article>`}).join('')||'<p class="muted">Add exercises from the library below.</p>'}
    <p class="small muted">Current estimate: <b>${fmtMin(routineSeconds(w))}</b> including configured rest.</p></section>
    <section class="card"><h2>Add an exercise</h2><input class="field" style="margin:12px 0" value="${esc(PICK_QUERY)}" placeholder="Search exercises, muscles or equipment" aria-label="Search builder exercises" oninput="PICK_QUERY=this.value;renderPicker()"><div class="builder-picker" id="builderPicker"></div></section>
    <button class="btn" onclick="previewDraft()">Preview complete workout</button>`;
}
function routineOverview(w){
  const equipment=[...new Set(w.items.flatMap(x=>equipmentFor(EXI[x.exerciseId])))],muscles=[...new Set(w.items.flatMap(x=>EX_TARGETS[x.exerciseId][0]))];
  const missing=equipment.filter(x=>!w.equipment.includes(x)),seconds=routineSeconds(w);
  return `<section class="card"><h2>${esc(w.name)}</h2><div class="chips"><span class="chip k">${w.items.length} exercises</span><span class="chip">${fmtMin(seconds)} estimated</span><span class="chip">${w.minutes} min preferred</span><span class="chip">${esc(w.difficulty)}</span></div>
    <p class="small"><b>Target regions:</b> ${muscles.map(id=>esc(MUSCLE_REGIONS[id].label)).join(', ')}<br><b>Equipment:</b> ${equipment.map(id=>esc(EQUIPMENT_TYPES[id])).join(', ')}</p>
    ${seconds>w.minutes*60?'<p class="warn">Your configured workout exceeds your preferred duration. Edit the moves or increase your available time; no exercises are silently removed.</p>':''}
    ${missing.length?`<p class="warn">This workout requires equipment outside your selected availability: ${missing.map(id=>esc(EQUIPMENT_TYPES[id])).join(', ')}.</p>`:''}
    ${w.items.map((item,i)=>{const e=EXI[item.exerciseId];return `<div class="builder-preview"><b>${i+1}. ${esc(e.name)}</b><p class="small muted">${e.type==='time'?fmtT(item.seconds):`${item.sets} sets x ${item.reps} ${e.unit==='sec'?'hold seconds':e.unit==='reps/side'?'reps / side':'reps'}; ${item.weight} lb; ${item.rest}s between sets${e.unit==='sec'?'':'; ~'+item.tempo+'s / rep'}`}<br>${i<w.items.length-1?transitionRest(w,i)+'s before next exercise (transition + applicable group / recovery break)':'Last exercise'}</p></div>`}).join('')}
    <p class="small muted">Estimate = repetitions x configured seconds per rep (both sides for unilateral work), or timed work, plus rests between sets and exercises, group changes and longer recovery. Actual pace and machine setup can change it.</p>
    ${DB.schedules.filter(s=>s.workoutId===w.id).map(s=>`<p class="small">Scheduled: ${s.recurring?s.days.map(d=>DAYS[d]).join(', '):esc(s.startDate)} at ${esc(s.time)} (${s.minutes} min preferred)</p>`).join('')}</section>`;
}
function previewEditor(){
  return `${routineOverview(DRAFT)}<div class="builder-actions"><button class="btn2" onclick="PLANNER_MODE='edit';render()">Back to editing</button><button class="btn2" onclick="saveDraft()">Save workout</button><button class="btn2" onclick="if(saveDraft())openSchedule(DRAFT.id)">Save & schedule</button><button class="btn" style="width:auto" onclick="if(saveDraft())startSavedWorkout(DRAFT.id)">Save & start</button></div>`;
}
function scheduleMatches(s,date){
  return date>=s.startDate&&(!s.endDate||date<=s.endDate)&&(s.recurring?s.days.includes(new Date(date+'T12:00:00').getDay()):date===s.startDate);
}
function weekDates(){
  const monday=weekStart(new Date());monday.setDate(monday.getDate()+WEEK_OFFSET*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return localDate(d)});
}
function openSchedule(workoutId,id){
  const w=DB.workouts.find(x=>x.id===workoutId);if(!w){toast('Save the workout first');return}
  SCHEDULE_FORM=id?clone(DB.schedules.find(s=>s.id===id)):{id:newId('schedule'),workoutId,days:[new Date().getDay()],time:'18:00',startDate:localDate(new Date()),endDate:'',recurring:true,minutes:w.minutes};
  PLANNER_MODE='schedule';go('planner');
}
function scheduleForm(){
  const s=SCHEDULE_FORM;
  return `<section class="card"><h2>Schedule your workout</h2><p class="small muted">Times use your device's local timezone (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}). Editing a recurring schedule updates its full series.</p>
    <label class="f"><span>Workout</span><select id="sWorkout" class="field">${DB.workouts.map(w=>`<option value="${w.id}" ${w.id===s.workoutId?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>
    <div class="grid2"><label class="f"><span>Start / one-off date</span><input class="field" id="sDate" type="date" value="${s.startDate}"></label><label class="f"><span>Start time</span><input class="field" id="sTime" type="time" value="${s.time}"></label><label class="f"><span>Preferred minutes</span><input class="field" id="sMinutes" type="number" min="5" max="240" value="${s.minutes}"></label><label class="f"><span>End date (optional)</span><input class="field" id="sEnd" type="date" value="${s.endDate}"></label></div>
    <label class="plan-item"><input type="checkbox" id="sRecurring" ${s.recurring?'checked':''}> Repeat weekly on selected days</label>
    <div class="schedule-days">${[1,2,3,4,5,6,0].map(day=>`<label><input type="checkbox" data-sday="${day}" ${s.days.includes(day)?'checked':''}> ${DAYS[day]}</label>`).join('')}</div>
    <div class="row2"><button class="btn2" onclick="PLANNER_MODE='list';render()">Back</button><button class="btn" onclick="saveSchedule()">Save schedule</button></div></section>`;
}
function saveSchedule(){
  const next={...SCHEDULE_FORM,workoutId:$('#sWorkout').value,startDate:$('#sDate').value,time:$('#sTime').value,
    endDate:$('#sEnd').value,minutes:Number($('#sMinutes').value),recurring:$('#sRecurring').checked,
    days:[...document.querySelectorAll('[data-sday]:checked')].map(el=>Number(el.dataset.sday))};
  if(!validSchedule(next)||!DB.workouts.some(w=>w.id===next.workoutId)){toast('Check dates, time, duration and at least one recurring day');return}
  const previous=DB.schedules;DB.schedules=[...previous.filter(s=>s.id!==next.id),next];
  if(!save()){DB.schedules=previous;return}
  PLANNER_MODE='list';render();toast('Schedule saved');
}
function removeSchedule(id,button){
  if(!button.dataset.confirm){button.dataset.confirm='1';button.textContent='Confirm removal';return}
  const previous=DB.schedules;DB.schedules=previous.filter(s=>s.id!==id);
  if(!save()){DB.schedules=previous;return}render();toast('Schedule removed');
}
function calendarText(){
  const escapeICS=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=s=>s.replaceAll('-','');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Rebuild//Workout Planner//EN'];
  for(const s of DB.schedules){
    const w=DB.workouts.find(x=>x.id===s.workoutId);if(!w)continue;
    let first=s.startDate;
    if(s.recurring){const d=new Date(first+'T12:00:00');for(let n=0;n<7;n++){if(s.days.includes(d.getDay()))break;d.setDate(d.getDate()+1)}first=localDate(d)}
    if(s.endDate&&first>s.endDate)continue;
    lines.push('BEGIN:VEVENT','UID:'+s.id+'@rebuild','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
      'DTSTART:'+stamp(first)+'T'+s.time.replace(':','')+'00','DURATION:PT'+s.minutes+'M','SUMMARY:'+escapeICS(w.name));
    if(s.recurring)lines.push('RRULE:FREQ=WEEKLY;BYDAY='+s.days.map(day=>['SU','MO','TU','WE','TH','FR','SA'][day]).join(',')+(s.endDate?';UNTIL='+stamp(s.endDate)+'T235959':''));
    lines.push('DESCRIPTION:'+escapeICS('Rebuild workout: '+w.items.length+' exercises. Estimated '+fmtMin(routineSeconds(w))+'.'),
      'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:'+escapeICS(w.name),'END:VALARM','END:VEVENT');
  }
  const encoder=new TextEncoder();
  const fold=line=>{
    let result='',bytes=0;
    for(const character of line){
      const size=encoder.encode(character).length;
      if(bytes+size>75){result+='\r\n ';bytes=1}
      result+=character;bytes+=size;
    }
    return result;
  };
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
function exportCalendar(){
  if(!DB.schedules.length){toast('Add a schedule first');return}
  const url=URL.createObjectURL(new Blob([calendarText()],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='rebuild-workouts.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function scheduleOverview(){
  const dates=weekDates();
  return `<section class="card"><div class="row"><h2>Your week</h2><button class="btn2 sm" onclick="exportCalendar()">Export calendar</button></div>
    <div class="row2" style="margin:12px 0"><button class="btn2 sm" onclick="WEEK_OFFSET--;render()">Previous week</button><button class="btn2 sm" onclick="WEEK_OFFSET=0;render()">This week</button><button class="btn2 sm" onclick="WEEK_OFFSET++;render()">Next week</button></div>
    <div class="week-grid">${dates.map(date=>{const events=DB.schedules.filter(s=>scheduleMatches(s,date)&&DB.workouts.some(w=>w.id===s.workoutId)).sort((a,b)=>a.time.localeCompare(b.time));return `<div class="week-day"><b>${DAYS[new Date(date+'T12:00:00').getDay()]}</b><div class="small muted">${date}</div>${events.map(s=>{const w=DB.workouts.find(x=>x.id===s.workoutId);return `<div class="week-event"><b>${esc(w.name)}</b><div class="small muted">${esc(s.time)} / ${s.minutes} min</div><div class="builder-actions"><button class="btn2 sm" onclick="startSavedWorkout('${w.id}','${s.id}','${date}')">Start</button><button class="btn2 sm" onclick="openSchedule('${w.id}','${s.id}')">Reschedule</button><button class="btn2 sm danger" onclick="removeSchedule('${s.id}',this)">Remove</button></div></div>`}).join('')||'<p class="small muted">Rest / unscheduled</p>'}</div>`}).join('')}</div>
    <p class="small muted">There was no existing calendar or reminder service in this app. Import the exported calendar into your calendar app for 15-minute reminders. This website does not promise background alarms when it is closed.</p></section>`;
}
function programSection(){
  return `<section class="card"><h2>Multi-week programs</h2><p class="small muted">Programs use your profile goal and equipment, with editable saved sessions. Levels describe template volume, not a medical assessment; loads do not increase automatically.</p>
    <div class="grid2"><label class="f"><span>Program start date</span><input id="programDate" class="field" type="date" value="${localDate(new Date())}"></label><label class="f"><span>Preferred time</span><input id="programTime" class="field" type="time" value="18:00"></label></div>
    <div class="schedule-days">${[1,2,3,4,5,6,0].map(day=>`<label><input type="checkbox" data-pday="${day}" ${[1,3,5].includes(day)?'checked':''}> ${DAYS[day]}</label>`).join('')}</div>
    <div class="builder-picker">${Object.entries(PROGRAMS).map(([id,p])=>`<article class="builder-pick"><h3>${esc(p.name)}</h3><p class="small muted">${p.weeks} weeks; alternating ${id==='beginner'?'full-body A / B':'upper / lower'} sessions. Starting target: ${p.sets} set${p.sets>1?'s':''} per strength move.</p><button class="btn2" onclick="enrollProgram('${id}')">Create my program</button></article>`).join('')}</div>
    ${DB.enrollments.map(e=>{const p=PROGRAMS[e.programKey],week=Math.max(1,Math.floor((new Date(localDate(new Date())+'T12:00:00')-new Date(e.startDate+'T12:00:00'))/604800000)+1),count=DB.sessions.filter(s=>s.programId===e.id).length;return `<p class="small"><b>${esc(p.name)}</b>: ${localDate(new Date())<e.startDate?'Starts '+e.startDate:week>p.weeks?'Program period finished':'Week '+week+' of '+p.weeks}; ${count} sessions completed. Edit its saved routines and schedules below.</p>`}).join('')}</section>`;
}
function enrollProgram(key){
  const p=PROGRAMS[key],startDate=$('#programDate').value,time=$('#programTime').value,days=[...document.querySelectorAll('[data-pday]:checked')].map(x=>Number(x.dataset.pday));
  if(!p||!dateOK(startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!days.length){toast('Choose a valid date, time and training days');return}
  try{
    const enrollment={id:newId('program'),programKey:key,startDate},workouts=[];
    for(const [index,focus] of ['upper','lower'].entries()){
      const w=generatedRoutine('program',60,{goal:key==='beginner'?DB.preferences.goal:'focus',focus,experience:key==='beginner'?'new':'regular'});
      w.name=p.level[0].toUpperCase()+p.level.slice(1)+' / '+(key==='beginner'?'Session '+String.fromCharCode(65+index):focus==='upper'?'Upper':'Lower');w.kind='program';w.difficulty=p.level;
      w.items.forEach(item=>{if(EXI[item.exerciseId].type==='sets')item.sets=p.sets});
      if(key==='beginner'&&index===1){const strength=w.items.filter(i=>EXI[i.exerciseId].sec==='str');if(strength.length>1)[strength[0].reps,strength[1].reps]=[10,8]}
      workouts.push(w);
    }
    const end=new Date(startDate+'T12:00:00');end.setDate(end.getDate()+p.weeks*7-1);
    const schedules=days.map((day,i)=>({id:newId('schedule'),workoutId:workouts[i%2].id,days:[day],time,startDate,endDate:localDate(end),recurring:true,minutes:60,programId:enrollment.id}));
    const previous={workouts:DB.workouts,schedules:DB.schedules,enrollments:DB.enrollments};
    DB.workouts=[...DB.workouts,...workouts];DB.schedules=[...DB.schedules,...schedules];DB.enrollments=[...DB.enrollments,enrollment];
    if(!save()){Object.assign(DB,previous);return}render();toast('Program created. Review or edit each saved session before starting');
  }catch(error){toast(error.message)}
}
function plannerList(){
  return `<section class="card"><h2>Choose your workout</h2><p class="small muted">Use your saved profile and preferences, or build every detail yourself.</p><div class="goal-grid">
    <button class="goal-card" onclick="beginBuilder('free')"><b>Free workout</b><span>Pick, arrange and configure each move.</span></button>
    <button class="goal-card" onclick="beginBuilder('guided')"><b>Guided workout</b><span>Generate from your goal, level and available equipment.</span></button>
    <button class="goal-card" onclick="document.getElementById('programs').scrollIntoView({behavior:'smooth'})"><b>Workout programs</b><span>Follow editable multi-week routines.</span></button>
    <button class="goal-card" onclick="document.getElementById('quickWorkout').scrollIntoView({behavior:'smooth'})"><b>Quick workout</b><span>Build a session that fits your time.</span></button></div>
    ${DRAFT?'<button class="btn2" onclick="PLANNER_MODE=\'edit\';render()">Continue my draft</button>':''}
    <div id="quickWorkout"><h3 style="margin-top:18px">How much time do you have?</h3><div class="muscle-tags">${QUICK_TIMES.map(n=>`<button onclick="beginBuilder('quick',${n})">${n} minutes</button>`).join('')}</div></div></section>
    ${scheduleOverview()}<div id="programs">${programSection()}</div>
    <section class="card"><h2>Saved workouts & templates</h2>${DB.workouts.map(w=>`<article class="builder-preview"><h3>${esc(w.name)}</h3><p class="small muted">${w.items.length} moves / ${fmtMin(routineSeconds(w))} estimated / ${esc(w.difficulty)}</p><div class="builder-actions"><button class="btn2 sm" onclick="editRoutine('${w.id}');PLANNER_MODE='preview';render()">Preview</button><button class="btn2 sm" onclick="editRoutine('${w.id}')">Edit</button><button class="btn2 sm" onclick="editRoutine('${w.id}',true)">Reuse as template</button><button class="btn2 sm" onclick="openSchedule('${w.id}')">Schedule</button><button class="btn2 sm" onclick="startSavedWorkout('${w.id}')">Start</button><button class="btn2 sm danger" onclick="removeRoutine('${w.id}',this)">Remove</button></div></article>`).join('')||'<p class="muted">Save your first workout to reuse or schedule it.</p>'}</section>
    <section class="card"><h2>Recent workouts</h2>${DB.sessions.slice(-5).reverse().map(s=>`<p class="small"><b>${esc(s.name||'Workout')}</b> / ${fmtDL(s.date)} / ${fmtMin(s.dur)} / ${s.sets} sets</p>`).join('')||'<p class="muted">Completed sessions will appear here.</p>'}<button class="btn2" onclick="go('progress')">History, previous loads & personal records</button><p class="small muted">${thisWeekCount()} sessions this week; ${streakWeeks()} week training streak. Your existing charts and history remain in Progress.</p></section>`;
}
function vPlanner(){
  if(PLANNER_ERROR)return `<header class="top"><h1>My Workouts</h1></header><div class="warn"><b>Planner data could not be loaded.</b><p>${esc(PLANNER_ERROR)}</p><p>Your data has not been erased. Restore a valid backup in Profile.</p><button class="btn2" onclick="go('profile')">Open Profile</button></div>`;
  return `<header class="top"><div><div class="eyebrow">Plan / schedule / train</div><h1>My Workouts</h1></div></header>`
    +(PLANNER_MODE==='edit'&&DRAFT?builderEditor():PLANNER_MODE==='preview'&&DRAFT?previewEditor():PLANNER_MODE==='schedule'&&SCHEDULE_FORM?scheduleForm():plannerList());
}

function activeExercise(item){
  const e=EXI[item.id];
  return item.config?{...e,sets:item.sets?.length||item.config.sets,reps:String(item.config.reps),w:item.config.weight,
    rest:item.config.rest,dur:item.config.seconds}:e;
}
function startSavedWorkout(id,scheduleId='',date=''){
  if(ACTIVE){toast('Resume or finish your active workout first');return}
  const w=DB.workouts.find(x=>x.id===id);
  if(!w||!w.items.length||!validRoutine(w)){toast('This workout needs valid exercises and settings before starting');return}
  const schedule=DB.schedules.find(s=>s.id===scheduleId);
  ACTIVE={start:Date.now(),plannedSeconds:(schedule?.minutes||w.minutes)*60,idx:0,enter:Date.now(),restEnd:0,restTotal:0,pausedMs:0,
    workoutId:w.id,name:w.name,workout:clone(w),scheduleId,programId:schedule?.programId||'',scheduledDate:date,
    items:w.items.map(config=>{const e=EXI[config.exerciseId];return{id:e.id,uid:config.uid,config:clone(config),t:0,done:false,skipped:false,
      beeped:false,rem:config.seconds,endAt:0,sets:e.type==='sets'?Array.from({length:config.sets},()=>({w:config.weight,r:config.reps,done:false})):null}})};
  closeSheet();saveA();openWO();
}
function activeElapsed(){return ACTIVE?Math.max(0,((ACTIVE.pausedAt||Date.now())-ACTIVE.start-(ACTIVE.pausedMs||0))/1000):0}
function beginRest(seconds,nextIndex=null,label='Next set'){
  ACTIVE.restEnd=seconds>0?Date.now()+seconds*1000:0;ACTIVE.restRemaining=0;ACTIVE.restPaused=false;ACTIVE.restTotal=seconds;
  ACTIVE.restBeeped=false;ACTIVE.nextIndex=nextIndex;ACTIVE.restLabel=label;
  if(!seconds&&nextIndex!==null){ACTIVE.nextIndex=null;setIdx(nextIndex);return}
  saveA();renderWO();
}
function restFinished(){
  const next=ACTIVE.nextIndex;ACTIVE.restEnd=0;ACTIVE.restRemaining=0;ACTIVE.restPaused=false;ACTIVE.nextIndex=null;saveA();
  if(next!==null&&next!==undefined)setIdx(next);else renderWO();
}
function plannerTransition(){
  const index=ACTIVE.idx;
  if(index===ACTIVE.items.length-1){saveA();renderWO();askFinish();return}
  const w={...ACTIVE.workout,items:ACTIVE.items.map(item=>item.config)};
  beginRest(transitionRest(w,index),index+1,'Next: '+EXI[ACTIVE.items[index+1].id].name);
}
function plannerNext(){
  if(ACTIVE.pausedAt){toast('Resume the workout first');return}
  if(ACTIVE.nextIndex!==null&&ACTIVE.nextIndex!==undefined){restFinished();return}
  const item=ACTIVE.items[ACTIVE.idx];
  if(!item.done){toast('Complete the sets or timer, or use Skip exercise');return}
  plannerTransition();
}
function skipExercise(){
  if(ACTIVE.pausedAt){toast('Resume before skipping an exercise');return}
  const item=ACTIVE.items[ACTIVE.idx];item.skipped=true;item.endAt=0;
  ACTIVE.restEnd=0;ACTIVE.restRemaining=0;ACTIVE.restPaused=false;ACTIVE.nextIndex=null;
  if(ACTIVE.idx===ACTIVE.items.length-1){saveA();askFinish()}else setIdx(ACTIVE.idx+1);
}
function toggleRestPause(){
  if(ACTIVE.pausedAt){toast('Resume the workout before changing the rest timer');return}
  if(ACTIVE.restEnd){ACTIVE.restRemaining=Math.max(0,(ACTIVE.restEnd-Date.now())/1000);ACTIVE.restEnd=0;ACTIVE.restPaused=true}
  else if(ACTIVE.restPaused){ACTIVE.restEnd=Date.now()+ACTIVE.restRemaining*1000;ACTIVE.restRemaining=0;ACTIVE.restPaused=false}
  saveA();renderWO();
}
function toggleWorkoutPause(){
  const now=Date.now(),item=ACTIVE.items[ACTIVE.idx];
  if(ACTIVE.pausedAt){
    ACTIVE.pausedMs=(ACTIVE.pausedMs||0)+now-ACTIVE.pausedAt;ACTIVE.pausedAt=0;ACTIVE.enter=now;
    if(ACTIVE.timerWasRunning){item.endAt=now+item.rem*1000;ACTIVE.timerWasRunning=false}
    if(ACTIVE.restWasRunning){ACTIVE.restEnd=now+ACTIVE.restRemaining*1000;ACTIVE.restRemaining=0;ACTIVE.restWasRunning=false}
  }else{
    accrue();ACTIVE.pausedAt=now;
    if(item.endAt){item.rem=Math.max(0,(item.endAt-now)/1000);item.endAt=0;ACTIVE.timerWasRunning=true}
    if(ACTIVE.restEnd){ACTIVE.restRemaining=Math.max(0,(ACTIVE.restEnd-now)/1000);ACTIVE.restEnd=0;ACTIVE.restWasRunning=true}
  }
  saveA();renderWO();
}
function manualRest(){
  const seconds=Number($('#manualRest').value);
  if(!intOK(seconds,0,1800)){toast('Choose a rest duration from 0 to 1800 seconds');return}
  if(ACTIVE.pausedAt){toast('Resume the workout first');return}
  beginRest(seconds,ACTIVE.nextIndex??null,'Manual recovery break');
}
function openActiveReplacement(){
  openSheet(`<h2>Replace current exercise</h2><p class="small muted">Already logged work is kept. A replacement gets its own example starting load; check it before lifting.</p><label class="f"><span>Choose the actual movement</span><select id="activeReplacement" class="field">${EX.map(e=>`<option value="${e.id}">${esc(e.name)} / ${esc(e.equip)}</option>`).join('')}</select></label><button class="btn" onclick="replaceActiveExercise($('#activeReplacement').value)">Use replacement</button>`);
}
function replaceActiveExercise(id){
  if(!EXI[id]){toast('Choose a library exercise');return}
  const current=ACTIVE.items[ACTIVE.idx],config=itemFromExercise(id,ACTIVE.workout||{restSet:EXI[id].rest||60});
  const e=EXI[id],replacement={id,uid:config.uid,config,t:0,done:false,skipped:false,rem:config.seconds,endAt:0,beeped:false,
    sets:e.type==='sets'?Array.from({length:config.sets},()=>({w:config.weight,r:config.reps,done:false})):null};
  accrue();current.endAt=0;
  const logged=current.sets?.some(s=>s.done)||current.t>0;
  ACTIVE.restEnd=0;ACTIVE.restRemaining=0;ACTIVE.restPaused=false;ACTIVE.nextIndex=null;ACTIVE.timerWasRunning=false;ACTIVE.restWasRunning=false;
  if(logged){ACTIVE.items.splice(ACTIVE.idx+1,0,replacement);ACTIVE.idx++}else ACTIVE.items[ACTIVE.idx]=replacement;
  ACTIVE.enter=Date.now();closeSheet();saveA();renderWO();
}
function activeControls(){
  return `<div class="builder-actions" style="margin:12px 0"><button class="btn2 sm" onclick="toggleWorkoutPause()">${ACTIVE.pausedAt?'Resume workout':'Pause workout'}</button><button class="btn2 sm" onclick="skipExercise()">Skip exercise</button><button class="btn2 sm" onclick="openActiveReplacement()">Replace exercise</button></div>
    <details class="how"><summary>Start a rest / recovery timer</summary><div class="muscle-tags">${[30,45,60,90,120].map(s=>`<button onclick="$('#manualRest').value=${s};manualRest()">${s}s</button>`).join('')}</div><label class="f"><span>Custom rest (seconds)</span><input id="manualRest" class="field" type="number" min="0" max="1800" value="60"></label><button class="btn2 sm" onclick="manualRest()">Start custom rest</button></details>`;
}
