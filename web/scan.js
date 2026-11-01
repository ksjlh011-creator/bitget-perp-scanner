import {mix} from './api.js';
import {analyze,topContracts,closedCandles,PERIODS,aggregateStats} from './engine.js';
export const FRAME_KEYS={'4H':'fourHour','1H':'hour','15m':'structure','5m':'entry','1m':'micro'};
export class ScanDataError extends Error{constructor(code,message){super(message);this.code=code;}}
const positive=(v,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)throw new ScanDataError('INVALID_FIELD',`${name}无效`);return n;};
export function prepareFrame(response,granularity){
 const period=PERIODS[granularity],time=positive(response.requestTime,'Bitget响应服务器时间');
 if(!Array.isArray(response.data))throw new ScanDataError('INVALID_CANDLES','K线响应格式无效');
 // The cutoff is THIS response's server time, never a later clock that might
 // turn a still-forming candle into an apparently closed one.
 if(response.data.some(r=>!Array.isArray(r)||!Number.isFinite(Number(r[0]))))throw new ScanDataError('INVALID_CANDLES','K线时间无效');
 const rows=response.data.filter(r=>Array.isArray(r)&&Number.isFinite(Number(r[0]))&&+r[0]+period<=time).sort((a,b)=>+a[0]-+b[0]);
 if(rows.length<100)throw new ScanDataError('CANDLE_COUNT_SHORT',`${granularity}仅${rows.length}根已收盘K线，要求100根`);
 const selected=rows.slice(-100);closedCandles(selected,period,time);
 return {granularity,count:100,status:'ok',serverTime:time,receivedAtClientTime:response.receivedAtClientTime,rows:selected,candles:selected.map(r=>({time:Number(r[0]),closeTime:Number(r[0])+period,open:String(r[1]),high:String(r[2]),low:String(r[3]),close:String(r[4]),volume:String(r[5]),...(r[6]!=null?{quoteVolume:String(r[6])}:{})}))};
}
export function validateQuote(quote,serverTime,symbol){
 if(quote?.symbol!==symbol)throw new ScanDataError('QUOTE_SYMBOL','报价币种不匹配');
 const bid=positive(quote.bidPr,'买一'),ask=positive(quote.askPr,'卖一'),timestamp=positive(quote.ts,'报价时间');
 if(ask<bid||Math.abs(serverTime-timestamp)>60000)throw new ScanDataError('QUOTE_STALE','买卖报价异常或超过60秒');
 return {symbol,bid:quote.bidPr,ask:quote.askPr,timestamp,turnover24hUSDT:String(positive(quote.usdtVolume,'24小时成交额')),serverTime};
}
function err(error,scope){return {scope,code:error.code||'API_OR_DATA_ERROR',message:error.message};}
export function dataErrorResult(symbol,errors){return {symbol,status:'数据错误',reason:errors.map(e=>e.message).join('；'),reasons:errors.map(e=>`${e.scope}：${e.message}`),checks:{data:false},score:0,passed:0,total:15,netRR:null};}
export async function scanMarket(api,{fee=.0006,slip=.0005,onProgress=()=>{}}={}){
 const report={schemaVersion:1,source:'Bitget official V2 public market API',productType:'USDT-FUTURES',requestedContracts:40,requestedClosedCandlesPerTimeframe:100,timeframes:Object.keys(PERIODS),status:'running',complete:false,startedAtClientTime:Date.now(),serverTimeStart:null,serverTimeEnd:null,feePerSide:fee,slippagePerSide:slip,selection:{method:'normal USDT perpetual contracts ranked by 24h usdtVolume DESC',rankedContracts:[]},contracts:[],errors:[],semantics:{candleTime:'UTC Unix milliseconds, candle open time; closeTime is exclusive',decimalFields:'OHLCV and API quotes retained as decimal strings',volume:'Bitget base volume; quoteVolume retained when supplied',snapshot:'Only this scan, no persisted cache. Quote is as of its timestamp, not export time.',candles:'Exactly 100 closed candles on success; incomplete frames explicitly marked error.',netRR:'Worst entry in zone; both entry/exit fees and slippage; null means unavailable, never zero.',sequence:'Contracts fetched sequentially. Each frame cutoff uses its own API response requestTime.'}};
 try{
  const time=await api('/api/v2/public/time');report.serverTimeStart=positive(time.serverTime,'Bitget服务器时间');
  const contracts=await api(mix+'contracts',{productType:'USDT-FUTURES'}),tickers=await api(mix+'tickers',{productType:'USDT-FUTURES'});
  const selected=topContracts(tickers,contracts);
  if(selected.length!==40||new Set(selected.map(t=>t.symbol)).size!==40)throw new ScanDataError('POOL_SIZE',`扫描池必须为40个不同合约，实际${selected.length}`);
  report.selection.rankedContracts=selected.map((t,i)=>({rank:i+1,symbol:t.symbol,turnover24hUSDT:String(positive(t.usdtVolume,'筛选成交额')),lastPrice:t.lastPr,rankingTimestamp:t.ts??null}));
  for(const [i,ticker] of selected.entries()){
   const contract={symbol:ticker.symbol,rank:i+1,turnover24hUSDTAtSelection:String(ticker.usdtVolume),status:'running',serverTime:null,frames:{},quote:null,errors:[],result:null};
   const raw={};onProgress({index:i,total:40,symbol:ticker.symbol,report});
   for(const [granularity,key] of Object.entries(FRAME_KEYS)){
    try{
     const response=await api(mix+'candles',{symbol:ticker.symbol,productType:'USDT-FUTURES',granularity,limit:'101'},{includeMetadata:true});
     const frame=prepareFrame(response,granularity);raw[key]=frame.rows;const {rows,...exportFrame}=frame;contract.frames[granularity]=exportFrame;
    }catch(e){const error=err(e,granularity);contract.errors.push(error);contract.frames[granularity]={granularity,status:'error',count:0,candles:[],error};}
   }
   let quote;
   try{const quotes=await api(mix+'ticker',{symbol:ticker.symbol,productType:'USDT-FUTURES'});quote=quotes?.[0];}catch(e){contract.errors.push(err(e,'quote'));}
   try{const clock=await api('/api/v2/public/time');contract.serverTime=positive(clock.serverTime,'Bitget服务器时间');}catch(e){contract.errors.push(err(e,'serverTime'));}
   if(quote&&contract.serverTime){try{contract.quote=validateQuote(quote,contract.serverTime,ticker.symbol);}catch(e){contract.errors.push(err(e,'quote'));}}
   else if(!contract.errors.some(e=>e.scope==='quote'))contract.errors.push(err(new Error('最新报价缺失'),'quote'));
   if(!contract.errors.length){
    const result=analyze({symbol:ticker.symbol,...raw,quote,now:contract.serverTime,fee,slip});
    if(result.checks.data!==true||result.checks.quote===false)contract.errors.push(err(new ScanDataError('ANALYSIS_DATA',result.reasons.join('；')),'analysis'));
    else contract.result={...result,netRR:Number.isFinite(result.rr)?result.rr:result.diagnostics?.computedNetRR??null,netRR2:Number.isFinite(result.rr2)?result.rr2:result.diagnostics?.computedNetRR2??null,analyzedAtServerTime:contract.serverTime};
   }
   contract.status=contract.errors.length?'error':'ok';if(contract.errors.length)contract.result=dataErrorResult(contract.symbol,contract.errors);
   report.contracts.push(contract);onProgress({index:i+1,total:40,symbol:ticker.symbol,report});
  }
  try{const end=await api('/api/v2/public/time');report.serverTimeEnd=positive(end.serverTime,'扫描结束服务器时间');}catch(e){report.errors.push(err(e,'serverTimeEnd'));}
  report.status=report.errors.length||report.contracts.some(c=>c.status==='error')?'partial':'completed';
  report.complete=report.status==='completed';
 }catch(e){report.errors.push(err(e,'scan'));report.status='failed';}
 report.finishedAtClientTime=Date.now();report.summary={selected:report.selection.rankedContracts.length,processed:report.contracts.length,dataErrors:report.contracts.filter(c=>c.status==='error').length,signals:report.contracts.filter(c=>c.result?.status==='可入场').length,observations:report.contracts.filter(c=>c.result?.status==='观察').length,waiting:report.contracts.filter(c=>c.result?.status==='等待').length};
 report.filters=aggregateStats(report.contracts.map(c=>c.result));return report;
}
export function makeExport(report,clientTime=Date.now()){
 if(!report||report.status==='running')throw new ScanDataError('NOT_READY','扫描尚未结束，不能导出');
 const clone=JSON.parse(JSON.stringify(report));const reference=report.serverTimeEnd??report.serverTimeStart;
 const estimatedServerTime=reference==null?null:reference+(clientTime-report.finishedAtClientTime);
 clone.export={exportedAtClientTime:clientTime,estimatedServerTimeAtExport:estimatedServerTime,note:'本次扫描历史快照，报价和信号只在各自时间点有效；导出不重新获取行情。',incomplete:!report.complete};
 for(const c of clone.contracts){const r=c.result;if(r){r.expiredAtExport=r.expiresAt!=null&&estimatedServerTime!=null&&estimatedServerTime>=r.expiresAt;r.statusAtExport=r.expiredAtExport?'观察（确认已过期）':r.status;}}
 clone.entryCandidates=clone.contracts.filter(c=>c.result?.status==='可入场'&&!c.result?.expiredAtExport).map(c=>({symbol:c.symbol,...c.result}));
 clone.observationCandidates=clone.contracts.filter(c=>c.result?.status==='观察'||c.result?.expiredAtExport).sort((a,b)=>b.result.score-a.result.score).map(c=>({symbol:c.symbol,...c.result}));
 clone.closestCandidates=clone.observationCandidates.slice(0,5);return clone;
}
export function serializeExport(report,clientTime){return JSON.stringify(makeExport(report,clientTime),null,2);}
export function downloadJSON(content,filename,{document:doc=document,URL:url=URL,Blob:BlobClass=Blob,setTimeout:schedule=setTimeout}={}){
 const blob=new BlobClass([content],{type:'application/json;charset=utf-8'}),href=url.createObjectURL(blob),a=doc.createElement('a');a.href=href;a.download=filename;doc.body.append(a);try{a.click();}finally{a.remove();schedule(()=>url.revokeObjectURL(href),60000);}return blob.size;
}
