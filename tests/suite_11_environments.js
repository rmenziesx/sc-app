// Suite 11: test build vs live build separation, and upgrade of 1.4.0 phone data.
// Usage: node tests/suite_11_environments.js <staging.html> <live-1.4.0.html>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { load, test, eq, ok, report } = require('./harness');
const stagingFile = process.argv[2] || 'staging/index.html';
const oldLive = process.argv[3];
// build a release copy exactly as tools/make-release.js does, into a temp folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
fs.mkdirSync(path.join(tmp, 'staging')); fs.mkdirSync(path.join(tmp, 'tools'));
fs.copyFileSync(stagingFile, path.join(tmp, 'staging', 'index.html'));
fs.copyFileSync(path.join(__dirname, '..', 'tools', 'make-release.js'), path.join(tmp, 'tools', 'make-release.js'));
require('child_process').execFileSync('node', [path.join(tmp, 'tools', 'make-release.js')]);
const releaseFile = path.join(tmp, 'index.html');

// ---- staging ----
const s = load(stagingFile);
test('test build uses its own storage name', () => eq(s.ev('KEY'), 'scapp.staging.v1'));
test('test build shows the orange banner', () => ok(s.w.document.getElementById('bar').textContent.includes('TEST BUILD')));
test('test build loads demo data on first open', () => ok(s.ev('db.profiles.filter(p=>p.synthetic).length') >= 10));
test('test build opens on the No-running demo', () => eq(s.ev('P().synthetic_key'), 'demo_norun'));
test('every demo profile has a "What to check" note', () => eq(s.ev(`Object.keys(SYN).filter(k=>k.startsWith('demo_')&&!SYN[k].check)`), []));
test('reset puts demo edits back', () => {
  const id = s.ev(`P().id`); s.ev(`setPrefItem(P(),'modality','running','neutral');Synth.reset()`);
  eq(s.ev(`modLevel(prof('${id}'),'running')`), 'exclude');
});
const liveJson = JSON.stringify({ schema: 1, active: null, profiles: [], marker: 'LIVE' });
const s2 = load(stagingFile, { storage: { 'scapp.v1': liveJson } });
test('test build never reads or writes live data', () => {
  s2.ev(`Synth.simulate(10,3)`); eq(s2.w.localStorage.getItem('scapp.v1'), liveJson);
});

// ---- release ----
const r = load(releaseFile);
test('live build uses the live storage name', () => eq(r.ev('KEY'), 'scapp.v1'));
test('live build has no banner', () => ok(!r.w.document.getElementById('bar').textContent.includes('TEST BUILD')));
test('live build creates no demo data', () => eq(r.ev('db.profiles.length'), 0));
test('live build has no demo profile definitions', () => eq(r.ev(`Object.keys(SYN).filter(k=>k.startsWith('demo_'))`), []));
test('live build Home Screen name is S&C', () => ok(fs.readFileSync(releaseFile, 'utf8').includes('content="S&C"')));
test('live build never shows start-now test buttons', () => {
  const r2 = load(releaseFile, { storage: { 'scapp.v1': s.w.localStorage.getItem('scapp.staging.v1') } });
  const id = r2.ev(`db.profiles.find(p=>p.synthetic_key==='lindsey').id`); r2.ev(`A.sw('${id}',1);V={s:'prog'};render()`);
  ok(!r2.html().includes('test build')); r2.ev(`V={s:'home'};render()`); ok(!r2.html().includes('test build'));
  const n = r2.ev(`repo.list('workouts','${id}').filter(w=>w.status==='scheduled').length`); const wid = r2.ev(`repo.list('workouts','${id}').find(w=>w.status==='scheduled'&&w.date>today()).id`);
  r2.ev(`A.practice('${wid}')`); ok(r2.ev(`repo.get('workouts','${wid}','${id}').date`) !== r2.ev('today()'), 'live build moved a session');
});
test('live build hides test tools when there are no test profiles', () => { r.ev(`V={s:'prof'};render()`); ok(!r.html().includes('Demo data (test build)') && !r.html().includes('Create missing demo')); });
test('release differs from the approved test build in exactly 3 places', () => {
  const a = fs.readFileSync(stagingFile, 'utf8').split('\n'), b = fs.readFileSync(releaseFile, 'utf8').split('\n');
  eq(a.length, b.length); eq(a.filter((l, i) => l !== b[i]).length, 2); // head line (2 swaps) + env line
});

// ---- upgrading real 1.4.0 phone data ----
if (oldLive) {
  const o = load(oldLive);
  o.ev(`Synth.create();Synth.simulate(30,9);db.profiles.forEach(p=>{p.synthetic=false;delete p.synthetic_key});db.profiles[1].exercise_exclusions=['curl'];save()`);
  const old = o.w.localStorage.getItem('scapp.v1');
  const before = JSON.parse(old);
  const u = load(releaseFile, { storage: { 'scapp.v1': old } });
  test('upgrade keeps every record', () => {
    const d = JSON.parse(u.w.localStorage.getItem('scapp.v1') || old);
    ['workouts', 'sets', 'assessments', 'results', 'body', 'recovery'].forEach(c => ok(u.ev(`db.${c}.length`) >= before[c].length, c));
  });
  test('upgrade: integrity holds', () => eq(u.ev('integrity()'), null));
  test('upgrade: old exclusion converted and flagged for review', () => {
    const p = u.ev(`db.profiles[1].training_prefs`); ok(p.needs_review); ok(p.items.some(i => /curl/.test(u.ev(`EXL['${i.target}'].n.toLowerCase()`))));
  });
  test('upgrade: male profile asked to confirm equipment once (EQ-001)', () => { const id = u.ev(`db.profiles[0].id`); u.ev(`Coach.day('${id}',true)`); eq(u.ev(`coachOf('${id}').programme_blocked`), 'EQUIP_CHECK'); });
  test('upgrade: confirming equipment resumes the same programme', () => {
    const id = u.ev(`db.profiles[0].id`), pr0 = u.ev(`repo.list('programmes','${id}')[0].id`);
    u.ev(`A.sw('${id}',1);V={s:'eq'};render();A.eqOk()`);
    eq(u.ev(`coachOf('${id}').programme_blocked`), null); eq(u.ev(`repo.list('programmes','${id}').find(x=>x.status==='active').id`), pr0);
  });
  test('upgrade: female profile asked the new questions before her next programme', () => { const id = u.ev(`db.profiles[1].id`); u.ev(`Coach.day('${id}',true)`); eq(u.ev(`coachOf('${id}').programme_blocked`), 'HEALTH_INCOMPLETE'); });
  test('upgrade: past workouts are not changed', () => {
    const ids = before.workouts.filter(w => w.status === 'completed').map(w => w.id);
    const same = u.ev(`${JSON.stringify(ids)}.every(id=>db.workouts.find(w=>w.id===id).status==='completed')`); ok(same);
  });
  test('upgrade: old audit records still reproduce under 1.4.0', () => eq(u.ev(`db.audit.filter(a=>a.rules_version==='1.4.0'&&(a.decision_type==='WORKING_SET_EFFORT'||a.decision_type==='NEXT_SESSION_PROGRESSION')).slice(0,200).filter(a=>Coach.reproduce(a)!==true).length`), 0));
}
process.exitCode = report('Suite 11 (environments + upgrade)') ? 1 : 0;
