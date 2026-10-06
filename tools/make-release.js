// Builds the live app (index.html) from the approved test build (staging/index.html).
// It changes ONLY the environment line and the Home Screen name, so the code you approved is the code that ships.
// Usage (from the repo folder): node tools/make-release.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'staging', 'index.html'), 'utf8');
const swaps = [
  ["const BUILD_ENV='staging';", "const BUILD_ENV='release';"],
  ['<meta name="apple-mobile-web-app-title" content="SC Test">', '<meta name="apple-mobile-web-app-title" content="S&C">'],
  ['<title>SC Test build</title>', '<title>S&C Baseline Assessment</title>']
];
for (const [a, b] of swaps) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error('Release build stopped: expected 1 match for ' + a + ', found ' + n); process.exit(1); }
  s = s.replace(a, b);
}
fs.writeFileSync(path.join(root, 'index.html'), s);
console.log('Release written to index.html (' + s.length + ' bytes)');
