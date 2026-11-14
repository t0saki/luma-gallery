import {getRemote} from './network.mjs';

export const knownMirrorHosts=new Set(['4khd.com','www.4khd.com','wrtm.ssuu.uk']);

const routeCache=new Map();
const ROUTE_TTL_MS=10*60*1000;

export function clearMirrorCache(){
  routeCache.clear();
}

function parseJSStringArray(src,startBracket){
  const items=[];
  let i=startBracket+1;
  while(i<src.length){
    while(i<src.length&&/[\s,]/.test(src[i]))i++;
    if(src[i]===']')return items;
    const quote=src[i];
    if(quote!=='"'&&quote!=="'")return null;
    i++;
    let out='';
    while(i<src.length&&src[i]!==quote){
      if(src[i]==='\\'){
        i++;
        const ch=src[i++];
        if(ch==='x'){out+=String.fromCharCode(parseInt(src.slice(i,i+2),16));i+=2;}
        else if(ch==='u'){out+=String.fromCharCode(parseInt(src.slice(i,i+4),16));i+=4;}
        else if(ch==='n')out+='\n';
        else if(ch==='r')out+='\r';
        else if(ch==='t')out+='\t';
        else out+=ch;
      }else{
        out+=src[i++];
      }
    }
    if(src[i]!==quote)return null;
    i++;
    items.push(out);
  }
  return null;
}

function evalRotationExpr(expr,lookup){
  const tokens=[];
  let i=0;
  while(i<expr.length){
    if(/\s/.test(expr[i])){i++;continue;}
    if('+-*/()'.includes(expr[i])){tokens.push(expr[i++]);continue;}
    const pi=expr.slice(i).match(/^parseInt\(\s*[_$a-zA-Z][_$a-zA-Z0-9]*\(\s*(0x[0-9a-f]+|\d+)\s*\)\s*\)/i);
    if(pi){tokens.push(parseInt(lookup(Number(pi[1])),10));i+=pi[0].length;continue;}
    const num=expr.slice(i).match(/^(0x[0-9a-f]+|\d+)/i);
    if(num){tokens.push(Number(num[1]));i+=num[0].length;continue;}
    return NaN;
  }
  let pos=0;
  const peek=()=>tokens[pos];
  const next=()=>tokens[pos++];
  function parseSum(){
    let left=parseMul();
    while(peek()==='+'||peek()==='-'){
      const op=next(),right=parseMul();
      left=op==='+'?left+right:left-right;
    }
    return left;
  }
  function parseMul(){
    let left=parseUnary();
    while(peek()==='*'||peek()==='/'){
      const op=next(),right=parseUnary();
      left=op==='*'?left*right:left/right;
    }
    return left;
  }
  function parseUnary(){
    if(peek()==='-'){next();return -parseUnary();}
    if(peek()==='+'){next();return +parseUnary();}
    if(peek()==='('){next();const v=parseSum();if(peek()===')')next();return v;}
    return typeof peek()==='number'?next():NaN;
  }
  return parseSum();
}

