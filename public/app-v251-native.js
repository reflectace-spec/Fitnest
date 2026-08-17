const viewport=document.querySelector('meta[name="viewport"]');
if(viewport)viewport.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
document.documentElement.dataset.nativePwa='2.5.1';

document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
let lastTouchEnd=0;
document.addEventListener('touchend',e=>{
  const target=e.target;
  if(target?.closest?.('input,textarea,select,[contenteditable="true"]')){lastTouchEnd=0;return}
  const now=Date.now();
  if(now-lastTouchEnd<320)e.preventDefault();
  lastTouchEnd=now;
},{passive:false});

document.addEventListener('dragstart',e=>{
  if(!e.target?.closest?.('input,textarea,[contenteditable="true"]'))e.preventDefault();
});
