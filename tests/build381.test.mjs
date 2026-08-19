import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../public/app-v381-tutorial.js',import.meta.url),'utf8')
  .replace(/const sheet=document\.getElementById\('sheet'\);[\s\S]*$/,'');
const module=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

assert.equal(module.TUTORIAL_STEPS.length,7,'Tutorial muss sieben kompakte Schritte enthalten');
assert.match(module.TUTORIAL_STEPS.map(step=>step.title).join(' '),/Training/);
assert.match(module.TUTORIAL_STEPS.map(step=>step.title).join(' '),/Ernährung/);
assert.match(module.TUTORIAL_STEPS.map(step=>step.title).join(' '),/Erinnerungen/);

assert.equal(module.shouldShowTutorial({onboardingComplete:true}),true,'Erster Start nach dem Onboarding muss das Tutorial zeigen');
assert.equal(module.shouldShowTutorial({onboardingComplete:false}),false,'Tutorial darf das Pflicht-Onboarding nicht überdecken');
assert.equal(module.shouldShowTutorial({onboardingComplete:true,dismissed:true}),false,'Dauerhafte Deaktivierung muss respektiert werden');
assert.equal(module.shouldShowTutorial({onboardingComplete:true,shownThisSession:true}),false,'Später darf nicht in derselben Sitzung erneut öffnen');

assert.equal(module.shouldPreventSheetTouch(2,true),true,'Mehrfinger-Gesten im Sheet müssen blockiert werden');
assert.equal(module.shouldPreventSheetTouch(1,false),true,'Bewegungen außerhalb des Sheet-Inhalts müssen blockiert werden');
assert.equal(module.shouldPreventSheetTouch(1,true),false,'Vertikales Scrollen im Sheet-Inhalt muss möglich bleiben');

console.log('Build 3.8.1 tutorial and sheet rules: OK');
