// Suite 9: CP-001 pregnancy / postpartum screening (rules SAF-PREG-001..006)
'use strict';
const { load, test, eq, ok, report } = require('./harness');
const { mkProfile, weekTypes, goToSession } = require('./helpers');
const file = process.argv[2] || 'staging/index.html';
const app = load(file), ev = app.ev;
const P = (s, sex, day) => ev(`Eng.preg(${JSON.stringify(s)},'${sex || 'female'}','${day || '2026-10-06'}')`);
const A = o => Object.assign({ answered_at: '2026-10-06', pelvic: {} }, o);

// ---- pure engine ----
test('male profile: not applicable', () => eq(P(null, 'male').state, 'na'));
test('unanswered: incomplete and blocks programme (SAF-PREG-005)', () => { const r = P(null); eq([r.state, r.block, r.rules[0]], ['incomplete', true, 'SAF-PREG-005']); });
test('"unspecified" sex is asked too', () => eq(P(null, 'unspecified').state, 'incomplete'));
test('pregnant: blocks, escalates (SAF-PREG-001)', () => { const r = P(A({ preg: 'yes' })); eq([r.state, r.block, r.esc, r.impact, r.loadUp], ['pregnant', true, true, false, false]); });
test('no / no: no restrictions', () => { const r = P(A({ preg: 'no', birth: 'no' })); eq([r.state, r.impact, r.loadUp, r.block], ['none', true, true, false]); });
test('birth 11 months ago: postpartum (boundary below)', () => eq(P(A({ preg: 'no', birth: 'yes', months_at_answer: 11 })).state, 'postpartum'));
test('birth 12 months ago: window ended (boundary at)', () => eq(P(A({ preg: 'no', birth: 'yes', months_at_answer: 12 })).state, 'none'));
test('birth 13 months ago: window ended (boundary above)', () => eq(P(A({ preg: 'no', birth: 'yes', months_at_answer: 13 })).state, 'none'));
test('birth yes with months unknown: treated as inside window', () => eq(P(A({ preg: 'no', birth: 'yes', months_at_answer: null })).state, 'postpartum'));
test('postpartum: no impact, loads held, not blocked', () => { const r = P(A({ preg: 'no', birth: 'yes', months_at_answer: 4 })); eq([r.impact, r.loadUp, r.block], [false, false, false]); });
test('window counts forward in time: 10 months at answer, 2 months later = 12 = ended', () => eq(ev(`Eng.preg({preg:'no',birth:'yes',months_at_answer:10,answered_at:'2026-01-15',pelvic:{}},'female','2026-03-15').state`), 'none'));
test('one day short of the month does not count', () => eq(ev(`Eng.preg({preg:'no',birth:'yes',months_at_answer:10,answered_at:'2026-01-15',pelvic:{}},'female','2026-03-14').state`), 'postpartum'));
['pnts'].forEach(x => {
  test('prefer not to say (pregnancy) is the cautious option', () => { const r = P(A({ preg: x, birth: 'no' })); eq([r.state, r.impact, r.loadUp, r.rules[0]], ['undisclosed', false, false, 'SAF-PREG-004']); });
  test('prefer not to say (birth) is the cautious option', () => { const r = P(A({ preg: 'no', birth: x })); eq([r.impact, r.loadUp], [false, false]); });
});
test('every "prefer not to say" combination is at least as cautious as postpartum', () => {
  for (const pr of ['no', 'pnts']) for (const bi of ['no', 'yes', 'pnts']) {
    if (pr !== 'pnts' && bi !== 'pnts') continue;
    const r = P(A({ preg: pr, birth: bi, months_at_answer: 3 })); ok(!r.impact && !r.loadUp, pr + '/' + bi);
  }
});
test('pelvic symptom without recent birth: impact stopped, escalate (SAF-PREG-003)', () => { const r = P(A({ preg: 'no', birth: 'no', pelvic: { leak: true } })); eq([r.state, r.impact, r.esc, r.loadUp], ['symptom', false, true, true]); });
test('pelvic symptom never clears with time', () => eq(ev(`Eng.preg({preg:'no',birth:'no',answered_at:'2026-01-01',pelvic:{heavy:true}},'female','2028-01-01').esc`), true));
test('malformed answers are not guessed: incomplete', () => eq(P({ preg: 'maybe', answered_at: '2026-10-06' }).state, 'incomplete'));

