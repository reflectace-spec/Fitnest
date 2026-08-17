/* Build 2.6.1 · onboarding first-step hotfix */
const DRAFT='fitnest.onboarding.v26.draft';

function readDraft(){
  try{return JSON.parse(localStorage.getItem(DRAFT)||'{}')||{}}catch{return{}}
}
function writeDraft(d){localStorage.setItem(DRAFT,JSON.stringify(d))}
function localDate(d){
  const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)
}
function showInline(message){
  const root=document.getElementById('v26Onboarding');
  if(!root)return;
  let note=root.querySelector('[data-v261-inline]');
  if(!note){
    note=document.createElement('div');
    note.dataset.v261Inline='1';
    note.className='notice v261-inline';
    root.querySelector('.v26-actions')?.after(note);
  }
  note.textContent=message;
  note.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function field(root,name){return root.querySelector(`[name="${name}"]`)}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('#v26Onboarding [data-next]');
  if(!button)return;
  const d=readDraft();
  if(Number(d.step||0)!==0)return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const root=document.getElementById('v26Onboarding');
  if(!root)return;
  const required=['currentWeight','targetWeight','targetDate','height','age'];
  for(const name of required){
    const el=field(root,name);
    if(!el?.value || !el.checkValidity()){
      el?.focus();
      showInline('Bitte dieses Feld vollständig und gültig ausfüllen.');
      return;
    }
  }

  d.goal=field(root,'goal')?.value||d.goal||'weight_loss';
  d.currentWeight=field(root,'currentWeight').value;
  d.targetWeight=field(root,'targetWeight').value;
  d.targetDate=field(root,'targetDate').value;
  d.height=field(root,'height').value;
  d.age=field(root,'age').value;
  d.sex=field(root,'sex')?.value||d.sex||'male';
  d.activity=field(root,'activity')?.value||d.activity||'low';

  const current=Number(d.currentWeight),target=Number(d.targetWeight);
  const requested=new Date(`${d.targetDate}T12:00:00`);
  const weeks=Math.max(1,(requested-Date.now())/(7*86400000));
  const requiredRate=Math.max(0,current-target)/weeks;
  if(requiredRate>1){
    sessionStorage.setItem('fitnest.v261.notice',`Dein Zieltermin ${d.targetDate} würde etwa ${requiredRate.toFixed(1)} kg Abnahme pro Woche erfordern. Er bleibt gespeichert, Fitnest plant aus Sicherheitsgründen aber mit höchstens 1 kg pro Woche.`);
  }

  d.step=1;
  writeDraft(d);
  location.reload();
},true);

function revealNotice(){
  const msg=sessionStorage.getItem('fitnest.v261.notice');
  if(!msg)return;
  const root=document.getElementById('v26Onboarding');
  if(!root)return;
  sessionStorage.removeItem('fitnest.v261.notice');
  showInline(msg);
}

const observer=new MutationObserver(()=>revealNotice());
observer.observe(document.documentElement,{childList:true,subtree:true});
revealNotice();
