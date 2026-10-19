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
const mirrorCache={};
async function loadMirror(uf){
 if(!permittedUFs.has(uf))throw new Error('UF fora do escopo');
 if(!mirrorCache[uf])mirrorCache[uf]=fetch('/data/zonas-2026-'+uf.toLowerCase()+'.json',{cache:'no-store'}).then(async response=>{
  if(!response.ok)throw new Error('Espelho de zonas indisponível');
  const data=await response.json();
  if(data.status!=='espelho_secundario')throw new Error('Fonte não identificada');
  return data;
 }).catch(error=>{delete mirrorCache[uf];throw error;});
 return mirrorCache[uf];
}
function mirrorRecords(dataset,uf,municipio,zona){
 const entries=Object.entries(dataset?.municipios||{}).filter(([id,v])=>v[0]===uf&&normalize(v[1])===normalize(municipio));
 return entries.flatMap(([id,v])=>(v[2]||[]).filter(g=>!zona||g[0]===zona).map((g,i)=>({
  id:'mirror-'+id+'-'+g[0]+'-'+i,uf,cidade:v[1],zona:g[0],secoes:g[1],
  anterior:{nome:g[2][0],endereco:[g[2][1],g[2][2]].filter(Boolean).join(' — ')},
  novo:{nome:g[3][0],endereco:[g[3][1],g[3][2]].filter(Boolean).join(' — ')},
  status:'espelho_secundario',
  fonte:{orgao:'Espelho de dados atribuídos ao TSE (não verificado no TRE)',url:'https://dapravirar.org/dados/mudancas/'+id+'.json',data:'2026-10-17'}
 })));
}

