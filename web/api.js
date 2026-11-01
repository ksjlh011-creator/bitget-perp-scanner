const BASE='https://api.bitget.com';
let tail=Promise.resolve();
// Global request queue keeps all endpoints below 5 requests/sec, including retries.
export function createAPI(fetcher=fetch){
  return async function request(path,params={},options={}){
    let error;
    for(let attempt=0;attempt<3;attempt++){
      const turn=tail.then(()=>new Promise(r=>setTimeout(r,220)));tail=turn.catch(()=>{});await turn;
      try{
        const response=await fetcher(`${BASE}${path}?${new URLSearchParams(params)}`,{signal:AbortSignal.timeout(12000),cache:'no-store'});
        if(!response.ok)throw Error(`HTTP ${response.status}`);
        const body=await response.json();
        if(body.code!=='00000')throw Error(`Bitget ${body.code}: ${body.msg||'请求失败'}`);
        if(body.data==null)throw Error('API返回空数据');
        return options.includeMetadata?{data:body.data,requestTime:Number(body.requestTime),receivedAtClientTime:Date.now()}:body.data;
      }catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,500*2**attempt));}
    }
    throw Error(`行情请求失败：${error.message}。请检查网络、地区限制或浏览器跨域策略。`);
  };
}
export const mix='/api/v2/mix/market/';
export async function candles(api,symbol,granularity){return api(mix+'candles',{symbol,productType:'USDT-FUTURES',granularity,limit:'200'});}
