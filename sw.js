/* 生产计件工资管理系统 Service Worker
   策略：
   - 预缓存应用外壳（HTML/清单/图标），可离线打开
   - CDN 库（jsDelivr/cdnjs）与同源静态资源：stale-while-revalidate（离线可用、在线自动更新）
   - Supabase 数据 / 登录 / 实时请求：一律走网络、绝不缓存，保证数据实时与安全 */
const STATIC='pms-static-v1';
const RUNTIME='pms-runtime-v1';
const PRE=[
  './','./index.html','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-180.png','./icons/icon.svg'
];

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(STATIC).then(c=>c.addAll(PRE)).catch(()=>{}));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==STATIC && k!==RUNTIME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

const isSupa = u => u.hostname==='supabase.co' || u.hostname.endsWith('.supabase.co');
const isCdn  = u => u.hostname==='cdn.jsdelivr.net' || u.hostname.endsWith('.cdn.jsdelivr.net')
                  || u.hostname==='cdnjs.cloudflare.com' || u.hostname.endsWith('.cdnjs.cloudflare.com');

self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const u=new URL(req.url);

  // 1) Supabase 数据/认证/实时：不拦截，直接网络
  if(isSupa(u)) return;

  // 2) 页面导航：网络优先（保证更新及时），失败/离线回退缓存外壳
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req)
        .then(r=>{ const copy=r.clone(); caches.open(STATIC).then(c=>c.put('./index.html',copy)); return r; })
        .catch(()=>caches.match('./index.html').then(r=>r||caches.match('./')))
    );
    return;
  }

  // 3) CDN 库与同源静态：stale-while-revalidate
  if(isCdn(u) || u.origin===self.location.origin){
    e.respondWith(
      caches.open(RUNTIME).then(async cache=>{
        const hit=await cache.match(req);
        const network=fetch(req).then(r=>{ if(r && (r.status===200||r.status===0)) cache.put(req,r.clone()); return r; }).catch(()=>hit);
        return hit || network;
      })
    );
  }
});
