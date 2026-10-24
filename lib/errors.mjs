import {randomUUID} from 'node:crypto';
export function contextError(error,context){const value=error instanceof Error?error:new Error(String(error));value.context={...context,...value.context};return value;}
export function errorPayload(error,request={}){const value=error instanceof Error?error:new Error(String(error));return {error:value.message,diagnostics:{id:randomUUID(),name:value.name,code:value.code||'REQUEST_FAILED',request,context:value.context||{},stack:value.stack||String(value),cause:value.cause?String(value.cause.stack||value.cause):undefined}};}
