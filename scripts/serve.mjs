import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../web/',import.meta.url);
const types={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript'};
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const name=path==='/'?'index.html':path.slice(1);if(!['index.html','style.css','app.js','engine.js','api.js','scan.js','risk.js'].includes(name)){res.writeHead(404).end();return;}const body=await readFile(fileURLToPath(new URL(name,root)));res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-store'}).end(body);}catch{res.writeHead(500).end('服务错误');}}).on('error',e=>{console.error(`本地服务无法启动：${e.code} ${e.message}`);process.exitCode=1;}).listen(8080,'0.0.0.0',()=>console.log('http://localhost:8080'));
