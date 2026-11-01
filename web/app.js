import {createAPI,mix,candles} from './api.js';
import {analyze,topContracts,aggregateStats} from './engine.js';
const $=s=>document.querySelector(s),api=createAPI();
const fmt=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:8});
function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
let results=[],offset=0,expiryTimer;
const current=r=>r.status==='可入场'&&Date.now()+offset>=r.expiresAt?{...r,status:'观察',reasons:['入场确认已超过有效期，请重新扫描',...r.reasons]}:r;
function card(result){
 const r=current(result),el=text('article','','card'),row=text('div','','row');row.append(text('span',r.symbol.replace(/USDT$/,' / USDT'),'coin'),text('span',r.status==='可入场'?`${r.direction} · 可入场`:r.status,r.status==='可入场'?(r.direction==='做多'?'long':'short'):'wait'));el.append(row);
 el.append(text('p',`${r.kind||'形态待确认'} · 通过 ${r.passed||0}/${r.total||15} 项`,'reason'));
 if(r.status==='可入场'){
  const grid=text('div','','prices');for(const [k,v] of [['入场区间',`${fmt(r.entryLow)} – ${fmt(r.entryHigh)}`],['结构止损',fmt(r.stop)],['第一止盈（50%）',fmt(r.target1)],['第二止盈（50%）',fmt(r.target2)],['第一止盈净RR',`${r.rr.toFixed(2)} : 1`],['第二止盈净RR',`${r.rr2.toFixed(2)} : 1`]]){const c=text('div','');c.append(text('small',k),text('strong',v));grid.append(c);}el.append(grid,text('p',`最差区间价已扣双边费用 · 1分钟确认 ${new Date(r.signalTime).toLocaleTimeString('zh-CN')} · ${new Date(r.expiresAt).toLocaleTimeString('zh-CN')}过期 · 回放持仓上限120分钟`,'reason'));
 }else el.append(text('p',r.reasons?.join('；')||r.reason,'reason'));
 const details=text('details',''),summary=text('summary','逐项过滤结果');details.append(summary);
 for(const [key,count] of Object.entries(aggregateStats([r]))){const state=count.passed?'通过':count.failed?'未通过':'未评估';details.append(text('p',`${state} · ${count.label}`,'reason'));}el.append(details);return el;
}
function paint(){
 $('#results').replaceChildren(...results.map(card));
 const active=results.map(current);$('#signals').textContent=active.filter(r=>r.status==='可入场').length;
 $('#candidates').replaceChildren();const candidates=active.filter(r=>r.status==='观察').sort((a,b)=>b.score-a.score).slice(0,5);
 if(!candidates.length)$('#candidates').append(text('p','暂无具备15分钟结构且大周期同向的观察候选。','reason'));
 for(const r of candidates)$('#candidates').append(text('p',`${r.symbol} · 观察 · ${r.passed}/${r.total} 项 · ${(r.reasons||[]).join('；')}`,'reason'));
 const table=$('#filters');table.replaceChildren();const tr=text('tr','');for(const title of ['过滤条件','通过','失败','未评估'])tr.append(text('th',title));table.append(tr);
 for(const c of Object.values(aggregateStats(results))){const row=text('tr','');for(const value of [c.label,c.passed,c.failed,c.skipped])row.append(text('td',String(value)));table.append(row);}
 clearTimeout(expiryTimer);const upcoming=results.filter(r=>r.status==='可入场'&&r.expiresAt>Date.now()+offset).map(r=>r.expiresAt-Date.now()-offset);if(upcoming.length)expiryTimer=setTimeout(paint,Math.min(...upcoming)+30);
}
$('#scan').addEventListener('click',async()=>{
 const fee=Number($('#fee').value)/100,slip=Number($('#slip').value)/100;
 if(!$('#fee').value||!$('#slip').value||![fee,slip].every(n=>Number.isFinite(n)&&n>=0&&n<=.01)){$('#status').textContent='请输入0至1%之间的单边费用。';return;}
 clearTimeout(expiryTimer);results=[];paint();$('#scan').disabled=true;$('#fee').disabled=true;$('#slip').disabled=true;$('#count').textContent='—';$('#time').textContent='扫描中';$('#status').textContent='正在获取真实服务器时间、合约列表及成交额排名…';let failures=0;
 try{
  const start=Date.now(),clock=await api('/api/v2/public/time');offset=Number(clock.serverTime)-(start+Date.now())/2;if(!Number.isFinite(offset))throw Error('服务器时间无效');
  const contracts=await api(mix+'contracts',{productType:'USDT-FUTURES'}),tickers=await api(mix+'tickers',{productType:'USDT-FUTURES'}),selected=topContracts(tickers,contracts);if(selected.length!==40)throw Error(`有效扫描池只有${selected.length}个`);$('#count').textContent=40;
  for(const [i,ticker] of selected.entries()){
   $('#status').textContent=`正在扫描 ${i+1}/40 · ${ticker.symbol} · 五周期已收盘K线`;
   let result;try{
    const fourHour=await candles(api,ticker.symbol,'4H'),hour=await candles(api,ticker.symbol,'1H'),structure=await candles(api,ticker.symbol,'15m'),entry=await candles(api,ticker.symbol,'5m'),micro=await candles(api,ticker.symbol,'1m'),quotes=await api(mix+'ticker',{symbol:ticker.symbol,productType:'USDT-FUTURES'});
    result=analyze({symbol:ticker.symbol,fourHour,hour,structure,entry,micro,quote:quotes[0]||{},now:Date.now()+offset,fee,slip});if(result.checks.data===false)failures++;
   }catch(e){failures++;result={symbol:ticker.symbol,status:'等待',reason:`数据不可用：${e.message}`,reasons:[`数据不可用：${e.message}`],checks:{data:false},score:0};}
   results.push(result);paint();
  }
  $('#status').textContent=`40个合约扫描完成，数据异常${failures}个。观察不是入场建议；已过期信号自动降为观察，不自动获取行情。`;$('#time').textContent=new Date().toLocaleString('zh-CN');
 }catch(e){$('#status').textContent=e.message;$('#time').textContent='扫描失败';if(!results.length)$('#results').append(text('div','等待 · 无可用真实行情','empty'));}
 finally{$('#scan').disabled=false;$('#fee').disabled=false;$('#slip').disabled=false;}
});
