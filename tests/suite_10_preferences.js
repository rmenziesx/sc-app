// Suite 10: CP-007 training preferences, conflicts, swaps (rules PREF-001..011, MIG-150)
'use strict';
const { load, test, eq, ok, report } = require('./harness');
const { mkProfile, weekTypes, weekEx, weekMods, goToSession } = require('./helpers');
const file = process.argv[2] || 'staging/index.html';
const app = load(file), ev = app.ev;
ev('Synth.create()');
const by = k => ev(`db.profiles.find(p=>p.synthetic_key==='${k}').id`);
const X = (scope, target, level, reason) => ({ scope, target, level, reason: reason || 'dislike' });

// ---- levels ----
test('exercise setting overrides its movement type (PREF-010)', () => {
  const id = mkProfile(ev, { name: 'Lv1' }, [X('pattern', 'squat', 'exclude'), X('exercise', 'goblet_squat', 'prefer')]);
  eq(ev(`exLevel(prof('${id}'),'goblet_squat')`), 'prefer'); eq(ev(`exLevel(prof('${id}'),'split_squat_db')`), 'neutral');
});
test('excluded exercise is never available (PREF-001)', () => {
  const id = mkProfile(ev, { name: 'Ex1' }, [X('exercise', 'db_press', 'exclude')]);
  eq(ev(`avail(prof('${id}'),'db_press')`), false); ok(!weekEx(ev, id).includes('db_press'));
});
test('excluded movement type removes the whole pattern', () => {
  const id = mkProfile(ev, { name: 'Ex2' }, [X('pattern', 'vpush', 'exclude')]);
  ok(!weekEx(ev, id).some(e => ['db_ohp', 'ohp_barbell', 'kb_press', 'shoulder_press_machine'].includes(e)));
});
test('avoid is used when there is no alternative (PREF-002)', () => {
  const id = mkProfile(ev, { name: 'Av1', equip: ['dumbbells'] }, [X('exercise', 'goblet_squat', 'avoid')]);
  ok(weekEx(ev, id).includes('goblet_squat'));
});
test('avoid is skipped when an alternative exists (PREF-002)', () => {
  const id = mkProfile(ev, { name: 'Av2', equip: ['dumbbells', 'kettlebell'] }, [X('exercise', 'goblet_squat', 'avoid')]);
  const w = weekEx(ev, id); ok(!w.includes('goblet_squat') && w.includes('kb_goblet_squat'), JSON.stringify(w));
});
test('prefer wins over neutral options (PREF-003)', () => {
  const id = mkProfile(ev, { name: 'Pf1', equip: ['barbell_rack', 'bench', 'dumbbells', 'cable'] }, [X('exercise', 'goblet_squat', 'prefer')]);
  const w = weekEx(ev, id); ok(w.includes('goblet_squat') && !w.includes('squat_barbell'), JSON.stringify(w));
});
test('baseline strength test skips an excluded exercise and uses the next option', () => {
  const id = mkProfile(ev, { name: 'Pk1', equip: ['barbell_rack', 'bench', 'dumbbells'] }, [X('exercise', 'squat_barbell', 'exclude')]);
  eq(ev(`pick(prof('${id}')).map(t=>t.id)`)[0], 'goblet_squat');
});

// ---- cardio / running ----
test('no-running demo: no running sessions, cardio on the bike', () => {
  const id = by('demo_norun'); ok(!weekTypes(ev, id).includes('running')); ok(weekMods(ev, id).every(m => m === 'bike'));
});
test('running excluded: running readiness not needed', () => eq(ev(`runNeeded(prof('${by('demo_norun')}'))`), false));
test('cardio type excluded: next equipment type used', () => {
  const id = mkProfile(ev, { name: 'Cd1', goals: ['general_fitness'], equip: ['dumbbells', 'bike', 'rower'] }, [X('modality', 'cycling', 'exclude')]);
  ok(weekMods(ev, id).every(m => m === 'rower'), JSON.stringify(weekMods(ev, id)));
});
test('every cardio type excluded: no cardio sessions, nothing excluded is used (PREF-006)', () => {
  const id = mkProfile(ev, { name: 'Cd2', goals: ['strength'], equip: ['dumbbells'] }, [X('modality', 'walking', 'exclude')]);
  eq(weekMods(ev, id), []);
});
test('cardio goal with every cardio type excluded: conflict', () => {
  const id = mkProfile(ev, { name: 'Cd3', goals: ['cardio'], equip: ['dumbbells'] }, [X('modality', 'walking', 'exclude')]);
  eq(ev(`coachOf('${id}').programme_blocked`), 'PREF_CONFLICT');
});

