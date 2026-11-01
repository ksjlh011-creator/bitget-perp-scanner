import {createAPI} from './api.js';
import {scanMarket,serializeExport,downloadJSON} from './scan.js';
import {aggregateStats} from './engine.js';
const $=s=>document.querySelector(s),api=createAPI();
const fmt=n=>Number(n).toLocaleString('en-US',{maximumSignificantDigits:8});
function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
let results=[],offset=0,expiryTimer,scanReport=null;
const current=r=>['可入场','重点观察'].includes(r.status)&&Date.now()+offset>=r.expiresAt?{...r,status:'观察',reasons:['入场确认已超过有效期，请重新扫描',...r.reasons]}:r;
function card(result){
 const r=current(result),el=text('article','','card'),row=text('div','','row');row.append(text('span',r.symbol.replace(/USDT$/,' / USDT'),'coin'),text('span',r.status==='可入场'?`${r.direction} · 可入场`:r.status,r.status==='可入场'?(r.direction==='做多'?'long':'short'):r.status==='数据错误'?'error':r.status==='重点观察'?'focused':'wait'));el.append(row);
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
 $('#candidates').replaceChildren();const candidates=active.filter(r=>['观察','重点观察'].includes(r.status)).sort((a,b)=>Number(b.status==='重点观察')-Number(a.status==='重点观察')||b.score-a.score).slice(0,5);
 if(!candidates.length)$('#candidates').append(text('p','暂无具备15分钟结构且大周期同向的观察候选。','reason'));
 for(const r of candidates)$('#candidates').append(text('p',`${r.symbol} · ${r.status} · ${r.passed}/${r.total} 项 · ${(r.reasons||[]).join('；')}`,'reason'));
 const table=$('#filters');table.replaceChildren();const tr=text('tr','');for(const title of ['过滤条件','通过','失败','未评估'])tr.append(text('th',title));table.append(tr);
 for(const c of Object.values(aggregateStats(results))){const row=text('tr','');for(const value of [c.label,c.passed,c.failed,c.skipped])row.append(text('td',String(value)));table.append(row);}
 clearTimeout(expiryTimer);const upcoming=results.filter(r=>['可入场','重点观察'].includes(r.status)&&r.expiresAt>Date.now()+offset).map(r=>r.expiresAt-Date.now()-offset);if(upcoming.length)expiryTimer=setTimeout(paint,Math.min(...upcoming)+30);
}
$('#scan').addEventListener('click',async()=>{
 const fee=Number($('#fee').value)/100,slip=Number($('#slip').value)/100;
 if(!$('#fee').value||!$('#slip').value||![fee,slip].every(n=>Number.isFinite(n)&&n>=0&&n<=.01)){$('#status').textContent='请输入0至1%之间的单边费用。';return;}
 clearTimeout(expiryTimer);scanReport=null;$('#export').disabled=true;$('#export-status').textContent='扫描结束后可导出本次数据；不读取历史缓存。';results=[];paint();$('#scan').disabled=true;$('#fee').disabled=true;$('#slip').disabled=true;$('#count').textContent='—';$('#time').textContent='扫描中';$('#status').textContent='正在获取真实服务器时间、合约列表及成交额排名…';
 try{
  scanReport=await scanMarket(api,{fee,slip,onProgress:({index,total,symbol,report})=>{
   $('#status').textContent=`正在扫描 ${index}/${total} · ${symbol} · 五周期各100根已收盘K线`;
   results=report.contracts.map(c=>c.result);$('#count').textContent=report.selection.rankedContracts.length;
   const latest=report.contracts.at(-1)?.serverTime;if(latest)offset=latest-Date.now();paint();
  }});
  results=scanReport.contracts.map(c=>c.result);paint();
  const latest=scanReport.contracts.filter(c=>c.serverTime!=null).at(-1);const clock=scanReport.serverTimeEnd??latest?.serverTime??scanReport.serverTimeStart;if(clock)offset=scanReport.serverTimeEnd!=null?clock-Date.now():clock-(latest?.serverTimeReceivedAtClientTime??scanReport.startedAtClientTime);
  if(scanReport.complete){$('#status').textContent='40个合约扫描完成，20,000根已收盘K线已就绪。观察不是入场建议。';$('#export-status').textContent='可导出本次完整JSON：40个合约、五周期K线、报价和逐项策略结果。';}
  else{$('#status').textContent=`扫描${scanReport.status==='failed'?'失败':'存在数据错误'}：${scanReport.summary.dataErrors}个合约异常。${scanReport.errors.map(e=>e.message).join('；')} 数据异常不会归为正常等待。`;$('#export-status').textContent='本次数据不完整。仍可导出诊断JSON，其中明确包含错误和缺失标记。';}
  $('#time').textContent=scanReport.complete?new Date(scanReport.serverTimeEnd).toLocaleString('zh-CN'):'数据不完整';$('#export').disabled=false;
 }catch(e){$('#status').textContent=`扫描程序错误：${e.message}`;$('#time').textContent='扫描失败';$('#export').disabled=true;}
 finally{$('#scan').disabled=false;$('#fee').disabled=false;$('#slip').disabled=false;}
});
$('#export').addEventListener('click',()=>{
 try{
  const content=serializeExport(scanReport),stamp=new Date(scanReport.serverTimeStart??scanReport.startedAtClientTime).toISOString().replace(/[:.]/g,'-');
  const filename=`bitget-scan-${scanReport.complete?'complete':'INCOMPLETE'}-${stamp}.json`;
  downloadJSON(content,filename);
  $('#export-status').textContent=`已发起下载：${filename}。iPhone请点Safari下载箭头，或在“文件→下载项”查找；若打开了JSON预览，点分享→存储到文件。数据为扫描时快照。`;
 }catch(e){$('#export-status').textContent=`导出失败：${e.message}`;}
});
