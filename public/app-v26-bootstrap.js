const RESET_MARKER='fitnest.cleanStart.v26';

if(localStorage.getItem(RESET_MARKER)!=='done'){
  const keys=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith('fitnest.'))keys.push(key);
  }
  keys.forEach(key=>localStorage.removeItem(key));
  for(let i=sessionStorage.length-1;i>=0;i--){
    const key=sessionStorage.key(i);
    if(key?.startsWith('fitnest.'))sessionStorage.removeItem(key);
  }
  localStorage.setItem(RESET_MARKER,'done');
  sessionStorage.setItem('fitnest.cleanStart.justReset','1');
}
