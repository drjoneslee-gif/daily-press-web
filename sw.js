const CACHE='daily-press-68c63f42f11a-'+new URL(self.registration.scope).pathname;
const ASSETS=['./','./index.html','./style.css','./app.js','./ai.js','./storage.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// Updates wait for an explicit user click; no reload while a quiz is being answered.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const suffix='-'+new URL(self.registration.scope).pathname;
 for(const key of await caches.keys())if(key.startsWith('daily-press-')&&key.endsWith(suffix)&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const relative=url.pathname.slice(scope.pathname.length);
 if(!['','index.html','style.css','app.js','ai.js','storage.js','icon.svg','manifest.webmanifest'].includes(relative))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request,{ignoreSearch:true}))||fetch(event.request)));
});
