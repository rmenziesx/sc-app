// Suite 0: regression baseline. Records behaviour that must NOT change between releases.
// Usage: node tests/suite_0_baseline.js <path-to-app.html>
'use strict';
const { load, test, eq, ok, throws, report } = require('./harness');
const file = process.argv[2] || 'staging/index.html';

const app = load(file);
const ev = app.ev;

test('rules version is semantic', () => ok(/^\d+\.\d+\.\d+$/.test(ev('RV'))));
test('every rule has description and evidence class', () => {
  const bad = ev(`Object.entries(R).filter(([k,r])=>!r.d||!['E1','E2','E3','H1','U1','S1'].includes(r.ev)).map(x=>x[0])`);
  eq(bad, []);
});

// Safety screening (unchanged categories)
test('red flag -> ESCALATE', () => eq(ev(`Eng.screen({chest:true}).g`), 'ESCALATE'));
test('illness -> STOP', () => eq(ev(`Eng.screen({ill:true}).g`), 'STOP'));
test('heart condition -> MODIFY', () => eq(ev(`Eng.screen({heart:true}).g`), 'MODIFY'));
test('nothing ticked -> ALLOW', () => eq(ev(`Eng.screen({}).g`), 'ALLOW'));
test('missing screening -> STOP', () => eq(ev(`Eng.screen(null).g`), 'STOP'));
test('red flag beats illness', () => eq(ev(`Eng.screen({chest:true,ill:true}).g`), 'ESCALATE'));

// Estimates
test('Epley 100kg x5 = 116.7', () => eq(ev(`Eng.epley(100,5)`), 116.7));
test('Epley rejects bad input', () => eq(ev(`Eng.epley(-1,5)`), null));
test('pain 7 -> ESCALATE', () => eq(ev(`Eng.pain({pain:7}).g`), 'ESCALATE'));
test('worsening pain -> STOP', () => eq(ev(`Eng.pain({pain:2,worse:true}).g`), 'STOP'));

// Repository ownership (profile isolation enforced below the UI)
test('repo.list requires a profile', () => throws(() => ev(`repo.list('workouts')`)));
test('repo.add rejects mismatched profile', () => throws(() => ev(`repo.add('body',{profile_id:'aaaaaaaa1'},'bbbbbbbb2')`)));

// Synthetic profiles + simulation
const ids = ev(`Synth.create()`);
test('synthetic create returns 3+ profiles', () => ok(ids.length >= 3));
test('each synthetic profile has a finalised baseline', () => {
  ids.forEach(id => ok(ev(`!!lastFinal('${id}')`), 'no baseline for ' + id));
});
test('cross-profile read is refused', () => {
  const w = ev(`(()=>{const id='${ids[0]}';Coach.day(id,true);return repo.list('workouts',id)[0]})()`);
  ok(w, 'expected a workout');
  throws(() => ev(`repo.get('workouts','${w.id}','${ids[1]}')`));
});
test('cross-profile list never leaks', () => {
  const leak = ev(`repo.list('workouts','${ids[1]}').filter(w=>w.profile_id!=='${ids[1]}').length`);
  eq(leak, 0);
});
const sim = ev(`Synth.simulate(60,11)`);
test('60-day simulation completes', () => ok(sim.ok));
test('integrity holds after simulation', () => eq(ev(`integrity()`), null));
test('every audit record carries a rules version', () => eq(ev(`db.audit.filter(a=>!a.rules_version).length`), 0));
test('logged working-set decisions reproduce exactly', () => {
  const bad = ev(`db.audit.filter(a=>a.decision_type==='WORKING_SET_EFFORT'||a.decision_type==='NEXT_SESSION_PROGRESSION').slice(0,300).filter(a=>{try{return Coach.reproduce(a)!==true}catch(e){return true}}).length`);
  eq(bad, 0);
});
test('profile switch changes the visible name', () => {
  ev(`A.sw('${ids[1]}',1)`);
  const name = ev(`P().display_name`);
  ok(app.w.document.body.textContent.includes(name));
});
test('full backup JSON round-trips', () => {
  const s = ev(`JSON.stringify(db)`);
  const n = ev(`norm(JSON.parse(${JSON.stringify(s)})).profiles.length`);
  eq(n, ev(`db.profiles.length`));
});

process.exitCode = report('Suite 0 (baseline) on ' + file) ? 1 : 0;