// ---- conflicts (PREF-004) ----
test('conflict demo: programme paused', () => { const id = by('demo_conflict'); ev(`Coach.day('${id}',true)`); eq(ev(`coachOf('${id}').programme_blocked`), 'PREF_CONFLICT'); eq(weekTypes(ev, id), null); });
test('fix A (remove goal): programme built without running', () => {
  const id = by('demo_conflict'); ev(`A.sw('${id}',1);A.fixConf('run_goal','a')`);
  eq(ev(`coachOf('${id}').programme_blocked`), null); ok(!ev(`prof('${id}').primary_goals.includes('running')`)); ok(!weekTypes(ev, id).includes('running'));
});
test('fix B (allow running): programme includes running', () => {
  const id = mkProfile(ev, { name: 'Cf2', goals: ['running', 'general_fitness'] }, [X('modality', 'running', 'exclude')]);
  ev(`A.sw('${id}',1);A.fixConf('run_goal','b')`);
  eq(ev(`coachOf('${id}').programme_blocked`), null); ok(weekTypes(ev, id).includes('running'));
});
test('conflict resolution is audited', () => ok(ev(`db.audit.some(a=>a.rule_id==='PREF-004'&&a.decision_type==='PREFERENCES')`)));
test('sport pathway + running excluded: conflict', () => {
  const id = mkProfile(ev, { name: 'Cf3', sex: 'male', sport: true, goals: ['general_fitness'] }, [X('modality', 'running', 'exclude')]);
  ok(ev(`prefConflicts(prof('${id}')).some(c=>c.id==='sport')`));
});

// ---- pain reason -> restriction (PREF-011) ----
test('pain demo: no preference saved, an active restriction instead', () => {
  const id = by('demo_pain');
  eq(ev(`prefsOf(prof('${id}')).items.length`), 0);
  ok(ev(`coachOf('${id}').limitations.some(l=>l.status==='active'&&l.ex==='goblet_squat')`));
});
test('pain demo: restricted exercise is substituted in the session', () => {
  const id = by('demo_pain'), wid = goToSession(ev, id, 'resistance'); ok(wid);
  ev(`Coach.day('${id}',true);Wk.start('${id}','${wid}')`);
  ok(!ev(`repo.get('workouts','${wid}','${id}').plan.some(x=>x.ex==='goblet_squat')`));
  ev(`Wk.finish('${id}','${wid}');CLOCK.t=null`);
});

// ---- legacy migration (MIG-150) ----
test('old "press" entry converts to the same exercises the old matcher excluded', () => {
  const id = by('demo_legacy');
  const got = ev(`prefsOf(prof('${id}')).items.filter(i=>i.level==='exclude').map(i=>i.target).sort()`);
  const old = ev(`Object.keys(EXL).filter(k=>!EXL[k].custom&&EXL[k].n.toLowerCase().includes('press')).sort()`);
  eq(got, old);
});
test('unrecognised legacy entry is reported, flagged for review', () => {
  const pr = ev(`prefsOf(prof('${by('demo_legacy')}'))`); eq(pr.unmatched, ['zumba']); eq(pr.needs_review, true);
});
test('migration is idempotent (no duplicate audits)', () => {
  const id = mkProfile(ev, { name: 'Mg1', legacy: ['curl'] }, null);
  ev('mig();mig()');
  eq(ev(`repo.list('audit','${id}').filter(a=>a.rule_id==='MIG-150').length`), 1);
  ok(ev(`prefsOf(prof('${id}')).items.length`) >= 1);
});
test('legacy free text is no longer read by the planner', () => {
  const id = mkProfile(ev, { name: 'Mg2' }, []);
  ev(`prof('${id}').exercise_exclusions=['press'];createProgramme('${id}','test')`);
  ok(weekEx(ev, id).some(e => /press/.test(e)), 'free text still applied');
});