const permittedUFs=new Set(Object.keys(UFS));
function node(tag,cls,content){const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=String(content);return n;}
function link(text,url,cls){const a=node('a',cls,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function add(parent,...children){for(const c of children)parent.append(c);return parent;}
function scrollResult(){if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;qs('results-title').scrollIntoView({behavior:'smooth',block:'start'});}
async function loadBase(){if(documentBase)return documentBase;const res=await fetch(databaseURL,{cache:'no-store'});if(!res.ok)throw new Error('Base documental indisponível');const data=await res.json();if(!Array.isArray(data.registros)||!Array.isArray(data.estados_monitorados)||data.estados_monitorados.length!==4||data.estados_monitorados.some(uf=>!permittedUFs.has(uf))||data.registros.some(r=>!permittedUFs.has(r.uf)))throw new Error('Base fora do escopo autorizado');documentBase=data;qs('base-updated').textContent='Lista de mudanças · 17/10/2026';return data;}
function searchableRecords(data,uf,cityName,zoneNumber,sectionNumber){
 const matching=permittedUFs.has(uf)?data.registros.filter(x=>x.uf===uf&&normalize(x.cidade)===normalize(cityName)&&Number(x.zona)===zoneNumber):[];
 const precise=sectionNumber ? matching.filter(x=>x.secoes.includes(sectionNumber)):matching;
 return {matching,precise};
}
function originalResult(result){return result.status==='confirmado_tre';}
function locationCard(label,data,isAfter){const el=node('div',`location location--${isAfter?'after':'before'}`);const marker=add(node('div','location__marker'),node('img'));marker.firstChild.src='assets/svg/pin.svg';marker.firstChild.alt='';const body=node('div');add(body,node('h3','',label),node('strong','',data.nome||'Local não informado'),node('p','',data.endereco||'Endereço não disponível no levantamento. Consulte o TSE ou o e-Título.'));add(el,marker,body);return el;}
function mapsPlaceUrl(r){
 const address=[r.novo?.nome,r.novo?.endereco,r.cidade,r.uf,'Brasil'].filter(Boolean).join(', ');
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address);
}
function mapsDirectionsUrl(r){
 const address=[r.novo?.nome,r.novo?.endereco,r.cidade,r.uf,'Brasil'].filter(Boolean).join(', ');
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);
}
function renderRecord(r,sectionNumber){
 const officialRecord=originalResult(r), exactSection=sectionNumber&&r.secoes.includes(sectionNumber);
 const card=node('article','result-card dynamic-result');
 const data=node('div','result-data');
 const banner=node('div',officialRecord?'success-banner':'reported-banner');
 const status=add(node('span','status-icon'),node('img'));status.firstChild.src=officialRecord?'assets/svg/check.svg':'assets/svg/info.svg';status.firstChild.alt='';
 add(banner,status,node('strong','',officialRecord?'Alteração confirmada pelo TRE':'Alteração indicada na lista consultada'));
 data.append(banner);
 const meta=node('div','result-meta');
 for(const [label,v] of [['Cidade:',`${r.cidade} / ${r.uf}`],['Zona eleitoral:',`${r.zona}ª ZE`],['Seções afetadas:',r.secoes.join(', ')],['Consulta:',sectionNumber?(exactSection?'Seção identificada':'Confira sua seção'):'Verifique sua seção antes de ir']]){
 const div=node('div');add(div,node('span','',label),node('strong','',v));meta.append(div);
 }
 data.append(meta);
 const compare=node('div','location-compare');compare.append(locationCard('Local anterior',r.anterior,false));const arrow=node('img','compare-arrow');arrow.src='assets/svg/arrow-right.svg';arrow.alt='Transferido para';
 const newLocation=locationCard('Novo local',r.novo,true);
 if(r.novo.endereco&&r.novo.endereco.trim()&&/(rua|avenida|av\.|estrada|rodovia|praça|travessa|alameda|largo|r\.|quadra|bairro|povoado|sítio|sitio|fazenda|km\b)/i.test(r.novo.endereco)){
  const mapsAction=link('Abrir endereço no Google Maps ↗',mapsPlaceUrl(r),'map-address-link');
  mapsAction.setAttribute('aria-label','Abrir no Google Maps o novo local de votação: '+r.novo.endereco+', '+r.cidade);
  newLocation.lastChild.append(mapsAction);
  const routeAction=link('Traçar rota ↗',mapsDirectionsUrl(r),'map-directions-link');
  routeAction.setAttribute('aria-label','Traçar rota até o novo local de votação no Google Maps');
  newLocation.lastChild.append(routeAction);
 }else{
  newLocation.lastChild.append(node('small','address-warning','Novo endereço não detalhado na fonte secundária; consulte o TSE.'));
 }
 compare.append(arrow,newLocation);data.append(compare);
 const footer=node('div','sections-strip');const fi=node('img');fi.src='assets/svg/file-text.svg';fi.alt='';add(footer,fi,node('strong','',officialRecord?r.fonte.orgao:'Levantamento independente'),node('span','',r.fonte.data.split('-').reverse().join('/')),link('Ver origem ↗',r.fonte.url,'source-link'));data.append(footer);
 card.append(data);
 if(r.uf==='RJ'&&r.zona===188&&r.novo.endereco){
  const map=link('',''+mapsPlaceUrl(r),'result-map result-map--interactive');
  map.setAttribute('aria-label','Abrir no Google Maps o novo endereço: '+r.novo.endereco+', '+r.cidade);
  const img=node('img');img.src='assets/mapa-exemplo-rio.webp';img.alt='Prévia ilustrativa do trajeto entre os locais; toque para abrir o endereço atualizado no Google Maps';
  add(map,img,node('span','map-label','Abrir novo endereço no Google Maps ↗'));
  card.append(map);
 }
 return card;
}
function emptyResult(title,text){qs('empty-title').textContent=title;qs('empty-text').textContent=text;qs('empty-card').hidden=false;}
let searchSequence=0;
async function search(ev,shouldScroll=true){
 if(ev)ev.preventDefault();
 const id=++searchSequence,uf=sel.value,c=city.value.trim(),rawZone=zone.value.trim(),rawSection=section.value.trim();
 const z=rawZone?Number(rawZone):null,sectionNo=rawSection?Number(rawSection):null;
 if(!permittedUFs.has(uf))return;
 if(!c){
  qs('results-container').hidden=true;qs('empty-card').hidden=true;qs('error-card').hidden=true;
  qs('results-description').textContent='Selecione uma cidade ou uma zona destacada para continuar.';
  return;
 }
 if((rawZone&&(!/^\d{1,3}$/.test(rawZone)||z<1))||(rawSection&&(!/^\d{1,4}$/.test(rawSection)||sectionNo<1))){
  emptyResult('Confira os números informados','Digite uma zona ou seção eleitoral válida.');
  return;
 }
 const button=qs('buscar'),container=qs('results-container');
 button.disabled=true;button.querySelector('span').textContent='Buscando…';
 qs('loading').hidden=false;qs('empty-card').hidden=true;qs('error-card').hidden=true;container.hidden=true;
 try{
  const [base,mirror]=await Promise.all([
   loadBase(),
   loadMirror(uf).catch(err=>{console.warn('Base complementar indisponível:',err.message);return null;})
  ]);
  if(id!==searchSequence)return;
  const officialRecords=base.registros.filter(r=>r.uf===uf&&normalize(r.cidade)===normalize(c)&&(!z||Number(r.zona)===z));
  if(!mirror&&!officialRecords.length){qs('error-card').hidden=false;container.hidden=true;return;}
  const matchedOfficial=sectionNo?officialRecords.filter(r=>r.secoes.includes(sectionNo)):officialRecords;
  const verifiedSections=new Set(officialRecords.flatMap(r=>r.secoes.map(sec=>r.zona+':'+sec)));
  const additional=mirror?mirrorRecords(mirror,uf,c,z).filter(record=>record.secoes.some(sec=>!verifiedSections.has(record.zona+':'+sec))):[];
  const matchingExtra=sectionNo?additional.filter(record=>record.secoes.includes(sectionNo)):additional;
  const records=[...matchedOfficial,...matchingExtra].sort((a,b)=>a.zona-b.zona||a.novo.nome.localeCompare(b.novo.nome,'pt-BR'));
  container.replaceChildren();
  if(records.length){
   if(!z&&!sectionNo&&records.length>3){
    for(const r of records){
     const disclosure=node('details','result-disclosure');
     const summary=node('summary','result-disclosure__summary');
     const name=node('strong','',r.zona+'ª Zona Eleitoral');
     const change=node('span','',r.anterior.nome+' → '+r.novo.nome);
     summary.append(name,change);disclosure.append(summary,renderRecord(r,null));container.append(disclosure);
    }
   }else{
    for(const r of records)container.append(renderRecord(r,sectionNo));
   }
   container.hidden=false;
   qs('results-description').textContent=records.length+' '+(records.length===1?'alteração encontrada':'alterações encontradas')+' em '+c+(z?' · Zona '+z:'')+'. Selecione sua seção e confirme no TSE.';
  }else if(sectionNo&&officialRecords.length+additional.length){
   emptyResult('Seção não identificada','A seção '+sectionNo+' não consta nos registros encontrados. Confirme seu endereço no TSE.');
  }else{
   emptyResult('Nenhum endereço nesta lista','Não há registro para os filtros selecionados. Isso não significa que seu local permaneceu igual. Confirme no TSE.');
  }
  if(shouldScroll)scrollResult();
 }catch(e){
  if(id!==searchSequence)return;
  console.error('Falha na consulta:',e);
  qs('error-card').hidden=false;
 }finally{
  if(id===searchSequence){
   qs('loading').hidden=true;button.disabled=false;button.querySelector('span').textContent='Buscar alteração';
  }
 }
}

