import fs from 'node:fs';
import assert from 'node:assert/strict';

const bootstrap=fs.readFileSync('public/update-bootstrap.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
const version=JSON.parse(fs.readFileSync('public/version.json','utf8'));
const changelog=fs.readFileSync('public/app-v383-changelog.js','utf8');
const pwa=fs.readFileSync('public/app-v35-pwa.js','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-cloudflare.yml','utf8');

assert.equal(version.build,'3.8.4');
assert.equal(manifest.start_url,'./?build=3.8.4');
assert.match(bootstrap,/const BUILD='3\.8\.4'/);
assert.match(bootstrap,/version\.json\?ts=/);
assert.match(bootstrap,/updateViaCache:'none'/);
assert.match(bootstrap,/controllerchange/);
assert.match(bootstrap,/location\.replace/);

assert.match(sw,/const CACHE='fitnest-shell-v3-8-4'/);
assert.match(sw,/cache\.addAll\(APP_SHELL\).*self\.skipWaiting/s);
assert.match(sw,/self\.clients\.claim/);
assert.match(sw,/client\.navigate/);
assert.match(sw,/searchParams\.set\('build',BUILD\)/);
assert.match(sw,/version\.json/);
assert.match(sw,/cache:'no-store'/);

assert.match(index,/update-bootstrap\.js\?v=3\.8\.4/);
assert.match(index,/app\.js\?v=3\.8\.4/);
assert.match(index,/build383\.css\?v=3\.8\.4/);
assert.ok((app.match(/\?v=3\.8\.4/g)||[]).length>=35,'feature modules must be versioned');
assert.match(changelog,/const BUILD='3\.8\.4'/);
assert.match(changelog,/Zuverlässige automatische App-Updates/);
assert.match(pwa,/const BUILD='3\.8\.4'/);

assert.equal(fs.existsSync('.github/workflows/pages.yml'),false,'duplicate Cloudflare workflow must be removed');
assert.match(deploy,/npx --yes wrangler@4 deploy/);
assert.match(deploy,/update-bootstrap\.js/);
assert.match(deploy,/app-v383-changelog\.js/);
assert.match(deploy,/version\.json/);

console.log('Build 3.8.4 automatic update checks: OK');
