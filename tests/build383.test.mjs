import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('public/app-v383-changelog.js','utf8');
const css=fs.readFileSync('public/build383.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(js,/const BUILD='3\.8\.[3-9][0-9]*'/);
assert.match(js,/data-v383-changelog/);
assert.match(js,/Alle umgesetzten Änderungen mit Datum und Build-Stand/);
assert.match(js,/Build 3\.8\.2/);
assert.match(js,/Build 3\.8\.1/);
assert.match(js,/Build 3\.8/);
assert.match(js,/Build 3\.7/);
assert.match(js,/Build 3\.6/);
assert.match(js,/Build 3\.5/);
assert.match(js,/Build 3\.4/);
assert.match(js,/Build 3\.3/);
assert.match(js,/Build 3\.2/);
assert.match(js,/Build 3\.1/);
assert.match(js,/Build 3\.0/);
assert.match(js,/Build 2\.9/);
assert.match(js,/Build 2\.8/);
assert.match(js,/Build 2\.7/);
assert.match(js,/Build 2\.6/);
assert.match(js,/Build 2\.5/);
assert.match(js,/Build 2\.4/);
assert.match(js,/Build 2\.3/);
assert.match(js,/Build 2\.2/);
assert.match(js,/Build 2\.1/);
assert.match(js,/Build 2\.0/);
assert.match(js,/Build 1/);
assert.match(js,/Zurück zu den Einstellungen/);
assert.match(css,/\.v383-entry/);
assert.match(css,/\.v383-settings-button/);
assert.match(app,/app-v383-changelog\.js/);
assert.match(index,/build383\.css/);
assert.match(sw,/app-v383-changelog\.js/);
assert.match(sw,/build383\.css/);
assert.match(sw,/fitnest-shell-v3-8-[3-9][0-9]*/);

const entryCount=(js.match(/version:'(?:Build|Hotfix)/g)||[]).length;
assert.ok(entryCount>=30,`expected at least 30 changelog entries, got ${entryCount}`);

console.log(`Build 3.8.3 changelog: OK (${entryCount} entries)`);
