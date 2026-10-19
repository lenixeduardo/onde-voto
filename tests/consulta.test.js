const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const os=require('node:os');
const vm=require('node:vm');
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
 assert.match(source,/Nenhum endereço nesta lista/);
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

test('campo Cidade usa select, sem digitação livre ou datalist geral do IBGE',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.match(html,/<select id="cidade" name="cidade" required/);
 assert.doesNotMatch(html,/<input id="cidade"/);
 assert.doesNotMatch(html,/<datalist id="lista-cidades"/);
 assert.doesNotMatch(app,/servicodados\.ibge\.gov\.br/);
 assert.match(app,/city\.addEventListener\('change'/);
});
test('lista somente municípios com seções alteradas e fonte documental por UF',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const source=app.match(/function changedCities\(data,uf\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source,'changedCities deve existir no frontend');
 const context=vm.createContext({normalize:normalized});
 vm.runInContext(source,context);
 const cities=vm.runInContext('changedCities',context);
 assert.deepEqual(Array.from(cities(data,'RJ')),['Rio de Janeiro']);
 assert.deepEqual(Array.from(cities(data,'SP')),[]);
 assert.deepEqual(Array.from(cities(data,'MG')),[]);
 assert.deepEqual(Array.from(cities(data,'BA')),[]);
 const fixture={registros:[
  {uf:'SP',cidade:'São Paulo',secoes:[5],fonte:{url:'https://tre-sp.jus.br'}},
  {uf:'SP',cidade:'Sao Paulo',secoes:[12],fonte:{url:'https://tre-sp.jus.br'}},
  {uf:'SP',cidade:'Campinas',secoes:[],fonte:{url:'https://tre-sp.jus.br'}},
  {uf:'SP',cidade:'Sorocaba',secoes:[7]},
  {uf:'MG',cidade:'Juiz de Fora',secoes:[5],fonte:{url:'https://tre-mg.jus.br'}}
 ]};
 assert.deepEqual(Array.from(cities(fixture,'SP')),['São Paulo']);
 assert.deepEqual(Array.from(cities(fixture,'MG')),['Juiz de Fora']);
});

test('levantamento independente disponibiliza municípios em todos os estados sem fingir confirmação de endereços',()=>{
 const reported=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/municipios-levantamento-2026.json'),'utf8'));
 assert.equal(reported.status,'levantamento_secundario_preliminar');
 for(const [uf,min] of [['SP',34],['MG',67],['RJ',9],['BA',48]]){
  assert.ok(reported.estados[uf].length>=min);
  assert.ok(reported.estados[uf].every(r=>r.cidade&&Number.isInteger(r.secoes)&&r.secoes>0));
 }
 assert.ok(reported.estados.SP.some(r=>r.cidade==='São Paulo'));
 assert.ok(reported.estados.BA.some(r=>r.cidade==='Salvador'));
});
test('select mostra apenas os nomes das cidades e conserva a origem no resultado',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.match(app,/municipios-levantamento-2026\.json/);
 assert.match(app,/for\(const name of available\)city\.add\(new Option\(name,name\)\)/);
 assert.match(app,/Levantamento independente/);
 assert.match(app,/Alteração confirmada pelo TRE/);
 assert.match(app,/preliminary\?\.estados/);
});

test('auditoria de todas as cidades e zonas do espelho secundário, sem zonas vazias',()=>{
 const totals={SP:[34,413],MG:[67,337],RJ:[9,47],BA:[48,187]};
 let municipalities=0,sections=0,groups=0;
 for(const [uf,[expectedCities,expectedSections]] of Object.entries(totals)){
  const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/zonas-2026-'+uf.toLowerCase()+'.json'),'utf8'));
  assert.equal(snapshot.status,'espelho_secundario');
  const cities=Object.entries(snapshot.municipios);
  assert.equal(cities.length,expectedCities,uf+' número de municípios');
  let sectionCount=0;
  const uniqueCities=new Set();
  for(const [ibge,v] of cities){
   assert.match(ibge,/^\d{7}$/);
   assert.equal(v[0],uf);
   assert.ok(v[1].trim());uniqueCities.add(normalized(v[1]));
   assert.ok(v[2].length>0,v[1]+' não pode ficar sem zona');
   for(const g of v[2]){
    assert.ok(Number.isInteger(g[0])&&g[0]>0,v[1]+' zona inválida');
    assert.ok(g[1].length>0,v[1]+' sem seções');
    assert.equal(g[1].length,new Set(g[1]).size,v[1]+' seções repetidas');
    for(const location of [g[2],g[3]]){assert.ok(Array.isArray(location)&&location.length>=2,v[1]+' formato de localização inválido');assert.ok(location[0]||location[1],v[1]+' nome e endereço ausentes');}
    sectionCount+=g[1].length;groups++;
   }
  }
  assert.equal(uniqueCities.size,expectedCities,uf+' município duplicado');
  assert.equal(sectionCount,expectedSections,uf+' total de seções');
  municipalities+=cities.length;sections+=sectionCount;
 }
 assert.equal(municipalities,158);
 assert.equal(sections,984);
 assert.ok(groups>=158);
 const sp=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/zonas-2026-sp.json'),'utf8'));
 const guarulhos=Object.values(sp.municipios).find(v=>v[1]==='Guarulhos');
 assert.ok(guarulhos);
 assert.equal(guarulhos[2].length,1);
 assert.equal(guarulhos[2][0][0],278);
 assert.equal(guarulhos[2][0][1].length,9);
 assert.match(guarulhos[2][0][3][0],/Colégio Canadá/);
});

