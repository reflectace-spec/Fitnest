function nextTime(rows){
  const last=rows.at(-1)?.querySelector('input[type="time"]')?.value||'12:00';
  const [h,m]=last.split(':').map(Number);
  const mins=Math.min((Number.isFinite(h)?h:12)*60+(Number.isFinite(m)?m:0)+180,23*60+30);
  return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
}

function renumber(editor){
  const rows=[...editor.querySelectorAll('.schedule-row')];
  rows.forEach((row,i)=>{
    row.classList.add('v243-row');
    const label=row.querySelector('input:not([type="time"])');
    const time=row.querySelector('input[type="time"]');
    if(label)label.name=`meal_label_${i}`;
    if(time)time.name=`meal_time_${i}`;
    const del=row.querySelector('[data-v243-delete]');
    if(del)del.disabled=rows.length<=1;
  });
  const meals=document.getElementById('v24Meals');
  if(meals)meals.value=String(rows.length);
}

function addDeleteButton(row,editor){
  if(row.querySelector('[data-v243-delete]'))return;
  row.classList.add('v243-row');
  const b=document.createElement('button');
  b.type='button';
  b.className='ghost compact v243-delete';
  b.dataset.v243Delete='1';
  b.textContent='Löschen';
  b.setAttribute('aria-label','Essenszeit löschen');
  b.onclick=()=>{
    const rows=[...editor.querySelectorAll('.schedule-row')];
    if(rows.length<=1)return;
    row.remove();
    renumber(editor);
  };
  row.append(b);
}

function addMealTime(editor){
  const rows=[...editor.querySelectorAll('.schedule-row')];
  if(rows.length>=6)return;
  const pattern=document.getElementById('v24Pattern');
  if(pattern?.value==='omad'){
    pattern.value='custom';
    const safety=document.getElementById('v24Safety');
    if(safety)safety.innerHTML='';
  }
  const i=rows.length;
  const row=document.createElement('div');
  row.className='schedule-row v243-row';
  row.innerHTML=`<input name="meal_label_${i}" maxlength="30" value="Mahlzeit ${i+1}" aria-label="Name der Mahlzeit"><input type="time" name="meal_time_${i}" value="${nextTime(rows)}" aria-label="Essenszeit">`;
  const actions=editor.querySelector('[data-v243-actions]');
  editor.insertBefore(row,actions||null);
  addDeleteButton(row,editor);
  renumber(editor);
}

function enhanceSchedule(){
  const form=document.getElementById('v24ProfileForm');
  const editor=form?.querySelector('.meal-schedule-editor');
  if(!form||!editor||editor.dataset.v243==='1')return;
  editor.dataset.v243='1';
  const heading=editor.querySelector(':scope > label');
  if(heading)heading.textContent='Essenszeiten';
  [...editor.querySelectorAll('.schedule-row')].forEach(row=>addDeleteButton(row,editor));
  const actions=document.createElement('div');
  actions.className='v243-schedule-actions';
  actions.dataset.v243Actions='1';
  actions.innerHTML='<button type="button" class="secondary" data-v243-add>＋ Essenszeit hinzufügen</button><small>Mindestens 1, maximal 6 Essenszeiten. Namen und Uhrzeiten kannst du frei ändern.</small>';
  actions.querySelector('[data-v243-add]').onclick=()=>addMealTime(editor);
  editor.append(actions);
  renumber(editor);
}

const sheet=document.getElementById('sheetContent');
if(sheet)new MutationObserver(()=>queueMicrotask(enhanceSchedule)).observe(sheet,{childList:true,subtree:true});
document.addEventListener('change',e=>{
  if(e.target?.matches?.('#v24Meals,#v24Pattern'))queueMicrotask(enhanceSchedule);
});
enhanceSchedule();
