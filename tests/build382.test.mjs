import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('public/app-v382-progress-hotfix.js','utf8');
const css=fs.readFileSync('public/build382.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(js,/const BUILD='3\.8\.2'/);
assert.match(js,/function normalizeSheet\(\)/);
assert.match(js,/sheet-inner v382-legacy-sheet/);
assert.match(js,/function svgChart\(/);
assert.match(js,/data-v382-progress/);
assert.match(js,/data-v382-range="all"/);
assert.match(js,/body_metrics/);
assert.match(js,/progressPercent/);
assert.match(css,/\.progress22-hero \.hero-actions/);
assert.match(css,/\.v382-chart/);
assert.match(css,/\.v382-legacy-sheet \.sheet-body/);
assert.match(app,/app-v382-progress-hotfix\.js/);
assert.match(index,/build382\.css/);
assert.match(sw,/fitnest-shell-v3-8-[2-9][0-9]*/);
assert.match(sw,/app-v382-progress-hotfix\.js/);
assert.match(sw,/build382\.css/);
console.log('Build 3.8.2 checks passed.');
