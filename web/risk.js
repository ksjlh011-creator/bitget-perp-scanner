export const STOP_BUFFERS=[0.3,0.5,0.8,1.0];
export const STOP_WINDOWS=[6,10,15];
// Inputs must be closed candles. Selection never sees target prices or RR.
export function structuralStop(candles,{side,entry,atr,bufferMultiple=.5,minTime=-Infinity,invalidation=null}={}){
 const out={valid:false,atr,atrPeriod:14,atrMethod:'mean true range',bufferMultiple,bufferAmount:atr*bufferMultiple,minDistanceATR:.8,maxDistanceATR:3,windows:[],anchor:null,stop:null,reason:''};
 if(![1,-1].includes(side)||!Number.isFinite(entry)||entry<=0||!Number.isFinite(atr)||atr<=0||!STOP_BUFFERS.includes(bufferMultiple)||candles.length<15){out.reason='止损输入或ATR参数无效';return out;}
 const n=candles.length,kind=side===1?'low':'high',field=side===1?'l':'h';
 const candidates=[];
 for(let i=2;i<n-2;i++){
  const c=candles[i],neighbors=[candles[i-2],candles[i-1],candles[i+1],candles[i+2]],price=c[field];
  if(c.t<minTime||!neighbors.every(x=>side===1?price<x.l:price>x.h))continue;
  const after=candles.slice(i+1),held=after.every(x=>side===1?x.l>=price:x.h<=price);
  const rebound=side===1?Math.max(...after.map(x=>x.h))-price:price-Math.min(...after.map(x=>x.l));
  if(!held||rebound<atr||side*(entry-price)<=0)continue;
  candidates.push({kind,price,time:c.t,confirmedAt:candles[i+2].t+300000,index:i,reboundATR:rebound/atr});
 }
 for(const bars of STOP_WINDOWS){
  const frame=candles.slice(-bars),eligible=candidates.filter(p=>p.index>=n-bars);
  const selected=eligible.length?eligible.reduce((a,b)=>side===1?(a.price<b.price?a:b):(a.price>b.price?a:b)):null;
  out.windows.push({bars,extreme:side===1?Math.min(...frame.map(c=>c.l)):Math.max(...frame.map(c=>c.h)),candidateCount:eligible.length,anchor:selected});
 }
 const unique=[...new Map(out.windows.flatMap(w=>w.anchor?[w.anchor]:[]).map(p=>[p.time,p])).values()];
 if(!unique.length){out.reason='最近6/10/15根5m内没有左右各2根确认、至少1 ATR反弹且未失守的有效结构';return out;}
 out.anchor=unique.reduce((a,b)=>side===1?(a.price<b.price?a:b):(a.price>b.price?a:b));
 out.supportingWindows=out.windows.filter(w=>w.anchor?.time===out.anchor.time).map(w=>w.bars);
 out.stop=out.anchor.price-side*out.bufferAmount;
 out.distance=side*(entry-out.stop);out.distanceATR=out.distance/atr;
 if(out.stop<=0){out.reason='结构止损价格无效';return out;}
 if(invalidation!=null&&side*(invalidation-out.stop)<0){out.reason='5m结构加缓冲仍未覆盖15m回踩失效位，拒绝入场';return out;}
 if(out.distanceATR<.8||out.distanceATR>3){out.reason=`结构止损距离${out.distanceATR.toFixed(2)} ATR，不在0.8–3 ATR范围；不会缩窄或替换结构来凑RR`;return out;}
 out.valid=true;out.reason=`比较6/10/15根5m，采用未失守的已确认${kind==='low'?'回踩低点':'反弹高点'}${out.anchor.price}，向外加${bufferMultiple}×ATR14；重叠窗口不计作独立确认`;return out;
}
export function positionSize({equity,entry,stop,side,fee=.0006,slip=.0005,rules=null,notionalPrice=entry}={}){
 const result={status:'unavailable',accountEquity:equity??null,riskFraction:.01,quantityUnit:'base asset',riskBudget:null,quantity:null,notional:null,plannedLoss:null,plannedRiskFraction:null,notionalCap:'1x equity (no assumed leverage)',includes:'entry + stop exit fee and slippage',note:'计划风险上限，不保证跳空、资金费或超预期滑点下实际损失≤1%'};
 if(!Number.isFinite(equity)||equity<=0){result.reason='请输入有效账户权益USDT后计算仓位，不假定账户余额';return result;}
 result.riskBudget=equity*.01;
 const unitLoss=side*(entry-stop)+(entry+stop)*(fee+slip);result.unitPlannedLoss=unitLoss;
 if(![1,-1].includes(side)||![entry,stop,fee,slip,unitLoss].every(Number.isFinite)||entry<=0||stop<=0||!Number.isFinite(notionalPrice)||notionalPrice<entry||side*(entry-stop)<=0||fee<0||slip<0||unitLoss<=0){result.reason='仓位风险输入无效';return result;}
 const theoretical=Math.min(result.riskBudget/unitLoss,equity/notionalPrice);
 const rawStep=Number(rules?.sizeMultiplier),step=rawStep>0&&Number.isFinite(rawStep)?rawStep:null;
 let quantity=step?Math.floor(theoretical/step)*step:Math.floor(theoretical*1e10)/1e10;
 if(!Number.isFinite(theoretical)||!Number.isFinite(quantity)){result.reason='仓位计算超出有效数值范围';return result;}
 // Conservative correction for floating-point rounding; never round risk upward.
 while(quantity>0&&(quantity*unitLoss>result.riskBudget||quantity*notionalPrice>equity))quantity=step?Math.max(0,quantity-step):Math.max(0,quantity-1e-10);
 const minQty=Number(rules?.minTradeNum)||0,minNotional=Number(rules?.minTradeUSDT)||0;
 if(!(quantity>0)||quantity<minQty||quantity*entry<minNotional){result.reason='风险预算不足以满足合约最小下单量或最小名义金额，不上调仓位';return result;}
 Object.assign(result,{status:step?'sized':'estimate',quantity,notional:quantity*entry,maxZoneNotional:quantity*notionalPrice,plannedLoss:quantity*unitLoss,plannedRiskFraction:quantity*unitLoss/equity,roundedToStep:step,reason:step?'按公开合约数量步长向下取整':'理论数量估算；缺少历史/公开下单步长，实际下单前需核对规格'});return result;
}
