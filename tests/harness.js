// Test harness: loads an app HTML file in a simulated browser (jsdom) and
// lets tests evaluate code inside the app's own scope. No network, no real phone storage.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function load(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.resolve(file), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: opts.url || 'https://rmenziesx.github.io/sc-app/',
    pretendToBeVisual: true,
    beforeParse(w) {
      if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]);
      w.scrollTo = () => {};
      w.navigator.clipboard = { writeText: () => Promise.resolve() };
    }
  });
  const w = dom.window;
  const ev = code => w.eval(code);
  return { dom, w, ev, html: () => w.document.getElementById('app').innerHTML, close: () => w.close() };
}

// Minimal test runner
const results = { pass: 0, fail: 0, failures: [] };
function test(name, fn) {
  try { fn(); results.pass++; }
  catch (e) { results.fail++; results.failures.push(name + '\n    ' + (e && e.message)); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg ? msg + ': ' : '') + 'expected ' + B + ' got ' + A);
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function throws(fn, msg) { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(msg || 'expected an error'); }
function report(label) {
  console.log(`\n${label}: ${results.pass} passed, ${results.fail} failed`);
  results.failures.forEach(f => console.log('  FAIL ' + f));
  return results.fail;
}
module.exports = { load, test, eq, ok, throws, report, results };