function invalidateResults(){
 searchSequence++;
 qs('loading').hidden=true;
 qs('buscar').disabled=false;
 qs('buscar').querySelector('span').textContent='Buscar alteração';
 qs('results-container').hidden=true;
 qs('empty-card').hidden=true;
 qs('error-card').hidden=true;
 qs('results-description').textContent='Selecione uma zona para consultar os endereços listados.';
}
// Somente municípios com alteração documental (seções e fonte identificadas) entram no select.
function changedCities(data,uf){
 const found=new Map();
 for(const record of data.registros||[]){
  if(record.uf!==uf||!record.cidade||!Array.isArray(record.secoes)||record.secoes.length===0||!record.fonte?.url)continue;
  const key=normalize(record.cidade);
  if(!found.has(key))found.set(key,record.cidade);
 }
 return [...found.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function showCityOptions(data,uf,preliminary){
 const confirmed=changedCities(data,uf);
 const available=[...new Set([...confirmed,...((preliminary?.estados?.[uf]||[]).map(r=>r.cidade))])].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const current=city.value;
 const placeholder=available.length?'Selecione uma cidade':'Nenhuma cidade nesta lista';
 city.replaceChildren(new Option(placeholder,''));
 for(const name of available)city.add(new Option(name,name));
 const previous=available.find(name=>normalize(name)===normalize(current));
 city.value=previous||'';
 city.disabled=available.length===0;
 qs('cidade-aviso').textContent=available.length
  ?`${available.length} ${available.length===1?'cidade':'cidades'} na lista de alterações.`
  :'Nenhuma cidade encontrada nesta lista. Para confirmar seu endereço, consulte o TSE.';
}
async function updateCities(){
 const uf=sel.value;
 city.disabled=true;city.value='';zone.value='';section.value='';
 city.replaceChildren(new Option('Carregando municípios…',''));
 qs('cidade-aviso').textContent='Carregando cidades…';
 try{
  const data=await loadBase();
  let preliminary=null;
  try{const r=await fetch('/data/municipios-levantamento-2026.json',{cache:'no-store'});if(r.ok)preliminary=await r.json();}catch(_){}
  if(sel.value!==uf)return;
  showCityOptions(data,uf,preliminary);
 }catch(err){
  if(sel.value!==uf)return;
  city.replaceChildren(new Option('Lista de cidades indisponível',''));
  qs('cidade-aviso').textContent='Não foi possível carregar as cidades. Tente novamente.';
  qs('error-card').hidden=false;
 }
}
qs('consulta').addEventListener('submit',search);
sel.addEventListener('change',()=>{invalidateResults();updateCities();});
city.addEventListener('change',()=>{zone.value='';section.value='';invalidateResults();if(city.value)search(null,false);});
for(const field of [zone,section])field.addEventListener('input',invalidateResults);
// O campo cidade nunca recebe municípios de um autocomplete geral, apenas da base de alterações.
updateCities();
