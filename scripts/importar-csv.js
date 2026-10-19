/* Converte exportação revisada para o esquema documental interno.
   Entrada exigida: CSV NORMALIZADO, sem inferir colunas desconhecidas de exportações SIG/TSE.
   Uso: node scripts/importar-csv.js dados-revisados.csv
   Não baixa dados e não garante que um CSV de terceiros seja oficial. */
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2];
const ALLOWED_UFS=new Set(['SP','MG','RJ','BA']);
if(!input){console.error('Uso: node scripts/importar-csv.js arquivo-validado.csv');process.exit(1);}
function parseCSV(src){const rows=[],row=[];let buf='',quoted=false;for(let i=0;i<src.length;i++){
 const c=src[i];if(c==='"'){if(quoted&&src[i+1]==='"'){buf+='"';i++;}else quoted=!quoted;}
 else if(c===';'&&!quoted){row.push(buf);buf='';}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&src[i+1]==='\n')i++;row.push(buf);if(row.some(s=>s.trim()))rows.push([...row]);row.length=0;buf='';}
 else buf+=c;
}if(quoted)throw Error('CSV contém aspas sem fechamento');if(buf||row.length){row.push(buf);rows.push(row);}return rows;}
try{
 const lines=parseCSV(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')),header=lines.shift().map(s=>s.trim());
 const required=['uf','cidade','zona','secoes','anterior','endereco_anterior','novo','endereco_novo','fonte_url','fonte_orgao','data_fonte','status'];
 if(required.some(k=>!header.includes(k)))throw Error('CSV deve conter: '+required.join(';'));
 const records=[];for(const [index,line] of lines.entries()){
  const r=Object.fromEntries(header.map((k,i)=>[k,(line[i]||'').trim()]));
  const sections=[...new Set(r.secoes.split(/[,| ]+/).filter(Boolean).map(Number))];
  if(!/^[A-Z]{2}$/.test(r.uf)||!ALLOWED_UFS.has(r.uf)||!r.cidade||!/^\d{1,3}$/.test(r.zona)||!sections.length||sections.some(n=>!Number.isInteger(n)||n<1)||!['confirmado_tre','noticiado_sem_confirmacao_tre'].includes(r.status)||!/^\d{4}-\d{2}-\d{2}$/.test(r.data_fonte))throw Error('Linha '+(index+2)+' inválida ou fora do escopo (SP, MG, RJ, BA).');
  const u=new URL(r.fonte_url);if(u.protocol!=='https:')throw Error('Fonte deve usar HTTPS');
  if(r.status==='confirmado_tre'&&!(/(^|\.)tre-[a-z]{2}\.jus\.br$/.test(u.hostname)||u.hostname==='www.tse.jus.br'||u.hostname==='tse.jus.br'))throw Error('Registro confirmado_tre exige URL oficial; revisar manualmente a notícia.');
  records.push({id:`importado-${r.uf.toLowerCase()}-${r.zona}-${r.cidade.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${sections[0]}`,uf:r.uf,cidade:r.cidade,zona:Number(r.zona),secoes:sections,regiao:r.regiao||'',anterior:{nome:r.anterior,endereco:r.endereco_anterior||'Não informado'},novo:{nome:r.novo,endereco:r.endereco_novo||'Não informado'},status:r.status,fonte:{url:r.fonte_url,orgao:r.fonte_orgao,data:r.data_fonte},nota:'Registro importado de CSV revisado. A publicação depende de validação editorial.'});
 }
 // Importe em arquivo de revisão em vez de modificar o banco publicado automaticamente.
 const output=path.join(__dirname,'..','data','importacao-pendente-revisao.json');
 fs.writeFileSync(output,JSON.stringify({importado_em:new Date().toISOString(),registros:records},null,2));
 console.log(`${records.length} grupos importados para REVISÃO: ${output}`);
}catch(e){console.error(e.message);process.exit(1);}
