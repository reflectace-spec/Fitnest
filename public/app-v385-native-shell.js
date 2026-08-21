const BUILD='3.8.6';
const OVERLAY_SELECTOR='#v26Onboarding,.v381-tutorial,dialog[open],.v26-summary-backdrop,.v28-dialog-backdrop,.v33-summary-backdrop';
const SCROLLER_SELECTOR='.v26-onboarding,.sheet-inner,.v381-tutorial-body,.v26-summary-card';
const HORIZONTAL_SELECTOR='.week-strip,.v25-category-row,.nutrition-profile-tabs';
let startX=0,startY=0,resettingScroll=false;

export function shouldPreventTouch({touchCount=0,deltaX=0,deltaY=0,horizontalAllowed=false,overlayActive=false,insideScroller=false}={}){
  if(Number(touchCount)>1)return true;
  if(Math.abs(deltaX)>Math.abs(deltaY)&&!horizontalAllowed)return true;
  return overlayActive&&!insideScroller&&Math.abs(deltaY)>2;
}

function overlayActive(){return Boolean(document.querySelector(OVERLAY_SELECTOR))}

function syncLock(){
  const locked=overlayActive();
  document.documentElement.classList.toggle('v385-overlay-lock',locked);
  document.body.classList.toggle('v385-overlay-lock',locked);
}

function preventGesture(event){event.preventDefault()}

document.addEventListener('gesturestart',preventGesture,{passive:false});
document.addEventListener('gesturechange',preventGesture,{passive:false});
document.addEventListener('gestureend',preventGesture,{passive:false});
document.addEventListener('touchstart',event=>{
  const touch=event.touches?.[0];
  if(!touch)return;
  startX=touch.clientX;
  startY=touch.clientY;
},{passive:true});
document.addEventListener('touchmove',event=>{
  const touch=event.touches?.[0];
  const target=event.target instanceof Element?event.target:null;
  const prevent=shouldPreventTouch({
    touchCount:event.touches?.length||0,
    deltaX:touch?touch.clientX-startX:0,
    deltaY:touch?touch.clientY-startY:0,
    horizontalAllowed:Boolean(target?.closest(HORIZONTAL_SELECTOR)),
    overlayActive:overlayActive(),
    insideScroller:Boolean(target?.closest(SCROLLER_SELECTOR))
  });
  if(prevent)event.preventDefault();
},{passive:false});

window.addEventListener('scroll',()=>{
  if(resettingScroll||window.scrollX===0)return;
  resettingScroll=true;
  window.scrollTo(0,window.scrollY);
  requestAnimationFrame(()=>{resettingScroll=false});
},{passive:true});

new MutationObserver(syncLock).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','class']});
syncLock();
window.__FITNEST_NATIVE_SHELL__={build:BUILD,syncLock};
