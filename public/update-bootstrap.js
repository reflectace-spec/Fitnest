(function(){
  const BUILD='3.8.6';
  let checking=false;
  let labelRefreshQueued=false;

  window.__FITNEST_BUILD__=BUILD;

  function canonicalizeUrl(){
    const url=new URL(location.href);
    if(!url.searchParams.has('build'))return;
    url.searchParams.delete('build');
    history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
  }

  function reloadFor(build){
    const key=`fitnest.update.reload.${build}`;
    if(sessionStorage.getItem(key)==='yes')return;
    sessionStorage.setItem(key,'yes');
    canonicalizeUrl();
    location.reload();
  }

  function normalizeBuildLabels(){
    labelRefreshQueued=false;
    const selector='.eyebrow,.label,.v26-brand span,.v381-tutorial-head strong,[data-current-build]';
    document.querySelectorAll(selector).forEach(node=>{
      if(node.closest('.v383-changelog-list,.v383-list'))return;
      const next=node.textContent.replace(/Build\s+\d+(?:\.\d+)*/gi,`Build ${BUILD}`);
      if(next!==node.textContent)node.textContent=next;
    });
  }

  function queueBuildLabelRefresh(){
    if(labelRefreshQueued)return;
    labelRefreshQueued=true;
    queueMicrotask(normalizeBuildLabels);
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

  canonicalizeUrl();
  new MutationObserver(queueBuildLabelRefresh).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',queueBuildLabelRefresh);
  window.addEventListener('pageshow',()=>{void updateWorker();void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)})});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){void updateWorker();void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)})}
  });
  void updateWorker();
  void checkVersion().then(remoteBuild=>{if(remoteBuild&&remoteBuild!==BUILD)reloadFor(remoteBuild)});
})();
