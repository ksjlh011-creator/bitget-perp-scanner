import {analyze,PERIODS,aggregateStats} from './engine.js';
export function upperBound(rows,time,period){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(+rows[mid][0]+period<=time)lo=mid+1;else hi=mid;}return lo;}
export function snapshot(dataset,now,lookback=100){return Object.fromEntries(Object.entries({fourHour:'4H',hour:'1H',structure:'15m',entry:'5m',micro:'1m'}).map(([key,p])=>{const rows=dataset[p],end=upperBound(rows,now,PERIODS[p]);return [key,rows.slice(Math.max(0,end-lookback),end)];}));}
// Long gaps fill at the worse open; short gaps likewise. If both barriers touch,
// stop is assumed first. TP1 exits half, TP2 exits the remainder. No break-even fiction.
export function simulateTrade(signal,future,{fee=.0006,slip=.0005,maxMinutes=120}={}){
 const side=signal.direction==='做多'?1:-1,entry=side===1?signal.entryHigh:signal.entryLow,deadline=signal.signalTime+maxMinutes*60000;
 let remaining=1,pnl=0,t1=false,exitTime=signal.signalTime,outcome='unresolved';
 const close=(fraction,price)=>{pnl+=fraction*(side*(price-entry)-(entry+price)*(fee+slip));remaining-=fraction;};
 let last;
 for(const r of future){const [t,o,h,l,c]=r.map(Number);if(t<signal.signalTime)continue;if(t>=deadline)break;last={t,c};
  const stopHit=side===1?l<=signal.stop:h>=signal.stop;
  if(stopHit){close(remaining,side===1?Math.min(o,signal.stop):Math.max(o,signal.stop));outcome=t1?'partial-stop':'stop';exitTime=t+60000;break;}
  if(!t1&&(side===1?h>=signal.target1:l<=signal.target1)){close(.5,signal.target1);t1=true;}
  if(t1&&(side===1?h>=signal.target2:l<=signal.target2)){close(remaining,signal.target2);outcome='target2';exitTime=t+60000;break;}
  exitTime=t+60000;
 }
 if(remaining>0&&last&&last.t+60000>=deadline){close(remaining,last.c);outcome='timeout';}
 const risk=side*(entry-signal.stop)+(entry+signal.stop)*(fee+slip);
 return {outcome,pnl,netR:pnl/risk,exitTime,resolved:remaining===0,tp1:t1};
}
export function replay(dataset,{symbol,from,to,fee=.0006,slip=.0005,stopBuffer=.5,accountEquity=10000,contractRules=null}={}){
 const times=dataset['1m'].filter(r=>+r[0]+60000>=from&&+r[0]+60000<=to).map(r=>+r[0]+60000);
 const seen=new Set(),results=[],trades=[];let blockedUntil=0,rawSignals=0,uniqueSignals=0,unfilled=0,balance=accountEquity,pending=null;
 for(const now of times){if(pending&&pending.exitTime<=now){balance+=pending.netPnl;pending=null;}const frame=snapshot(dataset,now),last=frame.micro.at(-1);if(!last)continue;
  const result=analyze({symbol,...frame,now,fee,slip,stopBuffer,accountEquity:balance,contractRules,quote:{bidPr:last[4],askPr:last[4],ts:now}});results.push(result);
  if(result.status!=='可入场')continue;rawSignals++;
  if(seen.has(result.setupId)||now<blockedUntil)continue;seen.add(result.setupId);uniqueSignals++;
  const future=dataset['1m'].filter(r=>+r[0]>=now&&+r[0]+60000<=to);
  if(!future.length||+future[0][0]!==now||+future[0][1]<result.entryLow||+future[0][1]>result.entryHigh){unfilled++;continue;}
  const trade=simulateTrade(result,future,{fee,slip});
  const zero=simulateTrade(result,future,{fee:0,slip:0});
  const stress=simulateTrade(result,future,{fee:fee*2,slip:slip*2});
  trade.costComparison={zeroPnl:zero.pnl,defaultPnl:trade.pnl,stressPnl:stress.pnl};
  const quantity=result.positionRisk.quantity;const netPnl=trade.pnl*quantity;const record={...trade,quantity,netPnl,accountEquityAtEntry:balance,plannedRisk:result.positionRisk.plannedLoss,plannedRiskFraction:result.positionRisk.plannedRiskFraction,stopDetails:result.stopDetails,signalTime:now,setupId:result.setupId};trades.push(record);if(trade.resolved)pending=record;blockedUntil=trade.resolved?trade.exitTime:Infinity;
 }
 if(pending&&pending.exitTime<=to){balance+=pending.netPnl;pending=null;}
 const stopPlans=results.filter(r=>r.stopDetails);
 const done=trades.filter(t=>t.resolved),losses=done.filter(t=>t.pnl<=0).length;
 return {symbol,stopBuffer,initialEquity:accountEquity,endingEquity:balance,netPnl:done.reduce((s,t)=>s+t.netPnl,0),maxPlannedRiskFraction:trades.length?Math.max(...trades.map(t=>t.plannedRiskFraction)):null,realizedRiskBreaches:done.filter(t=>-t.netPnl>t.accountEquityAtEntry*.01).length,stopOuts:done.filter(t=>['stop','partial-stop'].includes(t.outcome)).length,stopDiagnostics:{evaluated:stopPlans.length,valid:stopPlans.filter(r=>r.stopDetails.valid).length,meanDistanceATR:stopPlans.length?stopPlans.reduce((s,r)=>s+(r.stopDetails.distanceATR||0),0)/stopPlans.length:null,rrRejected:stopPlans.filter(r=>r.checks.rr===false).length},evaluations:results.length,rawSignals,signals:uniqueSignals,executed:trades.length,unfilled,resolved:done.length,unresolved:trades.length-done.length,losses,falsePositiveDefinition:'已结束交易净收益≤0（代理指标，不代表所有主观误报）',falsePositiveRate:done.length?losses/done.length:null,tp1Hits:done.filter(t=>t.tp1).length,sameTradesCost:done.reduce((a,t)=>({zeroPnl:a.zeroPnl+t.costComparison.zeroPnl*t.quantity,defaultPnl:a.defaultPnl+t.costComparison.defaultPnl*t.quantity,stressPnl:a.stressPnl+t.costComparison.stressPnl*t.quantity}),{zeroPnl:0,defaultPnl:0,stressPnl:0}),netR:done.reduce((s,t)=>s+t.netR,0),filters:aggregateStats(results),trades};
}
