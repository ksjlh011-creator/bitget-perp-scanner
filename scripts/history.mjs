import {mix} from '../web/api.js';import {PERIODS} from '../web/engine.js';
export async function loadHistory(api,symbol,granularity,count,end){
 const period=PERIODS[granularity],map=new Map();let cursor=end;
 while(map.size<count){
  const page=await api(mix+'history-candles',{symbol,productType:'USDT-FUTURES',granularity,limit:'200',endTime:String(cursor)});
  if(!Array.isArray(page)||!page.length)throw Error(`${symbol} ${granularity}历史不足`);
  const before=map.size;
  for(const r of page)if(+r[0]+period<=end)map.set(+r[0],r);
  const oldest=Math.min(...page.map(r=>+r[0]));
  if(map.size===before)throw Error('历史分页无进展');
  // API rounds endTime to its candle boundary. Overlap one full candle and
  // deduplicate by timestamp instead of subtracting 1ms and skipping a candle.
  cursor=oldest+period;
 }
 const rows=[...map.values()].sort((a,b)=>+a[0]-+b[0]);
 if(rows.some(r=>r.slice(0,6).some(v=>!Number.isFinite(Number(v)))||+r[0]%period!==0||+r[3]<=0||+r[5]<0||+r[2]<Math.max(+r[1],+r[4])||+r[3]>Math.min(+r[1],+r[4])))throw Error('历史OHLCV无效');
 const gaps=rows.filter((r,i)=>i&&+r[0]-rows[i-1][0]!==period);
 if(gaps.length)throw Error(`${symbol} ${granularity}历史K线缺口，边界${gaps.slice(0,3).map(r=>r[0]).join(',')}`);
 return rows;
}
