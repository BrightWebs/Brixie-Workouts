const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const core=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes("const KEY='rebuild.v1'"))[1];
const planner=fs.readFileSync(path.join(root,'assets/planner.js'),'utf8');
function harness(){
  const storage=new Map(),context=vm.createContext({
    console,TextEncoder,window:{matchMedia:()=>({matches:false}),addEventListener(){}},navigator:{},performance:{now:()=>0},
    document:{querySelector:()=>({scrollTo(){}}),addEventListener(){}},setTimeout(){},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  });
  vm.runInContext(core,context);vm.runInContext(planner,context);
  vm.runInContext("normalizePlanner();render=()=>{};renderWO=()=>{};openWO=()=>{};closeSheet=()=>{};openSheet=()=>{};toast=()=>{};askFinish=()=>{}",context);
  return source=>JSON.parse(vm.runInContext('JSON.stringify('+source+')',context));
}
test('quick workouts fit exact time budgets and available equipment across profile goals',()=>{
  const run=harness();
  const failures=run(`(()=>{
    const failures=[];
    for(const minutes of QUICK_TIMES)for(const goal of Object.keys(JOURNEYS))for(const experience of ['new','returning','regular'])
    for(const focus of ['upper','lower','core'])for(const equipment of [Object.keys(EQUIPMENT_TYPES),['bodyweight'],['bodyweight','dumbbells','bench']]){
      const w=generatedRoutine('quick',minutes,{goal,experience,focus,equipment});
      if(!validRoutine(w)||routineSeconds(w)>minutes*60||!w.items.some(i=>EXI[i.exerciseId].sec==='str')
        ||!w.items.every(i=>availableExercise(EXI[i.exerciseId],equipment)))failures.push({minutes,goal,experience,focus,equipment});
    }
    return failures;
  })()`);
  assert.deepEqual(failures,[]);
});
test('duration includes configured set, exercise, group and longer recovery breaks',()=>{
  const run=harness();
  const seconds=run(`(()=>{
    const w=blankRoutine();w.restExercise=30;w.restGroup=45;w.recoveryEvery=1;w.recoverySeconds=120;
    const row=itemFromExercise('row',w),press=itemFromExercise('chest',w);
    row.seconds=60;press.sets=3;press.reps=10;press.tempo=3;press.rest=45;w.items=[row,press];
    return routineSeconds(w);
  })()`);
  assert.equal(seconds,435);
  assert.equal(run(`(()=>{
    const w=blankRoutine();w.restExercise=30;w.items=['plank','dbug'].map(id=>itemFromExercise(id,w));
    w.items[0].sets=2;w.items[0].reps=30;w.items[0].rest=30;
    w.items[1].sets=2;w.items[1].reps=10;w.items[1].rest=30;return routineSeconds(w);
  })()`),270);
});
test('saved workout execution snapshots custom order and per-exercise settings',()=>{
  const run=harness();
  const result=run(`(()=>{
    const w=blankRoutine();w.items=['chest','row'].map(id=>itemFromExercise(id,w));
    w.items[0].sets=4;w.items[0].reps=7;w.items[0].weight=17.5;w.items[0].rest=90;w.items[1].seconds=35;
    DB.workouts=[w];startSavedWorkout(w.id);w.items[0].weight=99;
    return {order:ACTIVE.items.map(i=>i.id),sets:ACTIVE.items[0].sets.length,reps:ACTIVE.items[0].sets[0].r,
      weight:ACTIVE.items[0].sets[0].w,rest:activeExercise(ACTIVE.items[0]).rest,timer:activeExercise(ACTIVE.items[1]).dur};
  })()`);
  assert.deepEqual(result,{order:['chest','row'],sets:4,reps:7,weight:17.5,rest:90,timer:35});
});
test('workout pause freezes elapsed, exercise and rest timers and resumes without counting paused time',()=>{
  const run=harness();
  const result=run(`(()=>{
    let clock=10000;Date.now=()=>clock;
    const w=blankRoutine();w.items=[itemFromExercise('row',w)];w.items[0].seconds=60;DB.workouts=[w];startSavedWorkout(w.id);
    toggleTimer();clock=12000;beginRest(30,null);toggleWorkoutPause();
    const before={elapsed:activeElapsed(),timer:ACTIVE.items[0].rem,rest:ACTIVE.restRemaining};
    clock=62000;const paused={elapsed:activeElapsed(),timer:ACTIVE.items[0].rem,rest:ACTIVE.restRemaining};
    toggleWorkoutPause();return {before,paused,elapsed:activeElapsed(),timerSeconds:(ACTIVE.items[0].endAt-clock)/1000,restSeconds:(ACTIVE.restEnd-clock)/1000};
  })()`);
  assert.deepEqual(result.before,result.paused);
  assert.equal(result.elapsed,2);
  assert.equal(result.timerSeconds,58);
  assert.equal(result.restSeconds,30);
});
test('recurring schedules and calendar exports honor weekdays, dates and reminders',()=>{
  const run=harness();
  const result=run(`(()=>{
    const w=blankRoutine();w.items=[itemFromExercise('chest',w)];DB.workouts=[w];
    const s={id:'test',workoutId:w.id,startDate:'2026-11-16',endDate:'2026-12-01',days:[2,4],time:'18:00',recurring:true,minutes:30};
    DB.schedules=[s];return {valid:validSchedule(s),monday:scheduleMatches(s,'2026-11-16'),
      tuesday:scheduleMatches(s,'2026-11-17'),before:scheduleMatches(s,'2026-11-12'),after:scheduleMatches(s,'2026-12-03'),
      calendar:calendarText(),invalidDate:dateOK('2026-02-31')};
  })()`);
  assert.equal(result.valid,true);assert.equal(result.monday,false);assert.equal(result.tuesday,true);
  assert.equal(result.before,false);assert.equal(result.after,false);assert.equal(result.invalidDate,false);
  assert.match(result.calendar,/DTSTART:20261117T180000\r\n/);
  assert.match(result.calendar,/RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261201T235959/);
  assert.match(result.calendar,/TRIGGER:-PT15M/);
});
test('completed repeated exercises aggregate all logged sets without replacing existing history',()=>{
  const run=harness();
  const result=run(`(()=>{
    DB.sessions=[{id:'old',date:'2026-01-01',items:{},sets:0}];
    const w=blankRoutine();w.name='My custom session';w.items=['curl','curl'].map(id=>itemFromExercise(id,w));DB.workouts=[w];
    startSavedWorkout(w.id);ACTIVE.items.forEach(i=>{i.done=true;i.sets.forEach(s=>{s.done=true;s.w=15;s.r=8})});finishWorkout();
    return {oldId:DB.sessions[0].id,count:DB.sessions.length,name:DB.sessions[1].name,
      setCount:DB.sessions[1].sets,logged:DB.sessions[1].items.curl.sets.length};
  })()`);
  assert.deepEqual(result,{oldId:'old',count:2,name:'My custom session',setCount:4,logged:4});
});
test('legacy backups gain planner storage without changing their workout history',()=>{
  const run=harness();
  const result=run(`(()=>{
    const history=[{id:'old',items:{chest:{sets:[{w:20,r:10}],t:60,done:true}}}];
    DB={profile:DB.profile,plan:DB.plan,preferences:DB.preferences,sessions:history,bw:[]};
    normalizePlanner();return {same:DB.sessions===history,workouts:DB.workouts,schedules:DB.schedules,enrollments:DB.enrollments};
  })()`);
  assert.deepEqual(result,{same:true,workouts:[],schedules:[],enrollments:[]});
});
test('adding or removing sets recalculates completion and pending automatic transitions',()=>{
  const run=harness();
  const result=run(`(()=>{
    const w=blankRoutine();w.items=['chest','curl'].map(id=>itemFromExercise(id,w));w.items[0].sets=2;DB.workouts=[w];startSavedWorkout(w.id);
    toggleSet(0);toggleSet(1);const completed=ACTIVE.items[0].done;
    addSet();const added={done:ACTIVE.items[0].done,next:ACTIVE.nextIndex,sets:ACTIVE.items[0].config.sets};
    rmSet();return {completed,added,removed:{done:ACTIVE.items[0].done,next:ACTIVE.nextIndex,sets:ACTIVE.items[0].config.sets}};
  })()`);
  assert.deepEqual(result,{completed:true,added:{done:false,next:null,sets:3},removed:{done:true,next:1,sets:2}});
});
test('zero-second paused rests remain paused and can be extended or cancelled when skipping',()=>{
  const run=harness();
  const result=run(`(()=>{
    const w=blankRoutine();w.items=['chest','curl'].map(id=>itemFromExercise(id,w));DB.workouts=[w];startSavedWorkout(w.id);
    beginRest(30,1);toggleRestPause();restAdj(-45);
    const zero={paused:ACTIVE.restPaused,remaining:ACTIVE.restRemaining,index:ACTIVE.idx};
    restAdj(15);const extended=ACTIVE.restRemaining;skipExercise();
    return {zero,extended,index:ACTIVE.idx,paused:ACTIVE.restPaused,next:ACTIVE.nextIndex};
  })()`);
  assert.deepEqual(result,{zero:{paused:true,remaining:0,index:0},extended:15,index:1,paused:false,next:null});
});
test('calendar folds long names at 75 UTF-8 bytes without losing text',()=>{
  const run=harness();
  const calendar=run(`(()=>{
    const w=blankRoutine();w.name='Repeated long workout name '.repeat(3);w.items=[itemFromExercise('chest',w)];DB.workouts=[w];
    DB.schedules=[{id:'test',workoutId:w.id,startDate:'2026-11-16',days:[1],time:'18:00',recurring:true,minutes:30}];return calendarText();
  })()`);
  assert.ok(calendar.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
  assert.match(calendar.replace(/\r\n /g,''),/SUMMARY:Repeated long workout name Repeated long workout name Repeated long workout name /);
});
test('selecting anatomical targets preserves expanded builder settings and saves the draft',()=>{
  const run=harness();
  const result=run(`(()=>{
    let details=[{open:true},{open:false}];
    document.querySelectorAll=()=>details;
    render=()=>{details=[{open:false},{open:false}]};
    DRAFT=blankRoutine();toggleDraftTarget('chest');
    const selected={targets:DRAFT.targets.slice(),saved:DB.workoutDraft.targets.slice(),expanded:details.map(d=>d.open)};
    toggleDraftTarget('chest');
    return {selected,deselected:DRAFT.targets,expanded:details.map(d=>d.open)};
  })()`);
  assert.deepEqual(result,{selected:{targets:['chest'],saved:['chest'],expanded:[true,false]},deselected:[],expanded:[true,false]});
});
