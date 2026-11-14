import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/4180-v2.json',import.meta.url),'utf8'));

function obfuscateExample(domain,xRequest){
  const raw=[domain,'X-Request',xRequest,'100','defaultResourceDomain_SW'];
  const offset=0x10;
  // Rotate right by 1 so the rotator loop shifts left by 1 back to raw.
  const arr=[raw[raw.length-1],...raw.slice(0,-1)];
  return `const _0xaa=_0xbb;(function(_0xf,_0xt){const _0xd=_0xbb,_0xa=_0xf();while(!![]){try{const _0xs=parseInt(_0xd(0x13))/0x1;if(_0xs===_0xt)break;else _0xa['push'](_0xa['shift']());}catch(_0xe){_0xa['push'](_0xa['shift']());}}}(_0xcc,0x64));function _0xcc(){const _0xs=${JSON.stringify(arr)};_0xcc=function(){return _0xs;};return _0xcc();}function _0xbb(_0xi,_0x2){const _0xr=_0xcc();return _0xbb=function(_0xk,_0x3){_0xk=_0xk-${offset};let _0xv=_0xr[_0xk];return _0xv;},_0xbb(_0xi,_0x2);}const defaultResourceDomain_SW=_0xaa(0x10);_0xh['set'](_0xaa(0x11),_0xaa(0x12));`;
}

test('fetchWithMirrorSupport follows old redirector -> SW shell -> backend with headers and preserves logical origin',async t=>{
  let backendHits=0,shellHits=0,oldHits=0,brokenFaviconHits=0;

  const backend=http.createServer((req,res)=>{
    backendHits++;
    if(req.headers['x-request']!=='Chromium'||!req.headers.referer){
      res.destroy();
      return;
    }
    const u=new URL(req.url,'http://local');
    if(u.pathname==='/'&&u.searchParams.get('s')==='lake'){
      res.writeHead(302,{Location:'/search/lake'});
      return res.end();
    }
    const key=u.pathname==='/search/lake'?'/':u.pathname;
    const html=(fixtures[key]||fixtures['/']).replaceAll('http://127.0.0.1:4180','https://www.4khd.com');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(html);
  });

  const brokenMirror=http.createServer((req,res)=>{
    brokenFaviconHits++;
    res.writeHead(503);
    res.end('down');
  });

  const swMirror=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://local');
    if(u.pathname==='/favicon.ico'){
      res.writeHead(200,{'Content-Type':'image/x-icon'});
      return res.end('ok');
    }
    if(u.pathname==='/scss.js'){
      res.writeHead(200,{'Content-Type':'application/javascript'});
      const backendHost=new URL(backendOrigin).host;
      return res.end(`const defaultResourceDomain_SW="${backendHost}";const h=new Headers();h['set']('X-Request','Chromium');`);
    }
    shellHits++;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!DOCTYPE html><html><head><script>const s=document.createElement('script');s.src=location.hostname.endsWith('.4khd.com')?'/worker.js':'/scss.js';</script></head><body><div class="loading"><div class="text">Loading...</div></div></body></html>`);
  });

  const oldMirror=http.createServer((req,res)=>{
    oldHits++;
    const u=new URL(req.url,'http://local');
    if(u.pathname!=='/redirect.php'){
      res.writeHead(302,{Location:'/redirect.php'});
      return res.end();
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!DOCTYPE html><html><head><script>const sites=['${brokenOrigin}','${swOrigin}'];location.href=sites[0];</script></head><body></body></html>`);
  });

  await Promise.all([
    new Promise(r=>backend.listen(0,'127.0.0.1',r)),
    new Promise(r=>brokenMirror.listen(0,'127.0.0.1',r)),
    new Promise(r=>swMirror.listen(0,'127.0.0.1',r)),
    new Promise(r=>oldMirror.listen(0,'127.0.0.1',r))
  ]);
  t.after(()=>Promise.all([
    new Promise(r=>backend.close(r)),
    new Promise(r=>brokenMirror.close(r)),
    new Promise(r=>swMirror.close(r)),
    new Promise(r=>oldMirror.close(r))
  ]));

  const backendOrigin=`http://127.0.0.1:${backend.address().port}`;
  const brokenOrigin=`http://127.0.0.1:${brokenMirror.address().port}`;
  const swOrigin=`http://127.0.0.1:${swMirror.address().port}`;
  const oldOrigin=`http://127.0.0.1:${oldMirror.address().port}`;
  process.env.LUMA_ALLOWED_ORIGINS=[backendOrigin,brokenOrigin,swOrigin,oldOrigin].join(',');

  const {fetchWithMirrorSupport,clearMirrorCache,knownMirrorHosts}=await import('../lib/mirror.mjs');
  const {siteCatalogue,siteAlbum}=await import('../lib/site-engine.mjs');
  clearMirrorCache();

  const source={id:'shiguang',name:'Test',adapter:'wordpress-gallery',mode:'static',streaming:true,url:oldOrigin+'/'};
  const cat=await siteCatalogue(source);
  assert.equal(cat.albums.length,12);
  assert.equal(new URL(cat.albums[0].url).origin,oldOrigin);
  assert.equal(brokenFaviconHits,1);
  assert.equal(oldHits,2);
  assert.equal(shellHits,1);
  assert.equal(backendHits,1);
  assert.ok(knownMirrorHosts.has('127.0.0.1'));

  const album=await siteAlbum(source,cat.albums[0].id);
  assert.equal(album.photos.length,2);
  assert.equal(oldHits,2);
  assert.equal(shellHits,1);
  assert.equal(backendHits,2);

  const search=await siteCatalogue(source,{query:'lake'});
  assert.equal(search.albums.length,12);
  assert.equal(new URL(search.albums[0].url).origin,oldOrigin);
  assert.equal(oldHits,2);
  assert.equal(shellHits,1);
  assert.equal(backendHits,4);

  clearMirrorCache();
  const doc=await fetchWithMirrorSupport(swOrigin+'/content/24/album-001.html');
  assert.equal(doc.url,swOrigin+'/content/24/album-001.html');
  assert.match(doc.html,/wp-block-post-title/);

  const {decodeObfuscatedScript,extractServiceWorkerConfig}=await import('../lib/mirror.mjs');
  const script=obfuscateExample('backend.example.test','Chromium');
  const decoded=decodeObfuscatedScript(script);
  assert.match(decoded,/defaultResourceDomain_SW="backend\.example\.test"/);
  const cfg=extractServiceWorkerConfig(script,'https://shell.example.test/');
  assert.deepEqual(cfg,{
    resourceOrigin:'https://backend.example.test',
    headers:{'X-Request':'Chromium'},
    referer:'https://shell.example.test/'
  });
});
