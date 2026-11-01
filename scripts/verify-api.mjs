import {createAPI} from '../web/api.js';
import {scanMarket,serializeExport} from '../web/scan.js';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://ksjlh011-creator.github.io';let requests=0;
const api=createAPI(async(url,options)=>{const response=await fetch(url,{...options,headers:{Origin:origin}});requests++;const cors=response.headers.get('access-control-allow-origin');console.log('REAL_HTTP',response.status,new URL(url).pathname,'CORS',cors);if(response.ok&&!['*',origin].includes(cors))throw Error('未确认浏览器跨域许可');return response;});
try{
 const report=await scanMarket(api,{onProgress:({index,report})=>{if(index===report.contracts.length&&index>0)console.log('REAL_RESULT',JSON.stringify({symbol:report.contracts.at(-1).symbol,status:report.contracts.at(-1).status,result:report.contracts.at(-1).result,errors:report.contracts.at(-1).errors}));}});
 const content=serializeExport(report),parsed=JSON.parse(content);await mkdir('reports',{recursive:true});await writeFile('reports/live-scan.json',content);
 const frames=parsed.contracts.flatMap(c=>Object.values(c.frames));
 const candleCount=frames.reduce((n,f)=>n+f.count,0);
 if(!report.complete||report.contracts.length!==40||frames.length!==200||frames.some(f=>f.status!=='ok'||f.count!==100||f.candles.length!==100||f.candles.some(c=>c.closeTime>f.serverTime))||candleCount!==20000)throw Error(`完整导出验证失败：${report.status}，${candleCount}根K线，${JSON.stringify(report.errors)}，${JSON.stringify(report.contracts.filter(c=>c.status==='error').map(c=>({symbol:c.symbol,errors:c.errors})))}`);
 console.log('REAL_FILTERS',JSON.stringify(report.filters));
 console.log('REAL_SUMMARY',JSON.stringify({...report.summary,requests,candleCount,frames:frames.length,serverTimeStart:report.serverTimeStart,serverTimeEnd:report.serverTimeEnd,jsonBytes:Buffer.byteLength(content),origin,checkedAt:new Date(report.serverTimeEnd).toISOString()}));
}catch(e){console.error('真实API与JSON导出验证失败：',e.message);process.exitCode=1;}
