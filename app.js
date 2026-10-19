/* Consulta documental de alterações. NÃO há API pública do TSE para consulta nominal aqui.
   O browser obtém /api/consulta (servidor local) ou a mesma base documental JSON
   como fallback estático. Nenhum CPF, nome ou data de nascimento é coletado. */
'use strict';
const UFS={BA:'Bahia',MG:'Minas Gerais',RJ:'Rio de Janeiro',SP:'São Paulo'};
const qs=id=>document.getElementById(id), sel=qs('estado'), city=qs('cidade'), zone=qs('zona'), section=qs('secao');
const names=Object.entries(UFS).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
for(const [uf,name] of names) sel.add(new Option(`${name} (${uf})`,uf));
sel.value='RJ';
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const official='https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/onde-votar';
const databaseURL='data/alteracoes-2026.json';
let documentBase=null;
let citiesLoaded={};
const permittedUFs=new Set(Object.keys(UFS));
function node(tag,cls,content){const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=String(content);return n;}
function link(text,url,cls){const a=node('a',cls,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function add(parent,...children){for(const c of children)parent.append(c);return parent;}
function scrollResult(){if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;qs('results-title').scrollIntoView({behavior:'smooth',block:'start'});}
async function loadBase(){if(documentBase)return documentBase;const res=await fetch(databaseURL,{cache:'no-store'});if(!res.ok)throw new Error('Base documental indisponível');const data=await res.json();if(!Array.isArray(data.registros)||!Array.isArray(data.estados_monitorados)||data.estados_monitorados.length!==4||data.estados_monitorados.some(uf=>!permittedUFs.has(uf))||data.registros.some(r=>!permittedUFs.has(r.uf)))throw new Error('Base fora do escopo autorizado');documentBase=data;qs('base-updated').textContent=`SP · MG · RJ · BA | Base parcial • atualizada em ${data.data_base.split('-').reverse().join('/')}`;return data;}
function searchableRecords(data,uf,cityName,zoneNumber,sectionNumber){
 const matching=permittedUFs.has(uf)?data.registros.filter(x=>x.uf===uf&&normalize(x.cidade)===normalize(cityName)&&Number(x.zona)===zoneNumber):[];
 const precise=sectionNumber ? matching.filter(x=>x.secoes.includes(sectionNumber)):matching;
 return {matching,precise};
}
function originalResult(result){return result.status==='confirmado_tre';}
function locationCard(label,data,isAfter){const el=node('div',`location location--${isAfter?'after':'before'}`);const marker=add(node('div','location__marker'),node('img'));marker.firstChild.src='assets/svg/pin.svg';marker.firstChild.alt='';const body=node('div');add(body,node('h3','',label),node('strong','',data.nome),node('p','',data.endereco));add(el,marker,body);return el;}
function renderRecord(r,sectionNumber){
 const officialRecord=originalResult(r), exactSection=sectionNumber&&r.secoes.includes(sectionNumber);
 const card=node('article','result-card dynamic-result');
 const data=node('div','result-data');
 const banner=node('div',officialRecord?'success-banner':'reported-banner');
 const status=add(node('span','status-icon'),node('img'));status.firstChild.src=officialRecord?'assets/svg/check.svg':'assets/svg/info.svg';status.firstChild.alt='';
 add(banner,status,node('strong','',officialRecord?'Mudança confirmada pelo TRE':'Mudança noticiada — confirme no TSE'));
 data.append(banner);
 const meta=node('div','result-meta');
 for(const [label,v] of [['Cidade:',`${r.cidade} / ${r.uf}`],['Zona eleitoral:',`${r.zona}ª ZE`],['Seções afetadas:',r.secoes.join(', ')],['Situação:',sectionNumber?(exactSection?'Seção indicada neste registro':'Seção não indicada'):'Afeta apenas as seções indicadas']]){
 const div=node('div');add(div,node('span','',label),node('strong','',v));meta.append(div);
 }
 data.append(meta);
 const compare=node('div','location-compare');compare.append(locationCard('Local anterior',r.anterior,false));const arrow=node('img','compare-arrow');arrow.src='assets/svg/arrow-right.svg';arrow.alt='Transferido para';compare.append(arrow,locationCard('Novo local',r.novo,true));data.append(compare);
 const footer=node('div','sections-strip');const fi=node('img');fi.src='assets/svg/file-text.svg';fi.alt='';add(footer,fi,node('strong','',r.fonte.orgao),node('span','',`Publicado em ${r.fonte.data.split('-').reverse().join('/')}`),link('Ver fonte ↗',r.fonte.url,'source-link'));data.append(footer);
 const caution=node('p','card-caution',officialRecord?'Este registro foi confirmado no comunicado do TRE, mas pode receber atualizações. Confira seu local individualmente no TSE.':'Informação republicada pela imprensa, sem conferência independente no cadastro individual. Endereços podem estar incompletos.');data.append(caution);
 card.append(data);
 if(r.uf==='RJ'&&r.zona===188){const map=node('div','result-map');const img=node('img');img.src='assets/mapa-exemplo-rio.webp';img.alt='Mapa ilustrativo: Brás de Pina para Penha Circular no Rio de Janeiro';add(map,img,node('span','map-label','Mapa ilustrativo · não é rota oficial'));card.append(map);}
 return card;
}
function emptyResult(title,text){qs('empty-title').textContent=title;qs('empty-text').textContent=text;qs('empty-card').hidden=false;}
async function search(ev,shouldScroll=true){if(ev)ev.preventDefault();const uf=sel.value,c=city.value.trim(),z=Number(zone.value),s=section.value.trim();
 if(!permittedUFs.has(uf)){qs('results-container').hidden=true;emptyResult('Estado fora do escopo','Esta página consulta exclusivamente São Paulo, Minas Gerais, Rio de Janeiro e Bahia.');return;}
 if(!uf||!c||!Number.isInteger(z)||z<1||z>999||(s&&(!/^\d{1,4}$/.test(s)||Number(s)<1))){qs('results-container').hidden=true;emptyResult('Verifique os campos','Preencha o município e uma zona eleitoral válida (1 a 999). A seção é opcional.');return;}
 const button=qs('buscar');button.disabled=true;button.querySelector('span').textContent='Consultando…';qs('loading').hidden=false;qs('empty-card').hidden=true;qs('error-card').hidden=true;qs('results-container').hidden=true;
 try{
  const b=await loadBase();let result;
  try{const path=`/api/consulta?uf=${encodeURIComponent(uf)}&cidade=${encodeURIComponent(c)}&zona=${z}${s?`&secao=${encodeURIComponent(s)}`:''}`;const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error('fallback estático');const j=await response.json();if(!j||!Array.isArray(j.registros))throw new Error('Resposta inválida');result=j;}
  catch(e){const {matching,precise}=searchableRecords(b,uf,c,z,s?Number(s):null);result={registros:precise,totalZona:matching.length,cobertura:'parcial'};}
  const container=qs('results-container');container.replaceChildren();
  if(result.registros.length){
   for(const r of result.registros)container.append(renderRecord(r,s?Number(s):null));container.hidden=false;
   qs('results-description').textContent=`${result.registros.length} registro(s) localizado(s). Consulte as seções afetadas e confirme no TSE.`;
  }else if(s && result.totalZona>0){emptyResult('Seção não incluída nos registros encontrados',`Há alteração documentada para a ${z}ª ZE de ${c}, mas não para a seção ${Number(s)} nos registros desta base parcial. Isso NÃO comprova que sua seção permaneceu no mesmo endereço.`);}
  else{emptyResult('Alteração não verificada nesta base',`Não há informação comprovada por zona e seção para ${c} / ${UFS[uf]}, ${z}ª Zona Eleitoral nesta base parcial. O estado está no escopo de monitoramento, mas isso NÃO confirma se houve ou não mudança no seu local. Consulte o e-Título ou o TSE.`);}
  if(shouldScroll)scrollResult();
 }catch(e){console.error('Falha ao obter base:',e.message);qs('error-card').hidden=false;}
 finally{qs('loading').hidden=true;button.disabled=false;button.querySelector('span').textContent='Buscar alteração';}
}
function invalidateResults(){
 qs('results-container').hidden=true;
 qs('empty-card').hidden=true;
 qs('error-card').hidden=true;
 qs('results-description').textContent='Informe a cidade e a zona eleitoral para buscar registros documentados nos estados monitorados.';
}
const suggestions=qs('lista-cidades');
async function updateCities(){const uf=sel.value;city.value='';zone.value='';section.value='';suggestions.replaceChildren();
 if(citiesLoaded[uf]){setSuggestions(citiesLoaded[uf]);return;}
 const local=(documentBase?.registros||[]).filter(r=>r.uf===uf).map(r=>r.cidade);
 setSuggestions([...new Set(local)]);
 try{const resp=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,{signal:AbortSignal.timeout(5000)});if(!resp.ok)throw Error('IBGE indisponível');const all=(await resp.json()).map(x=>x.nome);citiesLoaded[uf]=all;setSuggestions(all);}catch(_){/* Autocomplete auxiliar, nunca requisito da pesquisa */}
}
function setSuggestions(names){suggestions.replaceChildren(...[...new Set(names)].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(c=>{const o=document.createElement('option');o.value=c;return o;}));}
qs('consulta').addEventListener('submit',search);
sel.addEventListener('change',()=>{invalidateResults();updateCities();});
for(const field of [city,zone,section])field.addEventListener('input',invalidateResults);
loadBase().then(data=>{
 setSuggestions([...new Set(data.registros.filter(x=>x.uf==='RJ').map(x=>x.cidade))]);
 // Exemplo inicial com fonte TRE-RJ; outros três estados ainda aguardam registros detalhados conferidos.
 search(null,false);
}).catch(()=>{qs('results-description').textContent='Não foi possível carregar os dados. Tente buscar novamente.';qs('error-card').hidden=false;});
