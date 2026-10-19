// Server HTTP mínimo: não contata serviços autenticados do TSE nem armazena dados pessoais.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=__dirname,DATA=path.join(ROOT,'data','alteracoes-2026.json');
const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/data/alteracoes-2026.json':'data/alteracoes-2026.json'};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
function load(){return JSON.parse(fs.readFileSync(DATA,'utf8'));}
function isMonitored(data,uf){return Array.isArray(data.estados_monitorados)&&data.estados_monitorados.includes(uf);}
function query(data,q){
 const monitored=isMonitored(data,q.uf);
 const matching=monitored?data.registros.filter(r=>isMonitored(data,r.uf)&&r.uf===q.uf&&normalized(r.cidade)===normalized(q.cidade)&&Number(r.zona)===q.zona):[];
 return {registros:q.secao===null?matching:matching.filter(r=>r.secoes.includes(q.secao)),totalZona:matching.length,cobertura:data.cobertura,data_base:data.data_base,estados_monitorados:data.estados_monitorados,estado_monitorado:monitored};
}
function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function handler(req,res){const url=new URL(req.url||'/',`http://localhost`);
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
 if(req.method!=='GET')return send(res,405,{erro:'Método não permitido'});
 if(url.pathname==='/api/health'){const d=load();return send(res,200,{ok:true,cobertura:d.cobertura,atualizacao:d.data_base,grupos:d.registros.length,estados_monitorados:d.estados_monitorados,estados_com_registros:[...new Set(d.registros.map(r=>r.uf))]});}
 if(url.pathname==='/api/consulta'){
  const uf=(url.searchParams.get('uf')||'').toUpperCase(),cidade=url.searchParams.get('cidade')||'',zona=Number(url.searchParams.get('zona')),secaoRaw=url.searchParams.get('secao');
  if(!/^[A-Z]{2}$/.test(uf)||cidade.length<2||cidade.length>90||!Number.isInteger(zona)||zona<1||zona>999||(secaoRaw!==null&&(!/^\d{1,4}$/.test(secaoRaw)||Number(secaoRaw)<1)))return send(res,400,{erro:'Filtros inválidos'});
  const data=load();if(!isMonitored(data,uf))return send(res,422,{erro:'Estado fora do escopo. A consulta atende apenas SP, MG, RJ e BA.',estados_monitorados:data.estados_monitorados});
  return send(res,200,query(data,{uf,cidade,zona,secao:secaoRaw===null?null:Number(secaoRaw)}));
 }
 let file=allowed[url.pathname];
 if(!file && url.pathname.startsWith('/assets/')){
  const candidate=url.pathname.slice(1);
  if(!candidate.split('/').includes('..')&&/\.(svg|png)$/.test(candidate))file=candidate;
 }
 if(!file)return send(res,404,{erro:'Rota não encontrada'});
 const abs=path.resolve(ROOT,file);
 if(!abs.startsWith(ROOT+path.sep))return send(res,403,{erro:'Negado'});
 fs.readFile(abs,(err,buffer)=>{
  if(err)return send(res,404,{erro:'Arquivo não encontrado'});
  res.writeHead(200,{'Content-Type':mime[path.extname(abs)]||'application/octet-stream','Cache-Control':file.endsWith('.json')?'no-store':'public,max-age=3600'});res.end(buffer);
 });
}
if(require.main===module){const port=Number(process.env.PORT)||3000;http.createServer(handler).listen(port,'0.0.0.0',()=>console.log(`Onde Voto?: http://localhost:${port}`));}
module.exports={handler,query,normalized,load,isMonitored};
