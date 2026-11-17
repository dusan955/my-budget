/* Versioned, scope-specific cache. Cache only static application assets, never user records. */
const PREFIX='moj-budzet-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'0.3.0';
const ASSETS=['./','./index.html','./styles.css','./app.js','./core.js','./storage.js','./crypto.js','./passkeys.js','./security-ui.js','./backup.js','./ui.js','./view-model.js','./manifest.webmanifest','./icons/icon.svg','./icons/apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png'];
const URLS=ASSETS.map(p=>new URL(p,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(new URL('./index.html',self.registration.scope).href))||fetch(request)));return;}
 if(URLS.includes(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
