// Shared helpers for building test profiles inside the app.
'use strict';
function mkProfile(ev, over, prefsItems, preg) {
  // Creates a non-demo profile with a finalised baseline (from the Lindsey test spec) and returns its id.
  return ev(`(()=>{const sp=JSON.parse(JSON.stringify(SYN.lindsey));Object.assign(sp,${JSON.stringify(over || {})});
    const p={id:uid(),display_name:sp.name||('T'+uid().slice(0,6)),date_of_birth:sp.dob,sex:sp.sex,height_cm:sp.h,weight_unit:'kg',distance_unit:'km',
      training_experience:sp.exp,current_training_status:sp.st,current_activity_level:sp.act,primary_goals:sp.goals,secondary_goals:[],
      training_days_per_week:sp.days,preferred_session_duration_min:sp.dur,equipment_ids:sp.equip,exercise_preferences:[],exercise_exclusions:sp.legacy||[],
      health_screening_status:'not_done',onboarding_status:'not_started',created_at:now(),updated_at:now(),archived_at:null,
      sport_return:{enabled:!!sp.sport,sport:'recreational 5-a-side'},synthetic:false};
    ${preg === undefined ? "p.preg_screen=p.sex==='male'?undefined:{preg:'no',birth:'no',pelvic:{},answered_at:today(),v:1};" : preg === null ? '' : `p.preg_screen=Object.assign({pelvic:{}},${JSON.stringify(preg)},{answered_at:today(),v:1});`}
    ${prefsItems === null ? '' : `p.training_prefs={v:1,items:${JSON.stringify(prefsItems || [])}.map(i=>Object.assign({reason:'dislike',note:'',created_at:now()},i)),confirmed_at:now(),history:[]};`}
    db.profiles.push(p);synthBaseline(p.id,sp);Coach.day(p.id,true);return p.id})()`);
}
const weekTypes = (ev, id) => ev(`(()=>{const pr=repo.list('programmes','${id}').find(x=>x.status==='active');if(!pr)return null;const v=repo.list('progver','${id}').find(x=>x.id===pr.current_version_id);return v.week.map(s=>s.type)})()`);
const weekEx = (ev, id) => ev(`(()=>{const pr=repo.list('programmes','${id}').find(x=>x.status==='active');if(!pr)return null;const v=repo.list('progver','${id}').find(x=>x.id===pr.current_version_id);return v.week.flatMap(s=>(s.exercises||[]).map(e=>e.ex))})()`);
const weekMods = (ev, id) => ev(`(()=>{const pr=repo.list('programmes','${id}').find(x=>x.status==='active');if(!pr)return null;const v=repo.list('progver','${id}').find(x=>x.id===pr.current_version_id);return v.week.filter(s=>s.type==='cardio').map(s=>s.modality)})()`);
// Moves the app clock to the next day with a scheduled workout of the given type and returns that workout id.
const goToSession = (ev, id, type) => ev(`(()=>{const w=repo.list('workouts','${id}').filter(w=>w.status==='scheduled'&&w.type==='${type}').sort((a,b)=>a.date<b.date?-1:1)[0];if(!w)return null;CLOCK.t=pdt(w.date);return w.id})()`);
module.exports = { mkProfile, weekTypes, weekEx, weekMods, goToSession };
