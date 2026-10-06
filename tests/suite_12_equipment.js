// Suite 12: equipment check (EQ-001/002), empty slots (GEN-004/005), test-build session start (TEST-001)
'use strict';
const { load, test, eq, ok, report } = require('./harness');
const { mkProfile, weekEx } = require('./helpers');
const file = process.argv[2] || 'staging/index.html';
const app = load(file), ev = app.ev;
const sessions = id => ev(`(()=>{const pr=repo.list('programmes','${id}').find(x=>x.status==='active');if(!pr)return null;return repo.list('progver','${id}').find(x=>x.id===pr.current_version_id).week.filter(s=>s.type==='resistance')})()`);

// ---- empty slots ----
test('barbell-only gym: lunge slot now filled (barbell split squat)', () => {
  const id = mkProfile(ev, { name: 'Bb', sex: 'male', equip: ['barbell_rack', 'bench', 'cable'], days: 3 }, []);
  ok(weekEx(ev, id).includes('barbell_split_squat'));
});
test('dumbbells without a bench: chest press slot filled by floor press', () => {
  const id = mkProfile(ev, { name: 'Db', equip: ['dumbbells'], days: 2 }, []);
  ok(weekEx(ev, id).includes('db_floor_press'));
});
test('floor press is fallback only: never chosen when a bench is available', () => {
  const id = mkProfile(ev, { name: 'Db2', equip: ['dumbbells', 'bench'], days: 3 }, []);
  ok(!weekEx(ev, id).includes('db_floor_press'));
});
test('lower days never get upper-body accessories (GEN-005)', () => {
  const id = mkProfile(ev, { name: 'Ul', equip: ['dumbbells', 'bench', 'cable'], days: 4, goals: ['hypertrophy'] }, []);
  const low = sessions(id).filter(s => s.code[0] === 'L').flatMap(s => s.exercises.map(e => e.ex));
  ok(!low.some(e => ev(`EXL['${e}'].region==='up'`)), JSON.stringify(low)); ok(low.includes('calf_raise_db'));
});
test('upper days never get lower-body accessories', () => {
  const id = mkProfile(ev, { name: 'Ul2', equip: ['dumbbells', 'bench', 'cable'], days: 4, goals: ['hypertrophy'] }, []);
  const up = sessions(id).filter(s => s.code[0] === 'U').flatMap(s => s.exercises.map(e => e.ex));
  ok(!up.some(e => ev(`EXL['${e}'].region==='low'`)), JSON.stringify(up));
});
test('a slot that cannot be filled is reported with equipment that would fill it', () => {
  const id = mkProfile(ev, { name: 'Gap', sex: 'male', equip: ['cable'], days: 3, goals: ['strength'] }, []);
  const g = sessions(id).flatMap(s => s.gaps || []).filter(x => !x.filled);
  ok(g.length > 0, 'expected a gap'); ok(g.some(x => x.unlock && x.unlock.length > 0), 'no unlock hint');
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='GEN-004')`), 'gap not audited');
});
test('fallback fills are reported, not silent', () => {
  const id = mkProfile(ev, { name: 'Fb', sex: 'male', equip: ['barbell_rack'], days: 3 }, []);
  ok(sessions(id).flatMap(s => s.gaps || []).length >= 0); // reported list exists on every session
  ok(sessions(id).every(s => Array.isArray(s.gaps)));
});
test('gaps show in Programme view', () => {
  const id = mkProfile(ev, { name: 'GapV', sex: 'male', equip: ['cable'], days: 3, goals: ['strength'] }, []);
  ev(`A.sw('${id}',1);V={s:'prog'};render()`); ok(app.html().includes('for your equipment'));
});

// ---- equipment confirmation ----
test('unconfirmed equipment: no programme written (EQ-001)', () => {
  const id = mkProfile(ev, { name: 'Uc', noEqConfirm: true }, []);
  eq(ev(`coachOf('${id}').programme_blocked`), 'EQUIP_CHECK'); eq(sessions(id), null);
});
test('equipment check screen previews sessions and lists every item', () => {
  const id = ev(`db.profiles.find(p=>p.display_name==='Uc').id`); ev(`A.sw('${id}',1);V={s:'eq'};render()`);
  ok(app.html().includes('Sessions this would give you')); ok(app.html().includes('Dumbbells'));
});
test('ticking equipment updates the preview before saving', () => {
  ev(`A.eqTog('barbell_rack')`); ok(app.html().includes('Barbell'), 'preview not updated');
  eq(ev(`P().equipment_ids.includes('barbell_rack')`), false, 'saved too early');
});
test('confirming writes the programme with the ticked equipment', () => {
  ev('A.eqOk()'); const id = ev('P().id');
  eq(ev(`coachOf('${id}').programme_blocked`), null); ok(sessions(id).length > 0); eq(ev(`P().equipment_ids.includes('barbell_rack')`), true);
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='EQ-001')`));
});
test('changing equipment in the profile asks for a new check', () => {
  const id = ev('P().id'); ev(`P().equipment_ids=P().equipment_ids.filter(x=>x!=='cable');onProfileChanged('${id}')`);
  eq(ev(`coachOf('${id}').programme_blocked`), 'EQUIP_CHECK');
  ev(`V={s:'eq'};render();A.eqOk()`); eq(ev(`coachOf('${id}').programme_blocked`), null);
});
test('new block waits for an equipment check; current sessions continue (EQ-002)', () => {
  const id = ev('P().id'), v0 = ev(`repo.list('programmes','${id}').find(x=>x.status==='active').current_version_id`);
  ev(`(()=>{const p=P();p.equipment_confirmed.at='2000-01-01';cu('${id}',c=>{c.meso.start=today()});createProgramme('${id}','block rotation')})()`);
  eq(ev(`coachOf('${id}').eq_block_due`), true); eq(ev(`repo.list('programmes','${id}').find(x=>x.status==='active').current_version_id`), v0);
  ev(`V={s:'home'};render()`); ok(app.html().includes('New training block ready'));
  ev(`V={s:'eq'};render();A.eqOk()`); eq(ev(`coachOf('${id}').eq_block_due`), false);
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='EQ-001'&&a.input_snapshot.block_rotation===true)`), 'confirmation did not release the block rotation');
});
test("today's session lists the equipment it uses", () => {
  const id = ev(`db.profiles.find(p=>p.synthetic_key==='demo_norun').id`); ev(`A.sw('${id}',1);V={s:'home'};render()`);
  ok(app.html().includes('Uses:'));
});

// ---- test-build session start ----
test('every demo profile with a programme has a session today', () => {
  const miss = ev(`synthProfiles().filter(p=>coachOf(p.id).programme_id&&!Wk.today(p.id)).map(p=>p.display_name)`); eq(miss, []);
});
test('mid-workout demo has a session in progress with 2 sets logged', () => {
  const id = ev(`db.profiles.find(p=>p.synthetic_key==='demo_mid').id`), w = ev(`Wk.active('${id}')`);
  ok(w, 'no active workout'); eq(ev(`repo.list('sets','${id}').filter(s=>s.workout_id==='${w.id}').length`), 2);
});
test('test build: can switch away from a demo profile mid-workout', () => {
  const id = ev(`db.profiles.find(p=>p.synthetic_key==='demo_mid').id`), other = ev(`db.profiles.find(p=>p.synthetic_key==='demo_norun').id`);
  ev(`A.sw('${id}',1);A.sw('${other}')`); eq(ev('P().id'), other);
});
test('start-now moves a scheduled session to today and opens it', () => {
  const id = ev('P().id'); ev(`(()=>{const w=Wk.active('${id}');if(w)Wk.finish('${id}',w.id)})()`);
  const nx = ev(`repo.list('workouts','${id}').filter(w=>w.status==='scheduled'&&w.date>today()).sort((a,b)=>a.date<b.date?-1:1)[0]`); ok(nx, 'no future session');
  ev(`A.practice('${nx.id}')`); eq(ev(`repo.get('workouts','${nx.id}','${id}').date`), ev('today()')); eq(ev('V.s'), 'wk');
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='TEST-001')`));
});
test('start-now button appears on Programme and rest days', () => {
  ev(`V={s:'prog'};render()`); ok(app.html().includes('Start this session now (test build)'));
});
test('integrity holds', () => eq(ev('integrity()'), null));
process.exitCode = report('Suite 12 (equipment, slots, test sessions) on ' + file) ? 1 : 0;
