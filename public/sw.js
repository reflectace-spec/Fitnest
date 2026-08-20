// Build 3.8.5: automatic activation, one-time client refresh and native touch lock.
const BUILD='3.8.5';
const CACHE='fitnest-shell-v3-8-5';
const VERSIONED_ASSETS=[
  './styles.css','./build2.css','./build21.css','./build22.css','./build23.css','./build24.css','./build241.css','./build243.css','./build244.css','./build25.css','./build251.css','./build26.css','./build261.css','./build27.css','./build28.css','./build29.css','./build30.css','./build31.css','./build32.css','./build33.css','./build34.css','./build35.css','./build36.css','./build37.css','./build38.css','./build381.css','./build382.css','./build383.css','./build385.css',
  './update-bootstrap.js','./app.js','./app-v26-bootstrap.js','./app-v2.js','./app-v24-guard.js','./app-v21-addon.js','./app-v21-navfix.js','./app-v22-addon.js','./app-v23-addon.js','./app-v24-addon.js','./app-v241-addon.js','./app-v242-addon.js','./app-v243-addon.js','./app-v244-addon.js','./app-v244-safeapply.js','./app-v251-wiki.js','./app-v251-native.js','./app-v26-onboarding.js','./app-v261-onboarding-hotfix.js','./app-v26-surfaces.js','./app-v27-auth.js','./app-v27-sync.js','./app-v27-guard.js','./app-v28-daily.js','./app-v29-adaptive.js','./app-v30-nutrition.js','./app-v31-shopping.js','./app-v32-recipes.js','./app-v33-workout.js','./app-v34-progress.js','./app-v35-pwa.js','./app-v36-health.js','./app-v37-coach.js','./app-v38-work-schedule.js','./app-v381-tutorial.js','./app-v382-progress-hotfix.js','./app-v383-changelog.js','./app-v385-native-shell.js','./manifest.webmanifest'
].map(asset=>`${asset}?v=${BUILD}`);
const APP_SHELL=[
  './','./index.html','./version.json','./config.js','./app-supabase.js','./exercise-images.js',
  './assets/icon.svg','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png','./assets/exercise-sprite.webp',
  ...VERSIONED_ASSETS
];

async function refreshClients(){
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(windows.map(async client=>{
    try{
      const url=new URL(client.url);
      url.searchParams.set('build',BUILD);
      await client.navigate(url.href);
    }catch(error){
      console.warn('Fitnest client refresh failed',error);
    }
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
      .then(refreshClients)
  );
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.hostname.includes('supabase.co'))return;
  if(url.pathname.endsWith('/version.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
      }
      return response;
    }catch(error){
      const cached=await caches.match(event.request);
      if(cached)return cached;
      if(event.request.mode==='navigate')return caches.match('./index.html');
      throw error;
    }
  })());
});

self.addEventListener('push',event=>{
  let data={title:'Fitnest',body:'Dein nächster Schritt wartet.'};
  try{data={...data,...event.data.json()}}catch{}
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title,{body:data.body,icon:'./assets/icon.svg',badge:'./assets/icon.svg',tag:data.tag||'fitnest-reminder',renotify:true,data:{url:data.url||'./'}}),
    self.registration.setAppBadge?.(Number(data.badgeCount||1))||Promise.resolve()
  ]));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(Promise.all([
    self.registration.clearAppBadge?.()||Promise.resolve(),
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if(client.url.startsWith(self.location.origin)&&'focus'in client){client.navigate(target);return client.focus()}
      }
      return self.clients.openWindow(target);
    })
  ]));
});
