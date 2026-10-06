// Runs every suite against the test build. Usage (from the repo folder): node tests/run-all.js [live-1.4.0-copy.html]
'use strict';
const { execFileSync } = require('child_process'), path = require('path');
const root = path.resolve(__dirname, '..'), st = path.join(root, 'staging', 'index.html');
const runs = [['suite_0_baseline.js', st], ['suite_9_pregnancy.js', st], ['suite_10_preferences.js', st], ['suite_11_environments.js', st, process.argv[2]]];
let failed = 0;
for (const [f, ...args] of runs) {
  try { process.stdout.write(execFileSync('node', [path.join(__dirname, f), ...args.filter(Boolean)], { encoding: 'utf8' })); }
  catch (e) { failed++; process.stdout.write(e.stdout || String(e)); }
}
console.log(failed ? '\nSOME SUITES FAILED' : '\nALL SUITES PASSED');
process.exitCode = failed ? 1 : 0;
