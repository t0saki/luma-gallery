import {createHash} from 'node:crypto';

export function sendImage(req,res,result,{protectedAccess=false,filename=''}={}){
  const etag='"'+createHash('sha256').update(result.body).digest('hex')+'"';
  const cache=protectedAccess?'private, no-store':'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
  const headers={'Content-Type':result.type,'Cache-Control':cache,'CDN-Cache-Control':protectedAccess?'no-store':'public, max-age=86400, stale-while-revalidate=86400','ETag':etag,'X-Content-Type-Options':'nosniff',...(filename?{'Content-Disposition':filename}:{})};
  const matches=String(req.headers['if-none-match']||'').split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===etag);
  if(matches){res.writeHead(304,headers);return res.end()}
  res.writeHead(200,{...headers,'Content-Length':result.body.length});
  res.end(req.method==='HEAD'?undefined:result.body);
}
