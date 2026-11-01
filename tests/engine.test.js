import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,closedCandles,netRR,topContracts} from '../web/engine.js';
const now=1800000000000;
function rows(period,start,end){const boundary=Math.floor(now/period)*period;return Array.from({length:100},(_,i)=>{const c=start+(end-start)*i/99;return [boundary-(100-i)*period,c-.1,c+.4,c-.4,c,10];});}
function fixture(){const hour=rows(3600000,60,100),structure=rows(900000,90,100),entry=rows(300000,95,100);structure.forEach(r=>r[2]=110);entry[98][3]=96;entry[98][2]=99.99;entry[99][2]=100.5;return {symbol:'TESTUSDT',hour,structure,entry,quote:{askPr:'100',bidPr:'99.99',ts:now},now};}
test('excludes live candle and sorts API descending rows',()=>{const a=rows(300000,90,100);a.push([now,100,101,99,100,10]);const got=closedCandles(a.reverse(),300000,now);assert.equal(got.length,100);assert.equal(got.at(-1).c,100);});
test('rejects stale, incomplete, malformed and gapped data',()=>{assert.throws(()=>closedCandles([],300000,now));const a=rows(300000,90,100);assert.throws(()=>closedCandles(a,300000,now+900000));a.splice(60,1);assert.throws(()=>closedCandles(a,300000,now));const b=rows(300000,90,100);b[0][2]=1;assert.throws(()=>closedCandles(b,300000,now));});
test('net RR charges entry and exit for long and short',()=>{assert.equal(netRR(100,95,115,1,0,0),3);assert.equal(netRR(100,105,85,-1,0,0),3);assert.ok(netRR(100,95,110,1,.0006,.0005)<2);assert.ok(netRR(100,105,90,-1,.0006,.0005)<2);});
test('top40 uses quote turnover and excludes inactive / delivery contracts',()=>{const contracts=Array.from({length:45},(_,i)=>({symbol:`C${i}USDT`,symbolStatus:'normal',symbolType:'perpetual',quoteCoin:'USDT'}));contracts[44].symbolStatus='maintain';const tickers=contracts.map((c,i)=>({symbol:c.symbol,usdtVolume:100+i,lastPr:1}));const top=topContracts(tickers,contracts);assert.equal(top.length,40);assert.equal(top[0].symbol,'C43USDT');assert.equal(top.at(-1).symbol,'C4USDT');});
test('confirmed pullback yields long with actual structure target',()=>{const r=analyze(fixture());assert.equal(r.status,'信号');assert.equal(r.direction,'做多');assert.equal(r.kind,'顺势回踩企稳');assert.equal(r.target,110);assert.ok(r.rr>=2);assert.ok(r.stop<r.price);});
test('mirror setup yields short',()=>{const f=fixture();for(const k of ['hour','structure','entry'])f[k]=f[k].map(([t,o,h,l,c,v])=>[t,200-o,200-l,200-h,200-c,v]);f.quote={askPr:100.01,bidPr:100,ts:now};const r=analyze(f);assert.equal(r.status,'信号');assert.equal(r.direction,'做空');assert.equal(r.target,90);assert.ok(r.stop>r.price);});
test('wait on low net RR, missing target, stale quotes, chase or ambiguous trend',()=>{
 const low=fixture();low.structure.forEach(r=>r[2]=104);assert.equal(analyze(low).status,'等待');
 const target=fixture();target.structure.forEach(r=>r[2]=100.4);assert.equal(analyze(target).status,'等待');
 const stale=fixture();stale.quote.ts=now-70000;assert.equal(analyze(stale).status,'等待');
 const chase=fixture();chase.quote.askPr=103;assert.equal(analyze(chase).status,'等待');
 const flat=fixture();flat.hour=rows(3600000,100,100);assert.equal(analyze(flat).status,'等待');
});
test('fee validation cannot generate a signal',()=>{assert.equal(analyze({...fixture(),fee:-1}).status,'等待');});
function breakoutFixture(reversal=false){const f=fixture();f.entry=rows(300000,107,109.5);Object.assign(f.entry[99],{1:109.8,2:110.4,3:109.5,4:110,5:30});f.structure.forEach((r,i)=>{r[2]=i<79?120:105;if(reversal&&i>=79)r[3]=85;});f.structure[99]=[f.structure[99][0],109,110.5,108,110,10];f.quote={askPr:110,bidPr:109.99,ts:now};return f;}
test('volume breakout produces signal using older overhead structure',()=>{const r=analyze(breakoutFixture());assert.equal(r.status,'信号');assert.equal(r.kind,'放量突破');assert.equal(r.target,120);assert.ok(r.rr>=2);});
test('new low followed by structure reclaim identifies confirmed reversal',()=>{const r=analyze(breakoutFixture(true));assert.equal(r.status,'信号');assert.equal(r.kind,'趋势反转');assert.ok(r.rr>=2);});