export function decodeObfuscatedScript(code){
  const arrFnMatch=code.match(/function\s+([_$a-zA-Z][_$a-zA-Z0-9]*)\(\)\{\s*(?:const|var|let)\s+[_$a-zA-Z][_$a-zA-Z0-9]*\s*=\s*\[/i);
  if(!arrFnMatch)return code;
  const arrFnName=arrFnMatch[1];
  const arr=parseJSStringArray(code,code.indexOf('[',arrFnMatch.index));
  if(!arr||!arr.length)return code;
  const decMatch=code.match(/function\s+([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\([^,)]+,[^)]+\)\{[\s\S]{0,220}?([_$a-zA-Z][_$a-zA-Z0-9]*)\s*=\s*\2\s*-\s*(0x[0-9a-f]+|\d+)/i);
  if(!decMatch)return code;
  const offset=Number(decMatch[3]);
  const rotMatch=code.match(new RegExp('while\\(!!\\[\\]\\)\\{try\\{(?:const|let|var)\\s+[_$a-zA-Z][_$a-zA-Z0-9]*=([^;]+);if\\([_$a-zA-Z][_$a-zA-Z0-9]*===[_$a-zA-Z][_$a-zA-Z0-9]*\\)break;[\\s\\S]*?\\}\\}\\}\\('+arrFnName.replace(/[$]/g,'\\$&')+',(0x[0-9a-f]+|\\d+)\\)'));
  if(rotMatch){
    const expr=rotMatch[1],target=Number(rotMatch[2]);
    const lookup=idx=>arr[idx-offset];
    for(let step=0;step<=arr.length;step++){
      if(evalRotationExpr(expr,lookup)===target)break;
      arr.push(arr.shift());
    }
  }
  return code.replace(/[_$a-zA-Z][_$a-zA-Z0-9]*\((0x[0-9a-f]+|\d+)\)/gi,(full,idx)=>{
    const val=arr[Number(idx)-offset];
    return val===undefined?full:JSON.stringify(val);
  });
}

export function extractServiceWorkerConfig(scriptCode,shellOrigin){
  const decoded=decodeObfuscatedScript(scriptCode);
  const domainMatch=decoded.match(/(?:defaultResourceDomain_SW|fastestResourceDomain_SW)\s*=\s*["']([a-z0-9.-]+(?::\d+)?)["']/i)||decoded.match(/(?:\[['"]hostname['"]\]|\.hostname)\s*=\s*["']([a-z0-9.-]+(?::\d+)?)["']/i);
  const xReqMatch=decoded.match(/(?:\[['"]set['"]\]|\.set)\(\s*['"]X-Request['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
  if(!domainMatch&&!xReqMatch)return null;
  const base=new URL(shellOrigin);
  let resourceOrigin=base.origin;
  if(domainMatch&&domainMatch[1].includes('.')){
    try{resourceOrigin=new URL(`${base.protocol}//${domainMatch[1]}`).origin;}catch{return null;}
  }
  return {
    resourceOrigin,
    headers:xReqMatch?{'X-Request':xReqMatch[1]}:{},
    referer:base.origin+'/'
  };
}

export function detectServiceWorkerShell(html){
  if(!html||html.length>32768||/<article\b|wp-block-post|item-list/i.test(html))return null;
  const ternary=html.match(/location\.hostname\.endsWith\(\s*['"]([^'"]+)['"]\s*\)\s*\?\s*['"]([^'"]+\.js[^'"]*)['"]\s*:\s*['"]([^'"]+\.js[^'"]*)['"]/i);
  if(ternary){
    return origin=>{
      const host=new URL(origin).hostname;
      return host.endsWith(ternary[1])||host===ternary[1].replace(/^\./,'')?ternary[2]:ternary[3];
    };
  }
  const register=html.match(/navigator\.serviceWorker\.register\(\s*['"]([^'"]+\.js[^'"]*)['"]/i);
  if(register)return ()=>register[1];
  if(/class=["']loading["']/i.test(html)&&/Loading\.\.\./i.test(html)){
    const script=html.match(/<script[^>]+src=["']([^"']*(?:scss|worker)[^"']*\.js[^"']*)["']/i);
    if(script)return ()=>script[1];
  }
  return null;
}

export function detectJSRedirect(html,currentURL){
  if(!html||html.length>32768||/<article\b|wp-block-post|item-list/i.test(html))return null;
  const meta=html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'\s>]+)/i);
  if(meta){
    try{return {type:'single',url:new URL(meta[1],currentURL).href};}catch{}
  }
  const sitesMatch=html.match(/(?:const|let|var)\s+sites\s*=\s*\[([^\]]+)\]/i);
  if(sitesMatch&&/location\.(?:href|replace|assign)/i.test(html)){
    const urls=[...sitesMatch[1].matchAll(/['"](https?:\/\/[^'"]+)['"]/g)].map(m=>m[1]);
    if(urls.length)return {type:'candidates',urls};
  }
  const locMatch=html.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]|location\.(?:replace|assign)\(\s*['"](https?:\/\/[^'"]+)['"]\s*\)/i);
  if(locMatch){
    try{return {type:'single',url:new URL(locMatch[1]||locMatch[2],currentURL).href};}catch{}
  }
  return null;
}

async function probeCandidateOrigin(candidates,{signal}){
  let lastError;
  for(const raw of candidates){
    let origin;
    try{origin=new URL(raw).origin;}catch{continue;}
    try{
      await getRemote(origin+'/favicon.ico',{signal,maxBytes:256*1024,retry:0});
      return origin;
    }catch(err){
      if(err?.statusCode===404)return origin;
      lastError=err;
    }
  }
  throw lastError||Error('未找到可用的镜像地址');
}

function isHTMLResponse(result,bodyText){
  const type=(result.type||'').toLowerCase();
  if(type&&!type.includes('html'))return false;
  return /^\s*</.test(bodyText);
}

function mapLogicalURL(fetchedURL,requestedOrigin){
  const parsed=new URL(fetchedURL);
  return new URL(parsed.pathname+parsed.search,requestedOrigin).href;
}

export async function fetchWithMirrorSupport(targetURL,{signal}={}){
  const requested=new URL(targetURL);
  const requestedOrigin=requested.origin;
  const desiredPath=requested.pathname+requested.search;

  const cached=routeCache.get(requestedOrigin);
  if(cached&&cached.expiresAt>Date.now()){
    try{
      const backendURL=new URL(desiredPath,cached.backendOrigin).href;
      const result=await getRemote(backendURL,{signal,headers:cached.headers,referer:cached.referer});
      const html=result.body.toString('utf8');
      if(!isHTMLResponse(result,html)||(!detectServiceWorkerShell(html)&&!detectJSRedirect(html,result.url))){
        return {html,url:mapLogicalURL(result.url,requestedOrigin)};
      }
      routeCache.delete(requestedOrigin);
    }catch{
      routeCache.delete(requestedOrigin);
    }
  }

  let currentURL=targetURL;
  let currentHeaders;
  let currentReferer;
  let activeRoute=null;

  for(let hop=0;hop<5;hop++){
    const result=await getRemote(currentURL,{signal,headers:currentHeaders,referer:currentReferer});
    const html=result.body.toString('utf8');
    if(!isHTMLResponse(result,html)){
      return {html,url:activeRoute?mapLogicalURL(result.url,requestedOrigin):result.url};
    }

    const swShell=detectServiceWorkerShell(html);
    if(swShell){
      const shellOrigin=new URL(result.url).origin;
      knownMirrorHosts.add(new URL(shellOrigin).hostname);
      const swPath=swShell(shellOrigin);
      const swRes=await getRemote(new URL(swPath,shellOrigin).href,{signal});
      const cfg=extractServiceWorkerConfig(swRes.body.toString('utf8'),shellOrigin);
      if(!cfg)return {html,url:activeRoute?mapLogicalURL(result.url,requestedOrigin):result.url};
      knownMirrorHosts.add(new URL(cfg.resourceOrigin).hostname);
      activeRoute={backendOrigin:cfg.resourceOrigin,headers:cfg.headers,referer:cfg.referer};
      currentURL=new URL(desiredPath,cfg.resourceOrigin).href;
      currentHeaders=cfg.headers;
      currentReferer=cfg.referer;
      continue;
    }

    const redirect=detectJSRedirect(html,result.url);
    if(redirect?.type==='candidates'){
      const chosenOrigin=await probeCandidateOrigin(redirect.urls,{signal});
      knownMirrorHosts.add(new URL(chosenOrigin).hostname);
      activeRoute={backendOrigin:chosenOrigin,headers:undefined,referer:undefined};
      currentURL=new URL(desiredPath,chosenOrigin).href;
      currentHeaders=undefined;
      currentReferer=undefined;
      continue;
    }
    if(redirect?.type==='single'){
      const next=new URL(redirect.url);
      if(next.origin!==new URL(result.url).origin){
        knownMirrorHosts.add(next.hostname);
        activeRoute={backendOrigin:next.origin,headers:undefined,referer:undefined};
        currentURL=new URL(desiredPath,next.origin).href;
      }else{
        currentURL=next.href;
      }
      currentHeaders=undefined;
      currentReferer=undefined;
      continue;
    }

    if(activeRoute){
      routeCache.set(requestedOrigin,{...activeRoute,expiresAt:Date.now()+ROUTE_TTL_MS});
      return {html,url:mapLogicalURL(result.url,requestedOrigin)};
    }
    return {html,url:result.url};
  }
  throw Error('镜像或跳转解析次数超限');
}
