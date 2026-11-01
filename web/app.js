import {createAPI,mix,candles} from './api.js';
import {analyze,topContracts} from './engine.js';
const $=s=>document.querySelector(s),api=createAPI();
const fmt=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:8});
function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
function render(result){
  const card=text('article','','card'),row=text('div','','row');
  row.append(text('span',result.symbol.replace(/USDT$/,' / USDT'),'coin'),text('span',result.status==='信号'?result.direction:'等待',result.status==='信号'?(result.direction==='做多'?'long':'short'):'wait'));card.append(row);
  if(result.status!=='信号')card.append(text('p',result.reason,'reason'));
  else{card.append(text('p',`${result.kind} · 信号收盘 ${new Date(result.signalTime).toLocaleTimeString('zh-CN')}`,'reason'));const grid=text('div','','prices');for(const [k,v] of [['参考入场',fmt(result.price)],['止损',fmt(result.stop)],['止盈',fmt(result.target)],['净盈亏比',`${result.rr.toFixed(2)} : 1`]]){const cell=text('div','');cell.append(text('small',k),text('strong',v));grid.append(cell);}card.append(grid);}
  $('#results').append(card);
}
$('#scan').addEventListener('click',async()=>{
  const fee=Number($('#fee').value)/100,slip=Number($('#slip').value)/100;
  if(!$('#fee').value||!$('#slip').value||![fee,slip].every(n=>Number.isFinite(n)&&n>=0&&n<=.01)){$('#status').textContent='请输入0至1%之间的单边费用。';return;}
  $('#scan').disabled=true;$('#fee').disabled=true;$('#slip').disabled=true;$('#results').replaceChildren();$('#count').textContent='—';$('#signals').textContent='0';$('#time').textContent='扫描中';$('#status').textContent='正在获取服务器时间、合约列表和成交额排名…';
  let confirmed=0,failures=0;
  try{
    const start=Date.now(),clock=await api('/api/v2/public/time'),offset=Number(clock.serverTime)-(start+Date.now())/2;
    if(!Number.isFinite(offset))throw Error('服务器时间无效');
    const contracts=await api(mix+'contracts',{productType:'USDT-FUTURES'}),tickers=await api(mix+'tickers',{productType:'USDT-FUTURES'});
    const selected=topContracts(tickers,contracts);if(selected.length!==40)throw Error(`有效合约只有${selected.length}个，无法组成前40扫描池`);
    $('#count').textContent=selected.length;
    for(const [i,ticker] of selected.entries()){
      $('#status').textContent=`正在扫描 ${i+1}/40 · ${ticker.symbol}`;
      let result;
      try{
        const hour=await candles(api,ticker.symbol,'1H'),structure=await candles(api,ticker.symbol,'15m'),entry=await candles(api,ticker.symbol,'5m');
        const quotes=await api(mix+'ticker',{symbol:ticker.symbol,productType:'USDT-FUTURES'}),quote=quotes[0];
        result=analyze({symbol:ticker.symbol,hour,structure,entry,quote:quote||{},now:Date.now()+offset,fee,slip});
      }catch(e){failures++;result={symbol:ticker.symbol,status:'等待',reason:`数据不可用：${e.message}`};}
      if(result.status==='信号')confirmed++;render(result);$('#signals').textContent=confirmed;
    }
    $('#status').textContent=`扫描完成：${confirmed} 个确认信号，${40-confirmed} 个等待${failures?`（${failures} 个数据异常）`:''}。结果随市场变化，请勿使用过期价位。`;
    $('#time').textContent=new Date().toLocaleString('zh-CN');
  }catch(e){$('#status').textContent=e.message;$('#time').textContent='扫描失败';$('#results').append(text('div','等待 · 无可用实时数据，请检查网络后重新扫描。','empty'));}
  finally{$('#scan').disabled=false;$('#fee').disabled=false;$('#slip').disabled=false;}
});
