import assert from 'node:assert/strict';
import {webkit,devices} from 'playwright';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://ksjlh011-creator.github.io/bitget-perp-scanner/';
const output='acceptance-artifacts',testEquity=1000;
await mkdir(output,{recursive:true});
const report={site:origin,commit:process.env.GITHUB_SHA??null,startedAt:new Date().toISOString(),browser:'Playwright WebKit / iPhone 13 profile (emulation)',realIphoneSafariVerified:false,testEquityUSDT:testEquity,testEquityNote:'Explicit acceptance-test input, not the user account balance',marketSource:'Real Bitget V2 public API; no intercepted, fabricated or fixture responses',assets:[],apiStatusCounts:{},requestFailures:[],pageErrors:[],unobservedCases:[]};
const browser=await webkit.launch();
const context=await browser.newContext({...devices['iPhone 13'],acceptDownloads:true,serviceWorkers:'block'});
const page=await context.newPage();
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
let apiRequests=0;
page.on('request',r=>{if(r.url().startsWith('https://api.bitget.com/'))apiRequests++;});
page.on('response',r=>{if(r.url().startsWith('https://api.bitget.com/'))report.apiStatusCounts[r.status()]=(report.apiStatusCounts[r.status()]||0)+1;});
try{
 const response=await page.goto(`${origin}?acceptance=${Date.now()}`,{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
 await page.locator('#scan').waitFor({state:'visible'});
 for(const name of await readdir('web')){
  const res=await context.request.get(`${origin}${name}?acceptance=${Date.now()}`,{timeout:30000});assert.equal(res.status(),200,`asset ${name}`);
  const actual=createHash('sha256').update(await res.body()).digest('hex');
  const expected=createHash('sha256').update(await readFile(`web/${name}`)).digest('hex');assert.equal(actual,expected,`published asset differs: ${name}`);report.assets.push({name,sha256:actual});
 }
 assert.equal(await page.locator('#export').isDisabled(),true);
 assert.equal(await page.locator('#equity').inputValue(),'');
 await page.locator('#equity').fill('0');await page.locator('#scan').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('账户权益请输入'));
 assert.equal(apiRequests,0,'invalid equity must not trigger API scan');report.invalidEquityRejectedBeforeNetwork=true;
 await page.locator('#equity').fill(String(testEquity));await page.locator('#buffer').selectOption('0.5');
 await page.locator('#scan').click();assert.equal(await page.locator('#equity').isDisabled(),true);assert.equal(await page.locator('#export').isDisabled(),true);
 await page.waitForFunction(()=>!document.querySelector('#scan').disabled,{},{timeout:600000});
 report.scanStatus=await page.locator('#status').textContent();assert.match(report.scanStatus,/40个合约扫描完成/);
 assert.equal(await page.locator('#count').textContent(),'40');assert.equal(await page.locator('#export').isDisabled(),false);
 assert.equal(await page.locator('#equity').isDisabled(),false);assert.equal(await page.locator('#results article').count(),40);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'iPhone viewport must not overflow horizontally');
 await page.screenshot({path:`${output}/iphone-profile-scan.png`});
 const downloadEvent=page.waitForEvent('download',{timeout:30000});await page.locator('#export').click();const download=await downloadEvent;
 assert.equal(await download.failure(),null);report.filename=download.suggestedFilename();assert.match(report.filename,/^bitget-scan-complete-.*\.json$/);
 const saved=`${output}/${report.filename}`;await download.saveAs(saved);const exported=JSON.parse(await readFile(saved,'utf8'));
 assert.equal(exported.complete,true);assert.equal(exported.contracts.length,40);assert.equal(exported.riskSettings.accountEquity,testEquity);assert.equal(exported.riskSettings.stopBuffer,.5);
 assert.equal(exported.summary.dataErrors,0);assert.equal(exported.export.incomplete,false);
 let candles=0,stopChecks=0,positionChecks=0;
 const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-10,Math.abs(expected)*1e-9),label);
 for(const c of exported.contracts){
  assert.equal(c.status,'ok');assert.equal(c.errors.length,0);assert.ok(c.quote.bid&&c.quote.ask&&c.serverTime);
  for(const [key,f] of Object.entries(c.frames)){assert.ok(['4H','1H','15m','5m','1m'].includes(key));assert.equal(f.candles.length,100);for(const row of f.candles)assert.ok(row.closeTime<=f.serverTime);candles+=f.candles.length;}
  const r=c.result,d=r.stopDetails;
  if(d?.anchor){const side=r.direction==='做多'?1:-1;near(d.stop,d.anchor.price-side*d.atr*d.bufferMultiple,'stop = structure +/- ATR buffer');assert.deepEqual(d.windows.map(w=>w.bars),[6,10,15]);stopChecks++;}
  const p=r.positionRisk;
  if(p?.quantity!=null){assert.ok(p.plannedLoss<=testEquity*.01);assert.ok(p.maxZoneNotional<=testEquity);near(p.plannedLoss,p.quantity*p.unitPlannedLoss,'cost-inclusive planned loss');positionChecks++;}
  if(r.status==='可入场'){assert.ok(Object.values(r.checks).every(v=>v===true));assert.ok(r.netRR>=2&&r.netRR2>=2);assert.ok(p?.quantity>0);}
 }
 assert.equal(candles,20000);
 assert.ok(exported.entryCandidates.every(r=>r.status==='可入场'&&!r.expiredAtExport));
 assert.ok(exported.focusedCandidates.every(r=>r.statusAtExport==='重点观察'&&r.status!=='可入场'));
 report.export={bytes:Buffer.byteLength(await readFile(saved)),contracts:40,candles,serverTimeStart:exported.serverTimeStart,serverTimeEnd:exported.serverTimeEnd};
 report.summary=exported.summary;report.stopCalculationChecks=stopChecks;report.positionCalculationChecks=positionChecks;report.realDownloadVerified=true;
 if(!exported.summary.signals)report.unobservedCases.push('No live confirmed entry signal during acceptance; positive entry card not forced or fabricated.');
 if(!exported.summary.focusedObservations)report.unobservedCases.push('No live focus-watch candidate during acceptance.');
 if(!stopChecks)report.unobservedCases.push('No live 15m setup with a structural stop; real stop display unavailable in this market sample.');
 if(!positionChecks)report.unobservedCases.push('No live valid position size during acceptance; sizing math is covered separately by unit tests.');
 const riskCard=page.locator('#results article').filter({hasText:'5分钟结构止损与风险依据'}).first();
 if(await riskCard.count()){await riskCard.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/iphone-profile-risk.png`});report.riskDetailVisible=true;}
 assert.equal(report.pageErrors.length,0,`browser errors: ${report.pageErrors.join(';')}`);
 report.automatedAcceptancePassed=true;
}catch(e){report.automatedAcceptancePassed=false;report.error=e.stack;process.exitCode=1;await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${output}/mobile-acceptance.json`,JSON.stringify(report,null,2));console.log('MOBILE_ACCEPTANCE',JSON.stringify(report));await browser.close();}
