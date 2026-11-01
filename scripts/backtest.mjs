import {createAPI,mix} from '../web/api.js';
import {PERIODS} from '../web/engine.js';
import {replay} from '../web/replay.js';
import {mkdir,writeFile} from 'node:fs/promises';
const api=createAPI(),clock=await api('/api/v2/public/time'),end=Math.floor(Number(clock.serverTime)/60000)*60000-5*60000;
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','AAVEUSDT'],reports=[];
async function history(symbol,granularity,count){const map=new Map();let cursor=end;while(map.size<count){const page=await api(mix+'history-candles',{symbol,productType:'USDT-FUTURES',granularity,limit:'200',endTime:String(cursor)});if(!Array.isArray(page)||!page.length)throw Error(`${symbol} ${granularity}历史不足`);const before=map.size;for(const r of page)if(+r[0]+PERIODS[granularity]<=end)map.set(+r[0],r);const oldest=Math.min(...page.map(r=>+r[0]));if(map.size===before)throw Error('历史分页无进展');cursor=oldest-1;}const rows=[...map.values()].sort((a,b)=>+a[0]-+b[0]);if(rows.some(r=>r.slice(0,6).some(v=>!Number.isFinite(Number(v)))||+r[3]<=0||+r[5]<0||+r[2]<Math.max(+r[1],+r[4])||+r[3]>Math.min(+r[1],+r[4])))throw Error('历史OHLCV无效');if(rows.some((r,i)=>i&&+r[0]-rows[i-1][0]!==PERIODS[granularity]))throw Error(`${symbol} ${granularity}历史K线缺口`);return rows;}
await mkdir('reports',{recursive:true});
for(const symbol of symbols){const dataset={};for(const [p,count] of Object.entries({'4H':200,'1H':260,'15m':400,'5m':800,'1m':3200})){dataset[p]=await history(symbol,p,count);console.log('HISTORY',symbol,p,dataset[p].length);}
 const scenarios=[];for(const [name,fee,slip] of [['zero',0,0],['default',.0006,.0005],['stress',.0012,.001]]){const result=replay(dataset,{symbol,from:end-48*3600000,to:end,fee,slip});scenarios.push({name,fee,slip,...result});console.log('BACKTEST',JSON.stringify({symbol,name,signals:result.signals,resolved:result.resolved,losses:result.losses,netR:result.netR}));}
 await writeFile(`reports/${symbol}-history.json`,JSON.stringify(dataset));reports.push({symbol,scenarios});}
const report={source:'Bitget V2 history-candles, real historical data',from:new Date(end-48*3600000).toISOString(),to:new Date(end).toISOString(),limitations:['仅4个指定币种最近48小时，不是历史全市场前40的无幸存者偏差回测','收盘后参考已知1m收盘价±区间，以最差区间价假定成交；无历史盘口和成交排队数据','同K线止损优先、跳空不利成交、两档各50%、最长120分钟；未结束交易不计胜负','误报率定义为已结束交易净亏损或持平比例，不等于人工标注误报','不包含资金费及市场冲击；零交易或样本少时不能证明策略盈利','成本场景会重新筛选信号；并非同一组交易的因果成本比较'],reports};
await writeFile('reports/backtest.json',JSON.stringify(report,null,2));console.log('HISTORICAL_REPORT',JSON.stringify(report));
