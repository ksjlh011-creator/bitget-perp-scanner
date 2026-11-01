import {createAPI,mix,candles} from '../web/api.js';
import {topContracts,closedCandles,PERIODS} from '../web/engine.js';
const api=createAPI();
try{
 const clock=await api('/api/v2/public/time');
 const contracts=await api(mix+'contracts',{productType:'USDT-FUTURES'});
 const tickers=await api(mix+'tickers',{productType:'USDT-FUTURES'});
 const pool=topContracts(tickers,contracts);if(pool.length!==40)throw Error('扫描池不足40');
 for(const granularity of Object.keys(PERIODS)){const rows=await candles(api,'BTCUSDT',granularity);const server=await api('/api/v2/public/time');const data=closedCandles(rows,PERIODS[granularity],+server.serverTime);console.log(granularity,'closed candles:',data.length);}
 const quote=await api(mix+'ticker',{symbol:'BTCUSDT',productType:'USDT-FUTURES'});if(!(Number(quote[0]?.bidPr)>0))throw Error('报价格式无效');
 const cors=await fetch('https://api.bitget.com/api/v2/public/time',{headers:{Origin:'https://example.github.io'},signal:AbortSignal.timeout(12000)});
 console.log(JSON.stringify({serverTime:clock.serverTime,pool:pool.map(t=>t.symbol),cors:cors.headers.get('access-control-allow-origin')},null,2));
 if(!['*','https://example.github.io'].includes(cors.headers.get('access-control-allow-origin')))throw Error('未确认浏览器跨域许可');
}catch(e){console.error('API 实测失败：',e.message);process.exitCode=1;}
