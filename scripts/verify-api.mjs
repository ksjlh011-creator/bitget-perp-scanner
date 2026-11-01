import {createAPI,mix,candles} from '../web/api.js';
import {topContracts,analyze} from '../web/engine.js';
const origin='https://ksjlh011-creator.github.io';
let requests=0;
const api=createAPI(async(url,options)=>{
 const res=await fetch(url,{...options,headers:{Origin:origin}});
 const cors=res.headers.get('access-control-allow-origin');requests++;
 console.log('REAL_HTTP',res.status,new URL(url).pathname,'CORS',cors);
 if(res.ok&&!['*',origin].includes(cors))throw Error('未确认浏览器跨域许可');
 return res;
});
try{
 const start=Date.now(),clock=await api('/api/v2/public/time');
 const offset=Number(clock.serverTime)-(start+Date.now())/2;
 if(!Number.isFinite(offset))throw Error('服务器时间格式无效');
 const contracts=await api(mix+'contracts',{productType:'USDT-FUTURES'});
 const tickers=await api(mix+'tickers',{productType:'USDT-FUTURES'});
 const pool=topContracts(tickers,contracts);if(pool.length!==40)throw Error(`扫描池不足40：${pool.length}`);
 console.log('REAL_TOP40',JSON.stringify(pool.map(t=>t.symbol)));
 let failures=0,signals=0;
 for(const ticker of pool){
  try{
   const hour=await candles(api,ticker.symbol,'1H');
   const structure=await candles(api,ticker.symbol,'15m');
   const entry=await candles(api,ticker.symbol,'5m');
   const quotes=await api(mix+'ticker',{symbol:ticker.symbol,productType:'USDT-FUTURES'});
   const result=analyze({symbol:ticker.symbol,hour,structure,entry,quote:quotes[0]||{},now:Date.now()+offset});
   if(result.reason==='报价缺失或过期')throw Error(result.reason);
   if(result.status==='信号')signals++;
   console.log('REAL_RESULT',JSON.stringify(result));
  }catch(e){failures++;console.error('REAL_FAILURE',ticker.symbol,e.message);}
 }
 console.log('REAL_SUMMARY',JSON.stringify({scanned:40,failures,signals,requests,origin,checkedAt:new Date().toISOString()}));
 if(failures)throw Error(`${failures}个合约数据验证失败`);
}catch(e){console.error('API 实测失败：',e.message);process.exitCode=1;}
