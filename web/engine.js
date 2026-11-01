export const PERIODS = {'1H':3600000,'15m':900000,'5m':300000};
export function closedCandles(rows, period, now) {
  const candles = rows.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})).sort((a,b)=>a.t-b.t);
  const result = candles.filter(c=>c.t+period<=now);
  if(result.some(c=>![c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)||c.l<=0||c.v<0||c.h<Math.max(c.o,c.c)||c.l>Math.min(c.o,c.c)) || new Set(result.map(c=>c.t)).size!==result.length) throw Error('K线数据无效');
  if(result.length<60) throw Error('已收盘K线不足60根');
  if(now-result.at(-1).t>period*2+15000) throw Error('K线已过期');
  if(result.some((c,i)=>i && c.t-result[i-1].t!==period)) throw Error('K线存在缺口');
  return result;
}
export function ema(values,n){return values.reduce((out,v,i)=>[...out,i ? v*2/(n+1)+out[i-1]*(1-2/(n+1)):v],[]);}
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function netRR(entry,stop,target,side,fee,slip){
  const cost=p=>(entry+p)*(fee+slip);
  const reward=side*(target-entry)-cost(target),risk=side*(entry-stop)+cost(stop);
  return risk>0?reward/risk:-Infinity;
}
export function topContracts(tickers,contracts){
  const active=new Set(contracts.filter(c=>c.quoteCoin==='USDT'&&c.symbolStatus==='normal'&&c.symbolType==='perpetual').map(c=>c.symbol));
  return tickers.filter(t=>active.has(t.symbol)&&Number(t.usdtVolume)>0&&Number(t.lastPr)>0).sort((a,b)=>Number(b.usdtVolume)-Number(a.usdtVolume)).slice(0,40);
}
export function analyze({symbol,hour,structure,entry,quote,now,fee=.0006,slip=.0005}){
  const wait=reason=>({symbol,status:'等待',reason});
  if(!Number.isFinite(fee)||!Number.isFinite(slip)||fee<0||slip<0||fee>.01||slip>.01)return wait('费用参数无效');
  const h=closedCandles(hour,PERIODS['1H'],now),m=closedCandles(structure,PERIODS['15m'],now),f=closedCandles(entry,PERIODS['5m'],now);
  const hc=h.map(c=>c.c),fast=ema(hc,20),slow=ema(hc,50),last=h.at(-1);
  const side=last.c>fast.at(-1)&&fast.at(-1)>slow.at(-1)&&fast.at(-1)>fast.at(-4)?1:last.c<fast.at(-1)&&fast.at(-1)<slow.at(-1)&&fast.at(-1)<fast.at(-4)?-1:0;
  if(!side)return wait('1小时趋势不明确');
  const b=f.at(-1),prev=f.at(-2),history=f.slice(-21,-1),range=m.slice(-21,-1),s=m.at(-1);
  const upper=Math.max(...range.map(c=>c.h)),lower=Math.min(...range.map(c=>c.l));
  const atr=avg(f.slice(-15).map((c,i,a)=>i?Math.max(c.h-c.l,Math.abs(c.h-a[i-1].c),Math.abs(c.l-a[i-1].c)):c.h-c.l));
  if(!(atr>0))return wait('波动不足');
  const volume=b.v>=avg(history.map(c=>c.v))*1.5;
  const breakout=volume&&(side===1?s.c>upper&&b.c>Math.max(...history.map(c=>c.h)):s.c<lower&&b.c<Math.min(...history.map(c=>c.l)));
  const me=ema(m.map(c=>c.c),20).at(-1),fe=ema(f.map(c=>c.c),20).at(-1);
  const pullback=side===1?s.c>me&&prev.l<=fe&&b.c>prev.h&&b.c>fe:s.c<me&&prev.h>=fe&&b.c<prev.l&&b.c<fe;
  const older=m.slice(-41,-21),oldHigh=Math.max(...older.map(c=>c.h)),oldLow=Math.min(...older.map(c=>c.l));
  const reversal=volume&&(side===1?lower<oldLow&&s.c>upper&&b.c>prev.h:upper>oldHigh&&s.c<lower&&b.c<prev.l);
  if(!breakout&&!pullback&&!reversal)return wait('多周期信号未确认');
  const ask=Number(quote.askPr),bid=Number(quote.bidPr),qt=Number(quote.ts);
  if(!(ask>=bid&&bid>0&&Math.abs(now-qt)<=60000))return wait('报价缺失或过期');
  const price=side===1?ask:bid;
  if(Math.abs(price-b.c)>atr*.5)return wait('价格已偏离信号，等待下一次确认');
  const stop=side===1?Math.min(...f.slice(-6).map(c=>c.l))-atr*.2:Math.max(...f.slice(-6).map(c=>c.h))+atr*.2;
  const levels=m.slice(-60,-1).map(c=>side===1?c.h:c.l).filter(p=>side*(p-price)>atr*.5);
  if(!levels.length||side*(price-stop)<=0)return wait('缺少有效结构止盈或止损');
  const target=side===1?Math.min(...levels):Math.max(...levels);
  const rr=netRR(price,stop,target,side,fee,slip);
  if(rr<2)return wait(`净盈亏比不足2:1（${rr.toFixed(2)}）`);
  return {symbol,status:'信号',direction:side===1?'做多':'做空',kind:reversal?'趋势反转':breakout?'放量突破':'顺势回踩企稳',price,stop,target,rr,signalTime:b.t+PERIODS['5m']};
}
