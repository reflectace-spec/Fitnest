import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const index=read('public/index.html');
const app=read('public/app.js');
const bootstrap=read('public/update-bootstrap.js');
const sw=read('public/sw.js');
const recipes=read('public/app-v32-recipes.js');
const settings=read('public/app-v2.js');
const pwa=read('public/app-v35-pwa.js');
const tutorial=read('public/app-v381-tutorial.js');
const nativeShell=read('public/app-v385-native-shell.js');
const changelog=read('public/app-v383-changelog.js');
const headers=read('public/_headers');
const deploy=read('.github/workflows/deploy-cloudflare.yml');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const version=JSON.parse(read('public/version.json'));

assert.equal(version.build,'3.8.6');
assert.equal(manifest.start_url,'./');
assert.match(index,/app\.js\?v=3\.8\.6/);
assert.match(index,/update-bootstrap\.js\?v=3\.8\.6/);
assert.ok((app.match(/\?v=3\.8\.6/g)||[]).length>=35);

assert.match(recipes,/import \{ CONFIG \} from '\.\/config\.js';/);
assert.match(recipes,/CONFIG\.supabaseUrl/);
assert.match(settings,/const BUILD='3\.8\.6'/);
assert.match(pwa,/const BUILD='3\.8\.6'/);
assert.match(pwa,/\[data-v35-center-open\]/);
assert.match(tutorial,/const BUILD='3\.8\.6'/);
assert.match(nativeShell,/const BUILD='3\.8\.6'/);
assert.match(changelog,/version:'Build 3\.8\.6'/);
assert.match(changelog,/Kanonische Produktion und vollständiger App-Start/);

assert.match(bootstrap,/const BUILD='3\.8\.6'/);
assert.match(bootstrap,/history\.replaceState/);
assert.match(bootstrap,/searchParams\.delete\('build'\)/);
assert.match(bootstrap,/normalizeBuildLabels/);
assert.doesNotMatch(bootstrap,/searchParams\.set\('build'/);
assert.match(sw,/fitnest-shell-v3-8-6/);
assert.match(sw,/searchParams\.delete\('build'\)/);
assert.doesNotMatch(sw,/searchParams\.set\('build'/);
assert.match(headers,/Cache-Control: no-cache, no-store, must-revalidate/);

assert.match(deploy,/fitnest\.reflectace\.workers\.dev\//);
assert.match(deploy,/cmp -s public\/index\.html/);
assert.match(deploy,/cmp -s public\/app-v32-recipes\.js/);
assert.match(deploy,/cmp -s public\/manifest\.webmanifest/);

console.log('Build 3.8.6 canonical production checks: OK');
