import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../web/api.js';
test('official V2 request has no key and parses success',async()=>{const api=createAPI(async(url,options)=>{assert.match(url,/^https:\/\/api.bitget.com\/api\/v2\//);assert.equal(options.headers,undefined);return {ok:true,json:async()=>({code:'00000',data:[1]})};});assert.deepEqual(await api('/api/v2/public/time'),[1]);});
test('API errors retry finitely and fail without returning sample data',async()=>{let calls=0;const api=createAPI(async()=>{calls++;return {ok:true,json:async()=>({code:'429',msg:'rate limit'})};});await assert.rejects(api('/api/v2/public/time'),/429/);assert.equal(calls,3);});
test('HTTP and malformed response failures are reported',async()=>{const api=createAPI(async()=>({ok:false,status:503}));await assert.rejects(api('/api/v2/public/time'),/503/);});
