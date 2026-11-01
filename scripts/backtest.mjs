import {createAPI,mix} from '../web/api.js';
import {PERIODS} from '../web/engine.js';
import {loadHistory} from './history.mjs';
import {replay} from '../web/replay.js';
import {mkdir,writeFile} from 'node:fs/promises';
const api=createAPI(),clock=await api('/api/v2/public/time'),end=Math.floor(Number(clock.serverTime)/60000)*60000-5*60000;
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','AAVEUSDT'],reports=[];
await mkdir('reports',{recursive:true});
for(const symbol of symbols){const dataset={};for(const [p,count] of Object.entries({'4H':200,'1H':260,'15m':400,'5m':800,'1m':3200})){dataset[p]=await loadHistory(api,symbol,p,count,end);console.log('HISTORY',symbol,p,dataset[p].length);}
 const scenarios=[];for(const [name,fee,slip] of [['zero',0,0],['default',.0006,.0005],['stress',.0012,.001]]){const result=replay(dataset,{symbol,from:end-48*3600000,to:end,fee,slip});scenarios.push({name,fee,slip,...result});console.log('BACKTEST',JSON.stringify({symbol,name,signals:result.signals,resolved:result.resolved,losses:result.losses,netR:result.netR}));}
 await writeFile(`reports/${symbol}-history.json`,JSON.stringify(dataset));reports.push({symbol,scenarios});}
const report={source:'Bitget V2 history-candles, real historical data',from:new Date(end-48*3600000).toISOString(),to:new Date(end).toISOString(),limitations:['仅4个指定币种最近48小时，不是历史全市场前40的无幸存者偏差回测','收盘后参考已知1m收盘价±区间，以最差区间价假定成交；无历史盘口和成交排队数据','同K线止损优先、跳空不利成交、两档各50%、最长120分钟；未结束交易不计胜负','误报率定义为已结束交易净亏损或持平比例，不等于人工标注误报','不包含资金费及市场冲击；零交易或样本少时不能证明策略盈利','成本场景会重新筛选信号；并非同一组交易的因果成本比较'],reports};
await writeFile('reports/backtest.json',JSON.stringify(report,null,2));console.log('HISTORICAL_REPORT',JSON.stringify(report));
