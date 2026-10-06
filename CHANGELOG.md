# S&C app – change log

## How this repo is organised
- `index.html` – the LIVE app (rmenziesx.github.io/sc-app/). Real data, storage name `scapp.v1`.
- `staging/index.html` – the TEST build (rmenziesx.github.io/sc-app/staging/). Orange banner, demo data, storage name `scapp.staging.v1`. Never touches live data.
- `tests/` – automated tests (run in Node, never on the phone). `npm install jsdom@24` once, then `node tests/run-all.js`.
- `tools/make-release.js` – builds `index.html` from the approved `staging/index.html`, changing only the environment line and the Home Screen name.

Workflow: change staging → run tests → upload staging → Ross checks with demo data → approved → make-release → upload index.html.

## 1.5.0 (test build 2026-10-06) – awaiting approval
- CP-001 Pregnancy / recent-birth screening (SAF-PREG-001..006). Replaces the single combined 1.4.0 question. Pregnant: programme paused, ESCALATE. Birth within 12 months or "prefer not to say": no running/sport/intervals, loads held (reps only), effort cap RPE 7. Pelvic symptom: impact stopped, ESCALATE, never clears on its own. Professional-advice tick never lifts these.
- CP-007 Training preferences (PREF-001..011): No / Avoid / OK / Prefer for cardio types, movement types and exercises; conflict check against goals; "it hurts" becomes a restriction; swap an exercise today only or always; replacement keeps its own history; running-readiness test skipped when running is not needed.
- Migration MIG-150: old free-text exclusions converted (same matches as before) and flagged for review; profiles not recorded as male answer the new questions before their next programme.
- Test build environment, demo profiles with "What to check" notes, reset.
- Unchanged: programmes and 4-month simulations for Ross Test, Lindsey Test and Beginner Test are identical to 1.4.0.
- CP-008 Empty slots (GEN-004/005): related-slot fill (lunge<->squat, chest<->overhead press, rows<->pulldowns), otherwise the slot is left empty and the app says so and names equipment that would fill it. Lower days use lower-body accessories only. Added barbell split squat, barbell bent-over row, dumbbell floor press (fallback only) and dumbbell calf raise.
- CP-009 Equipment check (EQ-001/002): equipment confirmed on a preview screen before any programme is written and after any equipment change; each new block waits for re-confirmation while the current block continues. Today's session lists the equipment it uses.
- Test build only (TEST-001): "Start this session now" on Programme days and rest days; every demo profile has a session today; Mid-workout demo; demo profiles can be switched mid-workout.
- Note: adding exercises changes some rotations for existing profiles from the next programme they generate.
- CP-010 Time-budgeted sessions (SESS-001..004): every session is sized to the profile's preferred minutes (±5). Short: add region-matched accessories, then accessory sets, then an easy cardio finisher (cardio-type goals only). Long: drop/trim accessories. Main-lift sets are never added or cut for time. Any session outside the band shows its reason. Estimates self-calibrate after 4 timed sessions. Finisher screen after the last set, logged as cardio minutes; a warning symptom pauses training.
- Tests: 163 (suite 0 baseline 24, 9 pregnancy 39, 10 preferences 38, 11 environments/upgrade 23, 12 equipment 21, 13 session time 18).
