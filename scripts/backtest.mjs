import {createAPI} from '../web/api.js';
import {loadHistory} from './history.mjs';
import {replay} from '../web/replay.js';
import {STOP_BUFFERS} from '../web/risk.js';
import {mkdir,writeFile} from 'node:fs/promises';
const api=createAPI(),clock=await api('/api/v2/public/time'),end=Math.floor(Number(clock.serverTime)/60000)*60000-5*60000;
const hours=168,initialEquity=10000,symbols=['BTCUSDT','ETHUSDT','SOLUSDT','AAVEUSDT'],reports=[];
await mkdir('reports',{recursive:true});
for(const symbol of symbols){
 const dataset={};
 for(const [p,count] of Object.entries({'4H':240,'1H':400,'15m':800,'5m':2200,'1m':11000})){dataset[p]=await loadHistory(api,symbol,p,count,end);console.log('HISTORY',symbol,p,dataset[p].length);}
 await writeFile(`reports/${symbol}-history.json`,JSON.stringify(dataset));
 const scenarios=[],configs=[...STOP_BUFFERS.map(stopBuffer=>({name:'default',fee:.0006,slip:.0005,stopBuffer})),{name:'zero',fee:0,slip:0,stopBuffer:.5},{name:'stress',fee:.0012,slip:.001,stopBuffer:.5}];
 for(const config of configs){const result=replay(dataset,{symbol,from:end-hours*3600000,to:end,accountEquity:initialEquity,...config});scenarios.push({...config,...result});console.log('STOP_COMPARISON',JSON.stringify({symbol,name:config.name,buffer:config.stopBuffer,signals:result.signals,executed:result.executed,resolved:result.resolved,stopOuts:result.stopOuts,losses:result.losses,netR:result.netR,netPnl:result.netPnl,maxPlannedRiskFraction:result.maxPlannedRiskFraction,stopDiagnostics:result.stopDiagnostics}));}
 reports.push({symbol,scenarios});
}
const report={source:'Bitget V2 history-candles, real historical data',from:new Date(end-hours*3600000).toISOString(),to:new Date(end).toISOString(),initialEquity,capitalModel:'10000 USDT hypothetical evaluation capital per symbol, settled trade PnL compounds only after exit, no shared portfolio, no user balance assumed',stopBuffers:STOP_BUFFERS,defaultBuffer:.5,selection:'No best buffer selected; 0.5 remains provisional, compare all four at identical default costs',limitations:['仅4个指定币种最近7天，不是历史全市场动态前40的无幸存者偏差回测','回测权益仅为显式评估参数，不是用户真实余额；缺少历史下单规格时数量为理论估算','收盘后1m价格区间、次分钟开盘在区间内才假定成交，以区间最差价计，无历史盘口/队列','同K双触先止损、跳空不利成交、两档各50%、最长120分钟；未结束交易不计胜负','单笔计划风险≤当时模拟权益1%，不保证跳空后的实际损失不超1%，不含资金费或额外市场冲击','4种缓冲用同一数据、同一默认费用重算RR和入场；不会为凑RR变换结构；成本零/双倍只对0.5做附加对照','零交易/少样本不能比较止损优劣或证明盈利，不因回测收益自动调参'],reports};
await writeFile('reports/backtest.json',JSON.stringify(report,null,2));
const summary={...report,reports:reports.map(r=>({symbol:r.symbol,scenarios:r.scenarios.map(s=>({name:s.name,stopBuffer:s.stopBuffer,signals:s.signals,executed:s.executed,resolved:s.resolved,stopOuts:s.stopOuts,losses:s.losses,falsePositiveRate:s.falsePositiveRate,netR:s.netR,netPnl:s.netPnl,endingEquity:s.endingEquity,maxPlannedRiskFraction:s.maxPlannedRiskFraction,realizedRiskBreaches:s.realizedRiskBreaches,stopDiagnostics:s.stopDiagnostics}))}))};
console.log('HISTORICAL_REPORT',JSON.stringify(summary));
