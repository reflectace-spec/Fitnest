import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const changelog=read('public/app-v383-changelog.js');
const index=read('public/index.html');
const app=read('public/app.js');
const bootstrap=read('public/update-bootstrap.js');
const sw=read('public/sw.js');
const version=JSON.parse(read('public/version.json'));

assert.equal(version.build,'3.8.7');
assert.match(index,/app\.js\?v=3\.8\.7/);
assert.match(index,/update-bootstrap\.js\?v=3\.8\.7/);
assert.ok((app.match(/\?v=3\.8\.7/g)||[]).length>=35);
assert.match(bootstrap,/const BUILD='3\.8\.7'/);
assert.match(sw,/fitnest-shell-v3-8-7/);

assert.match(changelog,/const BUILD='3\.8\.7'/);
assert.match(changelog,/version:'Build 3\.8\.7'/);
assert.match(changelog,/Burger-Menü reagiert wieder zuverlässig/);
assert.match(changelog,/const buildLabel=`Fitnest · Build \$\{BUILD\}`/);
assert.match(changelog,/eyebrow\.textContent!==buildLabel/);
assert.match(changelog,/if\(content\.querySelector\('\[data-v383-changelog\]'\)\)return/);
assert.doesNotMatch(changelog,/startsWith\('Fitnest · Build'\)\)eyebrow\.textContent=/);

console.log('Build 3.8.7 burger menu freeze regression checks: OK');
