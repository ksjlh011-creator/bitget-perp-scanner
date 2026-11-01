import {structuralStop,positionSize} from './risk.js';
export const PERIODS={'4H':14400000,'1H':3600000,'15m':900000,'5m':300000,'1m':60000};
export const LABELS={data:'已收盘数据完整且新鲜',cost:'费用参数有效',trend4h:'4小时趋势明确',trend1h:'1小时趋势明确',alignment:'4H/1H方向一致',structure15:'15分钟顺势回踩收复确认',volume15:'15分钟成交量≥前20根均量1.5倍',confirmation5:'5分钟在15分钟确认后同向突破',volume5:'5分钟成交量≥前20根均量1.5倍',trigger1:'1分钟在5分钟确认后触发',quote:'最新双边报价有效',zone:'报价位于入场区间且未追价',stop:'结构止损距离0.8–3 ATR',targets:'两档未突破结构目标且适合短线',rr:'最差入场价下第一止盈净RR≥2',position:'计划亏损≤账户权益1%且仓位有效'};
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function ema(a,n){const out=[];for(const v of a)out.push(out.length?v*2/(n+1)+out.at(-1)*(1-2/(n+1)):v);return out;}
export function closedCandles(rows,period,now){
 if(!Array.isArray(rows)||!Number.isFinite(now))throw Error('K线或时间无效');
 const a=rows.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).filter(c=>c.t+period<=now).sort((a,b)=>a.t-b.t);
 if(a.length<60)throw Error('已收盘K线不足60根');
 if(a.some(c=>![c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)||c.t%period!==0||c.l<=0||c.v<0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)))throw Error('K线数据无效');
 if(a.some((c,i)=>i&&c.t-a[i-1].t!==period))throw Error('K线存在缺口或重复');
 if(now-a.at(-1).t>=period*2)throw Error('缺少最近已收盘K线');
 return a;
}
export function atr(a,n=14){return avg(a.slice(-n).map((c,i)=>{const prev=a[a.length-n+i-1];return prev?Math.max(c.h-c.l,Math.abs(c.h-prev.c),Math.abs(c.l-prev.c)):c.h-c.l;}));}
export function trend(a){const e=ema(a.map(c=>c.c),20),s=ema(a.map(c=>c.c),50),c=a.at(-1).c;return c>e.at(-1)&&e.at(-1)>s.at(-1)&&e.at(-1)>e.at(-4)?1:c<e.at(-1)&&e.at(-1)<s.at(-1)&&e.at(-1)<e.at(-4)?-1:0;}
// Two candles on each side must already have closed. No future bars are accepted.
export function pivots(a,width=2){const out=[];for(let i=width;i<a.length-width;i++){const c=a[i],neighbors=a.slice(i-width,i+width+1).filter((_,j)=>j!==width);if(neighbors.every(x=>c.h>x.h))out.push({kind:'high',price:c.h,t:c.t,confirmedAt:a[i+width].t+(a[1].t-a[0].t),index:i});if(neighbors.every(x=>c.l<x.l))out.push({kind:'low',price:c.l,t:c.t,confirmedAt:a[i+width].t+(a[1].t-a[0].t),index:i});}return out;}
export function netRR(entry,stop,target,side,fee,slip){const cost=p=>(entry+p)*(fee+slip),risk=side*(entry-stop)+cost(stop);return risk>0?(side*(target-entry)-cost(target))/risk:-Infinity;}
export function topContracts(tickers,contracts){const active=new Set(contracts.filter(c=>c.quoteCoin==='USDT'&&c.symbolStatus==='normal'&&c.symbolType==='perpetual').map(c=>c.symbol));return tickers.filter(t=>active.has(t.symbol)&&Number(t.usdtVolume)>0&&Number(t.lastPr)>0).sort((a,b)=>Number(b.usdtVolume)-Number(a.usdtVolume)).slice(0,40);}
export function selectTargets(frames,side,price,volatility){
 const levels=frames.flatMap(a=>pivots(a).filter(p=>p.kind===(side===1?'high':'low')&&side*(p.price-price)>.6*volatility&&!a.slice(p.index+1).some(c=>side*(c.c-p.price)>0)).map(p=>p.price-side*.1*volatility));
 levels.sort((a,b)=>side*(a-b));const distinct=[];for(const p of levels)if(!distinct.length||side*(p-distinct.at(-1))>=.5*volatility)distinct.push(p);
 return distinct.slice(0,2);
}
export function aggregateStats(results){return Object.fromEntries(Object.keys(LABELS).map(k=>[k,{label:LABELS[k],passed:results.filter(r=>r.checks?.[k]===true).length,failed:results.filter(r=>r.checks?.[k]===false).length,skipped:results.filter(r=>r.checks?.[k]==null).length}]));}
export function analyze({symbol,fourHour,hour,structure,entry,micro,quote,now,fee=.0006,slip=.0005,stopBuffer=.5,accountEquity=null,contractRules=null}){
 const checks=Object.fromEntries(Object.keys(LABELS).map(k=>[k,null])),reasons=[];
 const check=(k,ok,reason)=>{checks[k]=!!ok;if(!ok)reasons.push(reason||LABELS[k]+'未通过');return !!ok;};
 const finish=(extra={})=>{const evaluated=Object.values(checks).filter(v=>v!==null),passed=evaluated.filter(Boolean).length;return {symbol,status:checks.alignment&&checks.structure15?'观察':'等待',reason:reasons[0]||(extra.status==='可入场'?'全部条件通过':'等待确认'),reasons,checks,passed,total:Object.keys(checks).length,score:passed/Object.keys(checks).length,...extra};};
 if(!check('cost',[fee,slip].every(v=>Number.isFinite(v)&&v>=0&&v<=.01),'费用参数无效'))return finish();
 let q,h,m,f,u;try{q=closedCandles(fourHour,PERIODS['4H'],now);h=closedCandles(hour,PERIODS['1H'],now);m=closedCandles(structure,PERIODS['15m'],now);f=closedCandles(entry,PERIODS['5m'],now);u=closedCandles(micro,PERIODS['1m'],now);check('data',true);}catch(e){check('data',false,e.message);return finish();}
 const side=trend(h),major=trend(q);check('trend4h',major!==0,'4小时趋势不明确');check('trend1h',side!==0,'1小时趋势不明确');check('alignment',side!==0&&side===major,'4小时与1小时未同向');
 if(!checks.alignment)return finish();
 const s=m.at(-1),p=m.at(-2),b=f.at(-1),prev=f.at(-2),a=u.at(-1),up=u.at(-2),v=atr(f),vm=atr(m),vu=atr(u);
 if(!(v>0&&vm>0&&vu>0)){check('data',false,'波动数据无效');return finish();}
 const range=m.slice(-21,-1);
 const me=ema(m.map(c=>c.c),20),fe=ema(f.map(c=>c.c),20),ue=ema(u.map(c=>c.c),9);
 const before=pivots(m.slice(0,-2)),lowKind=side===1?'low':'high',anchor=before.filter(x=>x.kind===lowKind).at(-1);
 const directional=c=>side*(c.c-c.o)>0;
 // Retest is on the prior 15m candle against ITS EMA, followed by a separate closed reclaim candle.
 const touched=p.l<=me.at(-2)&&p.h>=me.at(-2);
 const reclaimed=side*(s.c-(side===1?p.h:p.l))>0&&side*(s.c-me.at(-1))>0&&directional(s);
 const higherLow=anchor&&side*((side===1?p.l:p.h)-anchor.price)>0;
 const pullback=touched&&reclaimed&&higherLow;
 const setup=pullback?'顺势回踩企稳':null;
 check('structure15',!!setup,'15分钟未完成顺势回踩：触及当时EMA20、保持较高低点/较低高点，再由后一根收盘收复');
 const ratio15=s.v/avg(range.map(c=>c.v)),ratio5=b.v/avg(f.slice(-21,-1).map(c=>c.v));
 check('volume15',Number.isFinite(ratio15)&&ratio15>=1.5,`15分钟量比${ratio15.toFixed(2)}，要求≥1.50`);
 const fresh5=b.t>=s.t+PERIODS['15m'];
 const heldStructure=f.filter(c=>c.t>=s.t+PERIODS['15m']).every(c=>side===1?c.l>=p.l:c.h<=p.h);
 const level5=side===1?prev.h:prev.l;
 check('confirmation5',fresh5&&heldStructure&&directional(b)&&side*(b.c-level5)>0&&side*(b.c-fe.at(-1))>0&&side*(b.c-(side===1?p.h:p.l))>0,'5分钟尚未在15分钟确认后放量企稳，或回踩结构已失守');
 check('volume5',Number.isFinite(ratio5)&&ratio5>=1.5,`5分钟量比${ratio5.toFixed(2)}，要求≥1.50`);
 check('trigger1',a.t>=b.t+PERIODS['5m']&&u.filter(c=>c.t>=s.t+PERIODS['15m']).every(c=>side===1?c.l>=p.l:c.h<=p.h)&&directional(a)&&side*(a.c-(side===1?up.h:up.l))>0&&side*(a.c-ue.at(-1))>0&&side*(ue.at(-1)-ue.at(-3))>0,'1分钟尚未在5分钟收盘后突破前高/低并站稳EMA9');
 const bid=Number(quote?.bidPr),ask=Number(quote?.askPr),ts=Number(quote?.ts);
 check('quote',bid>0&&ask>=bid&&Number.isFinite(ts)&&Math.abs(now-ts)<=60000,'最新报价无效或超过60秒');
 const half=Math.min(v*.15,vu*.25),entryLow=a.c-half,entryHigh=a.c+half,price=side===1?ask:bid,worst=side===1?entryHigh:entryLow;
 check('zone',checks.quote&&price>=entryLow&&price<=entryHigh&&Math.abs(price-b.c)<=v*.5,'报价超出1分钟入场区间或偏离5分钟收盘超过0.5 ATR');
 if(!setup)return finish({direction:side===1?'做多':'做空',volumeRatio15:ratio15,volumeRatio5:ratio5});
 const stopDetails=structuralStop(f,{side,entry:worst,atr:v,bufferMultiple:stopBuffer,minTime:p.t-2*PERIODS['15m'],invalidation:side===1?p.l:p.h});
 const stop=stopDetails.stop;
 check('stop',stopDetails.valid,stopDetails.reason);
 const targets=selectTargets([m,h],side,worst,v),[target1,target2]=targets;
 check('targets',targets.length===2&&side*(target1-worst)<=6*v&&side*(target2-worst)<=10*v,'缺少两档未突破摆动目标，或目标距离超过短线范围');
 const rr=netRR(worst,stop,target1,side,fee,slip),rr2=netRR(worst,stop,target2,side,fee,slip);
 check('rr',checks.stop&&checks.targets&&Number.isFinite(rr)&&rr>=2&&rr2>=2,`第一止盈最差入场净RR${Number.isFinite(rr)?rr.toFixed(2):'不可计算'}，要求≥2.00`);
 const positionRisk=positionSize({equity:accountEquity,entry:worst,stop:stopDetails.valid?stop:NaN,side,fee,slip,rules:contractRules,notionalPrice:entryHigh});
 check('position',stopDetails.valid&&['sized','estimate'].includes(positionRisk.status)&&positionRisk.plannedLoss<=positionRisk.riskBudget,positionRisk.reason);
 const confirmed=Object.values(checks).every(x=>x===true);
 const focused=!confirmed&&['data','cost','trend4h','trend1h','alignment','structure15','volume15','confirmation5','volume5','quote','stop','targets','rr','position'].every(k=>checks[k]===true);
 return finish({status:confirmed?'可入场':focused?'重点观察':'观察',direction:side===1?'做多':'做空',kind:setup,stopDetails,positionRisk,diagnostics:{computedNetRR:Number.isFinite(rr)?rr:null,computedNetRR2:Number.isFinite(rr2)?rr2:null},...(confirmed?{price,entryLow,entryHigh,stop,target:target1,target1,target2,rr,rr2}:{}),signalTime:a.t+PERIODS['1m'],setupId:`${symbol}:${side}:${s.t}:${setup}`,volumeRatio15:ratio15,volumeRatio5:ratio5,expiresAt:a.t+2*PERIODS['1m'],maxHoldingMinutes:120});
}