// ---- versioning (PREF-009) ----
test('saving creates a new version and keeps the old one', () => {
  const id = mkProfile(ev, { name: 'Vs1' }, [X('exercise', 'db_press', 'exclude')]);
  ev(`A.sw('${id}',1);V={s:'tp'};render();A.tpSet('exercise','db_press','neutral');A.tpSet('modality','rowing','avoid');A.tpSave()`);
  const pr = ev(`prefsOf(prof('${id}'))`);
  eq(pr.v, 2); eq(pr.history.length, 1); eq(pr.history[0].items[0].target, 'db_press');
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='PREF-009')`));
});
test('preferences screen pain reason becomes a restriction on save', () => {
  const id = mkProfile(ev, { name: 'Vs2' }, []);
  ev(`A.sw('${id}',1);V={s:'tp'};render();A.tpSet('exercise','db_row','exclude');A.tpReason('exercise','db_row','pain');A.tpSave()`);
  ok(!ev(`prefsOf(prof('${id}')).items.some(i=>i.target==='db_row')`));
  ok(ev(`coachOf('${id}').limitations.some(l=>l.ex==='db_row'&&l.status==='active')`));
});

// ---- onboarding order ----
test('new profile goes to preferences first', () => {
  ev(`V={s:'pf'};render()`); const d = app.w.document;
  d.getElementById('f_name').value = 'Onboard F'; d.getElementById('f_dob').value = '1990-05-05'; d.getElementById('f_sex').value = 'female'; d.getElementById('f_h').value = '165';
  ev('A.saveP()'); eq(ev('V.s'), 'tp'); ok(app.html().includes('One more step'));
});
test('baseline cannot start before preferences are saved', () => {
  ev(`V={s:'home'};A.start()`); eq(ev('V.s'), 'tp'); eq(ev('V.next'), 'as');
});
test('saving preferences continues into the baseline', () => {
  ev('A.tpSave()'); ok(ev('!!curA()'), 'no assessment started'); eq(ev('V.s'), 'as');
});

// ---- swaps (PREF-007 / PREF-008) ----
const sid = mkProfile(ev, { name: 'Sw1', equip: ['dumbbells', 'bench', 'cable', 'kettlebell'] }, []);
const wid = goToSession(ev, sid, 'resistance');
ev(`Coach.day('${sid}',true);A.sw('${sid}',1);Wk.start('${sid}','${wid}')`);
test('swap offered before the first set, alternatives exclude the current exercise', () => {
  ok(ev(`swapAllowed('${sid}',repo.get('workouts','${wid}','${sid}'))`));
  const cur = ev(`repo.get('workouts','${wid}','${sid}').plan[0].ex`); ok(!ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))`).includes(cur));
});
test('excluded exercise is never offered as a swap', () => {
  const w = ev(`repo.get('workouts','${wid}','${sid}')`), alts = ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))`);
  ev(`setPrefItem(prof('${sid}'),'exercise','${alts[0]}','exclude')`);
  ok(!ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))`).includes(alts[0]));
  ev(`setPrefItem(prof('${sid}'),'exercise','${alts[0]}','neutral')`);
});
let orig, repl;
test('swap today only: session changes, preferences do not', () => {
  const w = ev(`repo.get('workouts','${wid}','${sid}')`); orig = w.plan[0].ex; repl = ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))[0]`);
  const v0 = ev(`prefsOf(prof('${sid}')).v`);
  ok(ev(`Wk.swap('${sid}','${wid}','${repl}','today').ok`));
  eq(ev(`repo.get('workouts','${wid}','${sid}').plan[0].ex`), repl); eq(ev(`prefsOf(prof('${sid}')).v`), v0);
  ok(ev(`repo.list('audit','${sid}').some(a=>a.decision_type==='SESSION_SWAP')`));
});
test('replacement has its own history; nothing copied (PREF-008)', () => {
  eq(ev(`repo.list('progression','${sid}').filter(s=>s.exercise_id==='${repl}').length`), 1);
  eq(ev(`(repo.list('progression','${sid}').find(s=>s.exercise_id==='${repl}').history||[]).length`), 0);
});
test('swap refused after a set is logged', () => {
  ev(`(()=>{const s=Wk.suggest('${sid}','${wid}');if(s.warm)Wk.warmDone('${sid}','${wid}');const s2=Wk.suggest('${sid}','${wid}');Wk.logSet('${sid}','${wid}',{load:s2.load!=null?s2.load:10,reps:s2.rmin,rpe:7,tech:'ACCEPTABLE',pain:0})})()`);
  const alts = ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))`);
  eq(ev(`Wk.swap('${sid}','${wid}','${alts[0] || orig}','today').ok`), false);
});
test('swap always: original excluded; plan rebuilt only after the workout ends', () => {
  ev(`(()=>{let g=0;do{Wk.skipEx('${sid}','${wid}')}while(g++<8&&!swapAllowed('${sid}',repo.get('workouts','${wid}','${sid}')))})()`);
  const w = ev(`repo.get('workouts','${wid}','${sid}')`), cur = w.plan[w.ptr.e].ex, alt = ev(`swapAlts('${sid}',repo.get('workouts','${wid}','${sid}'))[0]`);
  ok(ev(`Wk.swap('${sid}','${wid}','${alt}','always').ok`));
  eq(ev(`exLevel(prof('${sid}'),'${cur}')`), 'exclude'); ok(ev(`!!coachOf('${sid}').regen_pending`), 'rebuild should wait');
  ev(`Wk.finish('${sid}','${wid}');onPrefsChanged('${sid}',coachOf('${sid}').regen_pending)`);
  ok(!weekEx(ev, sid).includes(cur)); eq(ev(`coachOf('${sid}').regen_pending`), null);
  ev('CLOCK.t=null');
});

// ---- isolation ----
test("one profile's preferences never change another's plan", () => {
  const a = mkProfile(ev, { name: 'IsoA' }, []), b = mkProfile(ev, { name: 'IsoB' }, []);
  const before = weekEx(ev, b);
  ev(`setPrefItem(prof('${a}'),'pattern','squat','exclude');onPrefsChanged('${a}')`);
  eq(weekEx(ev, b), before); ok(!weekEx(ev, a).some(e => ev(`EXL['${e}'].pat`) === 'squat'));
});
test('integrity holds', () => eq(ev('integrity()'), null));
test('every PREF rule registered', () => ok(Array.from({ length: 11 }, (_, i) => 'PREF-' + String(i + 1).padStart(3, '0')).every(r => ev(`!!R['${r}']`))));
process.exitCode = report('Suite 10 (preferences) on ' + file) ? 1 : 0;
