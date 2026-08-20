import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('public/build385.css','utf8');
const nativeShell=fs.readFileSync('public/app-v385-native-shell.js','utf8');
const onboarding=fs.readFileSync('public/app-v26-onboarding.js','utf8');
const tutorial=fs.readFileSync('public/app-v381-tutorial.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const changelog=fs.readFileSync('public/app-v383-changelog.js','utf8');
const version=JSON.parse(fs.readFileSync('public/version.json','utf8'));
const deploy=fs.readFileSync('.github/workflows/deploy-cloudflare.yml','utf8');

assert.equal(version.build,'3.8.5');
assert.match(index,/build385\.css\?v=3\.8\.5/);
assert.match(index,/app\.js\?v=3\.8\.5/);
assert.match(app,/app-v385-native-shell\.js\?v=3\.8\.5/);
assert.match(sw,/fitnest-shell-v3-8-5/);
assert.match(sw,/build385\.css/);
assert.match(sw,/app-v385-native-shell\.js/);

assert.match(css,/body\.v26-onboarding-open\{position:fixed/);
assert.match(css,/\.v26-onboarding\{[^}]*overflow-x:hidden;overflow-y:auto/);
assert.match(css,/\.sheet[^}]*touch-action:none/);
assert.match(css,/\.sheet \.sheet-inner[^}]*touch-action:pan-y/);
assert.match(css,/overscroll-behavior:none/);
assert.match(nativeShell,/Number\(touchCount\)>1/);
assert.match(nativeShell,/gesturestart/);
assert.match(nativeShell,/gesturechange/);
assert.match(nativeShell,/gestureend/);
assert.match(nativeShell,/touchmove/);
assert.match(nativeShell,/passive:false/);
assert.match(nativeShell,/window\.scrollX===0/);
assert.match(nativeShell,/v385-overlay-lock/);

assert.match(onboarding,/Build 3\.8\.5/);
assert.match(tutorial,/const BUILD='3\.8\.5'/);
assert.match(changelog,/Build 3\.8\.5/);
assert.match(changelog,/Festes App-Gefühl auf iPhone und iPad/);
assert.match(deploy,/build385\.css/);
assert.match(deploy,/app-v385-native-shell\.js/);

console.log('Build 3.8.5 native touch lock checks: OK');
