const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {load,query,handler,normalized,isMonitored}=require('../server.js');
const data=load();
const expected=['SP','MG','RJ','BA'];
test('os quatro estados solicitados compõem o escopo',()=>{
 assert.deepEqual(data.estados_monitorados,expected);
 assert.deepEqual(expected.filter(uf=>isMonitored(data,uf)),expected);
 for(const uf of ['AL','PR','DF','ES','AC'])assert.equal(isMonitored(data,uf),false);
});
test('base contém só informações com fonte, zona e seção e nada de AL',()=>{
 assert.equal(data.cobertura,'parcial');
 assert.ok(data.registros.length>0);
 assert.ok(data.registros.every(r=>expected.includes(r.uf)&&r.fonte?.url.startsWith('https://')&&r.secoes.length));
 assert.equal(data.registros.some(r=>r.uf==='AL'),false);
});
test('consulta RJ 188 mantém as cinco seções confirmadas do TRE-RJ',()=>{
 for(const secao of [123,124,125,126,127]){
  const r=query(data,{uf:'RJ',cidade:'Rio de Janeiro',zona:188,secao});
  assert.equal(r.registros.length,1);
  assert.equal(r.registros[0].status,'confirmado_tre');
  assert.match(r.registros[0].novo.endereco,/Irapuá/);
 }
});
test('normalização de acentos continua funcionando',()=>{
 assert.equal(normalized('SÃO  PAULO '),'sao paulo');
 assert.equal(normalized('Brás de Pina'),'bras de pina');
});
test('zona existente com seção fora do registro não é classificada como sem alteração',()=>{
 const r=query(data,{uf:'RJ',cidade:'Rio de Janeiro',zona:188,secao:999});
 assert.equal(r.registros.length,0);assert.equal(r.totalZona,1);assert.equal(r.cobertura,'parcial');
});
test('SP, MG e BA entram na validação sem resultados inventados',()=>{
 for(const [uf,cidade] of [['SP','São Paulo'],['MG','Belo Horizonte'],['BA','Salvador']]){
  const r=query(data,{uf,cidade,zona:10,secao:null});
  assert.equal(r.estado_monitorado,true);assert.deepEqual(r.registros,[]);assert.equal(r.cobertura,'parcial');
 }
});
test('consulta direta a AL não retorna dados, independentemente da cidade',()=>{
 const r=query(data,{uf:'AL',cidade:'Traipu',zona:20,secao:99});
 assert.equal(r.estado_monitorado,false);assert.equal(r.registros.length,0);
});
test('API limita estados e expõe o escopo sem abrir endpoints fora da lista',async()=>{
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const health=await fetch(`${base}/api/health`);assert.equal(health.status,200);
  const h=await health.json();assert.deepEqual(h.estados_monitorados,expected);assert.deepEqual(h.estados_com_registros,['RJ']);
  const bad=await fetch(`${base}/api/consulta?uf=AL&cidade=Traipu&zona=20&secao=99`);assert.equal(bad.status,422);
  const response=await bad.json();assert.match(response.erro,/fora do escopo/);
  const okay=await fetch(`${base}/api/consulta?uf=SP&cidade=S%C3%A3o%20Paulo&zona=345`);assert.equal(okay.status,200);
  const sp=await okay.json();assert.deepEqual(sp.registros,[]);assert.equal(sp.estado_monitorado,true);
  const rj=await fetch(`${base}/api/consulta?uf=RJ&cidade=Rio%20de%20Janeiro&zona=188&secao=123`);assert.equal(rj.status,200);assert.equal((await rj.json()).registros.length,1);
  const invalid=await fetch(`${base}/api/consulta?uf=BR&cidade=Alguma&zona=0`);assert.equal(invalid.status,400);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('interface só inclui os quatro estados e valida a base estática',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.match(source,/const UFS=\{BA:'Bahia',MG:'Minas Gerais',RJ:'Rio de Janeiro',SP:'São Paulo'\}/);
 assert.match(source,/Base fora do escopo autorizado/);
 assert.match(source,/Alteração não verificada nesta base/);
 assert.doesNotMatch(source,/AL:'Alagoas'/);
});
test('CSV com outro estado é rejeitado antes de gerar importação revisável',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voto-csv-'));
 const f=path.join(dir,'fora-escopo.csv');
 const h='uf;cidade;zona;secoes;anterior;endereco_anterior;novo;endereco_novo;fonte_url;fonte_orgao;data_fonte;status;regiao';
 fs.writeFileSync(f,`${h}\nAL;Traipu;20;99;A;Rua A;B;Rua B;https://www.tre-al.jus.br/;TRE-AL;2026-10-18;confirmado_tre;Centro\n`);
 try{
  const run=spawnSync(process.execPath,[path.join(__dirname,'../scripts/importar-csv.js'),f],{encoding:'utf8'});
  assert.notEqual(run.status,0);assert.match(run.stderr,/fora do escopo/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
