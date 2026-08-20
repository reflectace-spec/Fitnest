(function(){
  const BUILD='3.8.5';
  const RELOAD_KEY=`fitnest.update.reload.${BUILD}`;
  let checking=false;

  window.__FITNEST_BUILD__=BUILD;

  function targetUrl(build){
    const url=new URL(location.href);
    url.searchParams.set('build',build);
    return url.href;
  }

  function reloadFor(build){
    const target=targetUrl(build);
    if(location.href===target&&sessionStorage.getItem(RELOAD_KEY)==='yes')return;
    sessionStorage.setItem(RELOAD_KEY,'yes');
    location.replace(target);
  }

  async function checkVersion(){
    if(checking||!navigator.onLine)return;
    checking=true;
    try{
      const response=await fetch(`./version.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)return null;
      const remote=await response.json();
      return remote?.build||null;
    }catch(error){
      console.warn('Fitnest update check failed',error);
    }finally{
      checking=false;
    }
  }

  async function updateWorker(){
    if(!('serviceWorker'in navigator))return;
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      await registration.update();
    }catch(error){
      console.warn('Fitnest service worker update failed',error);
    }
  }

  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      void checkVersion().then(remoteBuild=>{
        if(document.visibilityState==='visible')reloadFor(remoteBuild||BUILD);
      });
    });
  }

  window.addEventListener('pageshow',()=>{void updateWorker();void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)})});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){void updateWorker();void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)})}
  });
  void updateWorker();
  void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)});
})();
