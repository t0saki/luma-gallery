import {setTimeout as sleep} from 'node:timers/promises';

const transientCodes=new Set(['EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ESOCKETTIMEDOUT','EPIPE','ENETUNREACH','EHOSTUNREACH','ERR_STREAM_PREMATURE_CLOSE']);
export function isRetryable(error){return [408,425,429,500,502,503,504].includes(error.statusCode)||transientCodes.has(error.code);}
export function retryAfter(value,now=Date.now()){if(value===undefined)return 0;const text=String(value).trim();if(/^\d+(?:\.\d+)?$/.test(text))return Number(text)*1000;const date=Date.parse(text);return Number.isFinite(date)?Math.max(0,date-now):0;}

// One budget covers the complete GET (including redirects); callers must not add retry loops.
export async function withRetry(operation,{signal,retries=3,baseDelay=500,maxDelay=30000,random=Math.random,wait=sleep}={}){
  for(let attempt=0;;attempt++){
    signal?.throwIfAborted();
    try{return await operation()}
    catch(error){
      signal?.throwIfAborted();
      const backoff=Math.min(maxDelay,baseDelay*2**attempt)*(0.75+random()*0.5);
      const delay=Math.max(Math.min(maxDelay,Math.round(backoff)),error.retryAfterMs||0);
      // Do not retry sooner than the upstream asks, or wait without a bound.
      if(attempt>=retries||!isRetryable(error)||delay>maxDelay){error.retryAttempts=attempt+1;throw error}
      await wait(delay,undefined,{signal});
    }
  }
}