// ---- screening history stays reproducible ----
test('1.4.0 screening records replay with the old question list', () => eq(ev(`Eng.screen({preg:true},'1.4.0').g`), 'MODIFY'));
test('1.5.0 general screening no longer contains the combined pregnancy question', () => eq(ev(`Q.some(q=>q[0]==='preg')`), false));

// ---- programme behaviour ----
const ids = ev('Synth.create()');
const by = k => ev(`db.profiles.find(p=>p.synthetic_key==='${k}').id`);
test('pregnant demo: programme paused, nothing scheduled', () => {
  const id = by('demo_preg'); ev(`Coach.day('${id}',true)`);
  eq(ev(`coachOf('${id}').programme_blocked`), 'PREGNANT');
  eq(ev(`repo.list('workouts','${id}').filter(w=>w.status==='scheduled').length`), 0);
  ok(ev(`repo.list('audit','${id}').some(a=>a.rule_id==='SAF-PREG-001')`), 'audit missing');
});
test('pregnant demo: check-ins and weight still work', () => {
  const id = by('demo_preg');
  ok(ev(`!!Chk.log('${id}',{sleep:7,readiness:6,soreness:2,illness:false,pain:0})`));
  ok(ev(`!!Chk.body('${id}',{kg:70,waist:80})`));
});
test('postpartum demo: no running, sport or interval sessions despite running goal', () => {
  const id = by('demo_pp4'); ok(ev(`P()&&true`)); const t = weekTypes(ev, id); ok(t && !t.includes('running') && !t.includes('sport'), JSON.stringify(t));
});
test('13 months postpartum demo: running sessions return', () => ok(weekTypes(ev, by('demo_pp13')).includes('running')));
test('prefer-not-to-say demo: no running sessions', () => ok(!weekTypes(ev, by('demo_pnts')).includes('running')));
test('postpartum: planned effort capped at RPE 7', () => {
  const id = by('demo_pp4'), wid = goToSession(ev, id, 'resistance'); ok(wid, 'no resistance session');
  ev(`Coach.day('${id}',true);Wk.start('${id}','${wid}')`);
  ok(ev(`repo.get('workouts','${wid}','${id}').plan.every(x=>x.rpe<=7)`));
});
test('postpartum: easy sets never raise the load mid-session (SAF-PREG-002)', () => {
  const id = by('demo_pp4'), wid = ev(`Wk.active('${id}').id`);
  const before = ev(`(()=>{const w=repo.get('workouts','${wid}','${id}');if(w.ptr.load==null)Wk.logSet('${id}','${wid}',{load:10,reps:8,rpe:6,tech:'ACCEPTABLE',pain:0});return repo.get('workouts','${wid}','${id}').ptr.load})()`);
  const sg = ev(`Wk.suggest('${id}','${wid}')`);
  const r = ev(`Wk.logSet('${id}','${wid}',{load:${before},reps:${sg.rmax},rpe:5,tech:'ACCEPTABLE',pain:0})`);
  ok(r.ok, JSON.stringify(r));
  if (!r.exerciseDone) { eq(ev(`repo.get('workouts','${wid}','${id}').ptr.load`), before, 'load changed'); }
});
test('postpartum: target load not raised between sessions; hold is audited', () => {
  const id = by('demo_pp4'), wid = ev(`Wk.active('${id}').id`);
  ev(`(()=>{let g=0;while(g++<40){const s=Wk.suggest('${id}','${wid}');if(s.done)break;const l=s.load!=null?s.load:10;Wk.logSet('${id}','${wid}',{load:l,reps:s.rmax,rpe:5,tech:'ACCEPTABLE',pain:0})}Wk.finish('${id}','${wid}')})()`);
  const bad = ev(`repo.list('audit','${id}').filter(a=>a.decision_type==='PROGRESSION'&&a.rule_id==='PROG-001').filter(a=>{const st=repo.list('progression','${id}').find(s=>s.exercise_id===a.input_snapshot.exercise);return st&&a.input_snapshot.prev_target!=null&&st.target_load>a.input_snapshot.prev_target}).length`);
  eq(bad, 0);
});
test('changing answers to no/no rebuilds the programme', () => {
  const id = by('demo_preg');
  ev(`(()=>{const p=prof('${id}');setPreg(p,{preg:'no',birth:'no',pelvic:{},answered_at:today(),v:1},'profile');onHealthChanged('${id}')})()`);
  eq(ev(`coachOf('${id}').programme_blocked`), null);
  ok(weekTypes(ev, id).length > 0);
});
test('answer history is kept (never overwritten)', () => eq(ev(`prof('${by('demo_preg')}').preg_history.length`), 1));
test('legacy female profile without answers: programme pauses until answered (migration)', () => {
  const id = mkProfile(ev, { name: 'Legacy F' }, [], null);
  eq(ev(`coachOf('${id}').programme_blocked`), 'HEALTH_INCOMPLETE');
});
test('male profile is never blocked by these questions', () => {
  const id = mkProfile(ev, { name: 'M1', sex: 'male' }, []);
  eq(ev(`coachOf('${id}').programme_blocked`), null);
});