test('revisão editorial e cartões acessíveis',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.ok(!html.includes('Seções alteradas em levantamento secundário'));
 assert.ok(!html.includes('zona(s) listada(s)'));
 assert.ok(!html.includes('Estado monitorado'));
 assert.ok(!html.includes('Cidade com mudança documentada'));
 assert.ok(!html.includes('class="info-panel"'));
 assert.ok(!html.includes('class="scope-caption"'));
 assert.ok(!app.includes('município(s)'));
 assert.ok(html.includes('Selecione uma zona ou consulte todas as mudanças da cidade.'));
 assert.ok(html.includes('Este não é um site oficial da Justiça Eleitoral'));
 assert.ok(html.includes('Consulta oficial no TSE'));
 assert.ok(!html.includes("sections.size===1?'seção':'seções'"));
 assert.ok(html.includes('info.textContent=onlyState?entry.city:'));
 assert.ok(html.includes('button.append(title)'));
 assert.ok(!html.includes("entry.records.flatMap(r=>r.secoes)"));
 assert.ok(html.includes("origin.className='sr-only'"));
 assert.ok(html.includes('zone-option--reported'));
});

test('cartões não apresentam quantidade de seções, mas os resultados preservam a lista detalhada',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.ok(!html.includes("sections.size"));
 assert.ok(html.includes("info.textContent=onlyState?entry.city:"));
 assert.ok(app.includes("['Seções afetadas:',r.secoes.join(', ')]"));
 assert.ok(app.includes("sectionNumber"));
});

test('consulta aceita cidade sem obrigar número de zona',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.ok(!html.includes("if(!zone.value.trim())"));
 assert.ok(app.includes('const z=rawZone?Number(rawZone):null'));
 assert.ok(app.includes('if(!z&&!sectionNo&&records.length>3)'));
 assert.ok(app.includes("city.addEventListener('change',()=>{zone.value='';section.value='';invalidateResults();if(city.value)search(null,false);});"));
 assert.ok(html.includes('form.requestSubmit();'));
 assert.ok(html.includes('role="region"'));
 assert.ok(html.includes('field-optional'));
});

test('nomes acessíveis dos controles respeitam o texto visível',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 assert.ok(!html.includes("button.setAttribute('aria-label'"));
 assert.ok(html.includes("origin.className='sr-only'"));
 assert.ok(html.includes('.sr-only{position:absolute'));
 assert.ok(app.includes("Abrir no Google Maps em uma nova aba"));
 assert.ok(app.includes("addressLink.append(node('span','',address),icon)"));
});

test('regressão mobile: cartões de locais crescem com links e textos longos',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
 assert.match(css,/\.location-compare>\.location\{flex:0 0 auto/);
 assert.match(css,/\.location>div:last-child\{flex:1 1 auto;min-width:0/);
 assert.match(css,/\.location \.map-address-link,\.location \.map-directions-link\{display:flex/);
 assert.match(css,/\.sections-strip\{height:auto/);
 assert.match(css,/\.reported-banner,\.success-banner\{height:auto;min-height:53px/);
});

test('links de endereço, rota e fonte usam SVGs, sem setas unicode',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
 for(const source of [app,html])assert.doesNotMatch(source,/[↗➡➜→]/,'nenhuma seta textual deve aparecer na interface');
 for(const icon of ['external-link','route']){
  const svg=fs.readFileSync(path.join(__dirname,'../assets/svg/'+icon+'.svg'),'utf8');
  assert.match(svg,/<svg /);assert.match(svg,/<path/);
 }
 assert.match(app,/function hasMappableAddress\(data\)/);
 assert.match(app,/function locationCard\(label,data,isAfter,navigation=null\)/);
 assert.match(app,/addressLink\.append\(node\('span','',address\),icon\)/);
 assert.match(app,/actionLink\('Traçar rota',navigation\.routeUrl,'map-directions-link','route'\)/);
 assert.match(app,/actionLink\('Ver origem',r\.fonte\.url,'source-link','external-link'\)/);
 assert.match(css,/\.location \.address-link\{/);
 assert.match(css,/\.footer-external-link::after\{/);
});

test('aviso de site independente aparece uma vez e somente no rodapé, com acesso oficial ao TSE',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
 const warning='Este não é um site oficial da Justiça Eleitoral.';
 assert.equal(html.split(warning).length-1,1);
 assert.ok(!html.includes('class="independence"'));
 assert.ok(!html.includes('class="prototype-note"'));
 const mainEnd=html.indexOf('</main>'),footStart=html.indexOf('<footer class="site-footer"'),footEnd=html.indexOf('</footer>');
 assert.ok(mainEnd>0&&footStart>mainEnd&&footEnd>footStart);
 assert.ok(html.indexOf(warning)>footStart&&html.indexOf(warning)<footEnd);
 assert.ok(html.indexOf('id="base-updated"')>footStart&&html.indexOf('id="base-updated"')<footEnd);
 assert.match(html,/<nav class="site-footer__references" aria-label="Fontes e consulta oficial">/);
 assert.match(html,/Consulta oficial no TSE/);
 assert.ok(html.includes('O Onde Voto? é uma iniciativa independente'));
 assert.ok(css.includes('.site-footer__disclaimer{'));
});
