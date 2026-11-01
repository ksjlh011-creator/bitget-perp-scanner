import {webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('acceptance-artifacts',{recursive:true});
const browser=await webkit.launch(),context=await browser.newContext({...devices['iPhone 13']}),page=await context.newPage();
const report={site:'https://ksjlh011-creator.github.io/bitget-perp-scanner/',type:'Layout diagnostic on published page, not full scan acceptance',realIphoneSafariVerified:false,phases:[],probes:[]};
const snapshot=()=>page.evaluate(()=>({innerWidth,innerHeight,scrollX,visual:visualViewport?{width:visualViewport.width,offsetLeft:visualViewport.offsetLeft,scale:visualViewport.scale}:null,root:{client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth},body:{client:document.body.clientWidth,scroll:document.body.scrollWidth},elements:[...document.querySelectorAll('body *')].filter(el=>el.scrollWidth>el.clientWidth+1||el.getBoundingClientRect().left<0||el.getBoundingClientRect().right>innerWidth+1).slice(0,60).map(el=>({tag:el.tagName,id:el.id,cls:el.className,client:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:getComputedStyle(el).overflowX,display:getComputedStyle(el).display,text:el.textContent.slice(0,70)}))}));
try{
 await page.goto(report.site+'?layout='+Date.now(),{waitUntil:'networkidle'});report.phases.push({phase:'initial',data:await snapshot()});
 await page.locator('#equity').fill('1000');await page.locator('#scan').click();await page.waitForFunction(()=>document.querySelectorAll('#results article').length>0,{},{timeout:60000});report.phases.push({phase:'real first contract, scan still running',data:await snapshot()});
 for(const [name,css] of Object.entries({table:'table{table-layout:fixed}th:first-child{min-width:0;width:55%}td,th{overflow-wrap:anywhere}',marker:'summary{list-style-position:inside}',details:'details{min-width:0;max-width:100%}',textAdjust:'html{-webkit-text-size-adjust:100%}',grid:'#results{display:block}',controls:'.controls{display:block}',tableContain:'.table-scroll{width:100%;max-width:100%;contain:inline-size}'})){
  const style=await page.addStyleTag({content:css});report.probes.push({name,data:await snapshot()});await style.evaluate(el=>el.remove());
 }
 for(const selector of ['header','.controls','.hero','#results','.table-scroll','main>details','footer']){const nodes=page.locator(selector);const previous=await nodes.evaluateAll(els=>els.map(el=>el.style.display));await nodes.evaluateAll(els=>els.forEach(el=>el.style.display='none'));report.probes.push({hide:selector,data:await snapshot()});await nodes.evaluateAll((els,prev)=>els.forEach((el,i)=>el.style.display=prev[i]),previous);}
 await page.screenshot({path:'acceptance-artifacts/layout-diagnostic.png'});
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await writeFile('acceptance-artifacts/layout-diagnostic.json',JSON.stringify(report,null,2));console.log('LAYOUT_DIAGNOSTIC',JSON.stringify(report));await browser.close();}