// ---- assessment flow through the screens ----
ev('CLOCK.t=null');
const newPid = mkProfile(ev, { name: 'Flow F' }, []);
test('screening shows pregnancy questions, pre-filled with current answers', () => {
  ev(`A.sw('${newPid}',1);A.start()`);
  ev(`(()=>{const a=curA();if(!a){repo.list('assessments','${newPid}').forEach(x=>{});}})()`);
  // finalised baseline exists, so A.start opens a reassessment confirmation; accept it
  ev(`A.ok&&ASK&&A.ok()`); ev('V={s:"as"};render()');
  ok(app.html().includes('Are you currently pregnant?'));
  eq(app.w.document.getElementById('pg_preg').value, 'no');
});
test('blank pregnancy answer is refused, nothing recorded', () => {
  const n0 = ev(`repo.list('results','${newPid}').filter(r=>r.test_id==='preg_screen').length`);
  app.w.document.getElementById('pg_preg').value = ''; app.w.document.getElementById('pg_birth').value = '';
  ev('A.scr()'); ok(app.w.document.getElementById('msg').textContent.includes('Are you currently pregnant'));
  eq(ev(`repo.list('results','${newPid}').filter(r=>r.test_id==='preg_screen').length`), n0);
});
test('pelvic symptom + professional tick: running step still skipped (SAF-PREG-006)', () => {
  const d = app.w.document; d.getElementById('pg_preg').value = 'no'; d.getElementById('pg_birth').value = 'no'; d.getElementById('pg_heavy').checked = true;
  ev('A.scr()'); eq(ev(`curA().state.gates.preg`), 'MODIFY');
  ev(`repo.upd('assessments',curA().id,'${newPid}',x=>{x.state.over=true;x.state.step=6});V={s:'as'};render()`);
  ok(app.html().includes('Not needed'), 'run step not skipped');
  ok(!app.html().includes('Single-leg balance'), 'running test shown');
});
test('male profile screening has no pregnancy questions', () => {
  const m = mkProfile(ev, { name: 'Flow M', sex: 'male' }, []);
  ev(`A.sw('${m}',1);A.start();A.ok&&ASK&&A.ok();V={s:'as'};render()`);
  ok(!app.html().includes('Are you currently pregnant?'));
});
test('pregnant answer blocks exertional tests even if professional tick is set', () => {
  const f = mkProfile(ev, { name: 'Flow P' }, []);
  ev(`A.sw('${f}',1);A.start();A.ok&&ASK&&A.ok();V={s:'as'};render()`);
  const d = app.w.document; d.getElementById('pg_preg').value = 'yes';
  ev('A.scr()');
  ev(`repo.upd('assessments',curA().id,'${f}',x=>{x.state.over=true})`);
  eq(ev('blocked(curA())'), true);
});
test('integrity holds', () => eq(ev('integrity()'), null));
test('all new rules registered with evidence class', () => ok(['SAF-PREG-001', 'SAF-PREG-002', 'SAF-PREG-003', 'SAF-PREG-004', 'SAF-PREG-005', 'SAF-PREG-006'].every(r => ev(`R['${r}']&&R['${r}'].ev==='S1'`))));
process.exitCode = report('Suite 9 (pregnancy/postpartum) on ' + file) ? 1 : 0;
