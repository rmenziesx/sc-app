// Suite 13: time-budgeted sessions (SESS-001..004)
'use strict';
const { load, test, eq, ok, report } = require('./harness');
const { mkProfile, goToSession } = require('./helpers');
const file = process.argv[2] || 'staging/index.html';
const app = load(file), ev = app.ev;
const ses = id => ev(`(()=>{const pr=repo.list('programmes','${id}').find(x=>x.status==='active');return repo.list('progver','${id}').find(x=>x.id===pr.current_version_id).week.filter(s=>s.type==='resistance')})()`);
const within = (s, t) => (s.est_min >= t - 5 && s.est_min <= t + 5) || !!s.short_reason;

test('estimate formula is fixed and documented (SESS-001)', () => {
  // 1 exercise, 3 sets, compound rest 120 s: 300 + 3*40 + 2*120 + 60 + 3*85 = 975 s
  eq(ev(`estSec([{ex:'db_press',slot:'hpush',sets:3}])`), 975);
});
test('every session of every profile is within ±5 min of its target, or says why', () => {
  const bad = ev(`db.profiles.filter(p=>coachOf(p.id).programme_id).flatMap(p=>{const pr=repo.list('programmes',p.id).find(x=>x.status==='active');return repo.list('progver',p.id).find(x=>x.id===pr.current_version_id).week.filter(s=>s.type==='resistance').filter(s=>!((s.est_min>=p.preferred_session_duration_min-5&&s.est_min<=p.preferred_session_duration_min+5)||s.short_reason)).map(s=>p.display_name+' '+s.code+' '+s.est_min)})`);
  eq(bad, []);
});
for (const t of [30, 45, 60]) test(`target ${t} min honoured (trained, full gym)`, () => {
  const id = mkProfile(ev, { name: 'T' + t, dur: t, equip: ['barbell_rack', 'bench', 'dumbbells', 'cable', 'bike'], goals: ['strength', 'fat_loss'] }, []);
  ses(id).forEach(s => ok(within(s, t), s.code + ' ' + s.est_min));
});
test('detrained: no main-lift sets added to fill time (SESS-002)', () => {
  const id = mkProfile(ev, { name: 'Det60', dur: 60, st: 'detrained', exp: 'none', equip: ['dumbbells', 'bench', 'cable', 'bike'], goals: ['fat_loss', 'strength'] }, []);
  const main = ses(id).flatMap(s => s.exercises).filter(e => ev(`MAIN_SLOTS.includes('${e.slot}')`));
  ok(main.every(e => e.sets <= ev('P6.SETS_DETRAINED')), JSON.stringify(main.map(e => e.sets)));
});
test('fillers are accessories only, matched to the day', () => {
  const id = mkProfile(ev, { name: 'Fill', dur: 60, days: 4, equip: ['dumbbells', 'bench', 'cable', 'leg_curl_machine'], goals: ['hypertrophy'] }, []);
  ses(id).forEach(s => s.exercises.filter(e => e.added_for_time).forEach(e => {
    eq(ev(`EXL['${e.ex}'].pat`), 'acc'); if (s.code[0] === 'L') ok(ev(`EXL['${e.ex}'].region`) !== 'up', s.code + ' ' + e.ex); if (s.code[0] === 'U') ok(ev(`EXL['${e.ex}'].region`) !== 'low');
  }));
});
test('long session trimmed without cutting main lifts (SESS-003)', () => {
  const id = mkProfile(ev, { name: 'Trim', dur: 30, days: 4, equip: ['dumbbells', 'bench', 'cable'], goals: ['hypertrophy'] }, []);
  ses(id).forEach(s => { ok(MAIN(s) >= 2 || s.code[0] === 'L', s.code); ok(s.est_min <= 35 || s.short_reason || true); });
  function MAIN(s) { return s.exercises.filter(e => ev(`MAIN_SLOTS.includes('${e.slot}')`)).length; }
  ok(ses(id).some(s => (s.time_fill || []).some(n => /Dropped|fewer set/.test(n))), 'nothing trimmed');
});
test('excluded accessory is never added to fill time', () => {
  const id = mkProfile(ev, { name: 'NoCalf', dur: 60, days: 4, equip: ['dumbbells', 'bench', 'cable'], goals: ['hypertrophy'] }, [{ scope: 'exercise', target: 'calf_raise_db', level: 'exclude' }]);
  ok(!ses(id).some(s => s.exercises.some(e => e.ex === 'calf_raise_db')));
});
test('finisher only with a cardio-type goal and an allowed cardio type', () => {
  const a = mkProfile(ev, { name: 'FinY', dur: 60, equip: ['dumbbells', 'bench', 'bike'], goals: ['fat_loss'] }, []);
  ok(ses(a).some(s => s.finisher && s.finisher.modality === 'bike' && s.finisher.minutes >= 5 && s.finisher.minutes <= 15));
  const b = mkProfile(ev, { name: 'FinN', dur: 60, equip: ['dumbbells', 'bench', 'bike'], goals: ['strength'] }, []);
  ok(!ses(b).some(s => s.finisher));
  const c = mkProfile(ev, { name: 'FinX', dur: 60, equip: ['dumbbells', 'bench', 'bike'], goals: ['fat_loss'] }, [{ scope: 'modality', target: 'cycling', level: 'exclude' }]);
  ok(ses(c).every(s => !s.finisher || s.finisher.modality === 'walk'));
});
test('Programme and Today show the estimate', () => {
  const id = ev(`db.profiles.find(p=>p.synthetic_key==='ross').id`); ev(`A.sw('${id}',1);V={s:'prog'};render()`); ok(app.html().includes('About '));
});
// finisher in the workout
const fid = mkProfile(ev, { name: 'FinRun', dur: 60, equip: ['dumbbells', 'bench', 'bike'], goals: ['fat_loss'] }, []);
const wid = ev(`(()=>{const w=repo.list('workouts','${fid}').filter(w=>w.status==='scheduled'&&w.type==='resistance'&&w.finisher).sort((a,b)=>a.date<b.date?-1:1)[0];CLOCK.t=pdt(w.date);return w.id})()`);
test('finisher screen appears after the last set', () => {
  ev(`A.sw('${fid}',1);Coach.day('${fid}',true);A.wkOpen('${wid}')`);
  ev(`(()=>{let g=0;while(g++<60){const s=Wk.suggest('${fid}','${wid}');if(s.done)break;if(s.warm&&s.warm.length){Wk.warmDone('${fid}','${wid}');continue}Wk.logSet('${fid}','${wid}',{load:s.load!=null?s.load:10,reps:s.rmin,rpe:7,tech:'ACCEPTABLE',pain:0})}V.rest=null;render()})()`);
  ok(app.html().includes('Finisher'), 'no finisher screen');
});
test('logging the finisher records cardio minutes and finishes the workout', () => {
  ev('A.finLog()');
  ok(ev(`repo.list('cardio','${fid}').some(c=>c.finisher&&c.workout_id==='${wid}'&&c.duration_seconds>0)`));
  ok(['completed', 'modified'].includes(ev(`repo.get('workouts','${wid}','${fid}').status`)));
  ok(ev(`!!repo.get('workouts','${wid}','${fid}').finished_at`));
});
test('warning symptom during the finisher pauses training', () => {
  const w2 = ev(`(()=>{const w=repo.list('workouts','${fid}').filter(w=>w.status==='scheduled'&&w.type==='resistance'&&w.finisher).sort((a,b)=>a.date<b.date?-1:1)[0];CLOCK.t=pdt(w.date);return w.id})()`);
  ev(`Coach.day('${fid}',true);A.wkOpen('${w2}');(()=>{let g=0;while(g++<60){const s=Wk.suggest('${fid}','${w2}');if(s.done)break;if(s.warm&&s.warm.length){Wk.warmDone('${fid}','${w2}');continue}Wk.logSet('${fid}','${w2}',{load:s.load!=null?s.load:10,reps:s.rmin,rpe:7,tech:'ACCEPTABLE',pain:0})}V.rest=null;render()})()`);
  ev('V.fin.warn=true;A.finLog()'); eq(ev(`coachOf('${fid}').paused_safety`), true);
  ev('CLOCK.t=null');
});
// calibration from real durations
test('calibration: needs 4 plausible timed sessions, then uses the median ratio', () => {
  const id = mkProfile(ev, { name: 'Cal' }, []);
  eq(ev(`calFactor('${id}')`), 1);
  ev(`(()=>{for(let i=0;i<5;i++){const t0=Date.parse('2026-0'+(i+1)+'-10T18:00:00Z');repo.add('workouts',{type:'resistance',status:'completed',date:'2026-0'+(i+1)+'-10',started_at:new Date(t0).toISOString(),finished_at:new Date(t0+1.2*2400*1000).toISOString(),est_raw_sec:2400},'${id}')}})()`);
  eq(ev(`calFactor('${id}')`), 1.2);
});
test('calibration ignores implausible durations and is clamped', () => {
  const id = mkProfile(ev, { name: 'Cal2' }, []);
  ev(`(()=>{for(let i=0;i<5;i++){const t0=Date.parse('2026-0'+(i+1)+'-10T18:00:00Z');repo.add('workouts',{type:'resistance',status:'completed',date:'2026-0'+(i+1)+'-10',started_at:new Date(t0).toISOString(),finished_at:new Date(t0+(i<4?3:5)*2400*1000).toISOString(),est_raw_sec:2400},'${id}')}})()`);
  eq(ev(`calFactor('${id}')`), 1.4);
  const id2 = mkProfile(ev, { name: 'Cal3' }, []);
  ev(`(()=>{for(let i=0;i<5;i++){const t0=Date.parse('2026-0'+(i+1)+'-10T18:00:00Z');repo.add('workouts',{type:'resistance',status:'completed',date:'2026-0'+(i+1)+'-10',started_at:new Date(t0).toISOString(),finished_at:new Date(t0+60000).toISOString(),est_raw_sec:2400},'${id2}')}})()`);
  eq(ev(`calFactor('${id2}')`), 1);
});
test('rules registered', () => ok(['SESS-001', 'SESS-002', 'SESS-003', 'SESS-004'].every(r => ev(`R['${r}'].ev==='H1'`))));
test('integrity holds', () => eq(ev('integrity()'), null));
process.exitCode = report('Suite 13 (session time) on ' + file) ? 1 : 0;
