#!/usr/bin/env node
/* SM EDUCATION v2.9.40 — manage and verify the textbook catalogue from Termux.
 *   node tools/textbook_catalogue.js add --id math-4am --grade "الرابعة متوسط" --subject "الرياضيات" --title "كتاب الرياضيات" --url https://host/file.pdf [--size 12.5] [--allow-host]
 *   node tools/textbook_catalogue.js list
 *   node tools/textbook_catalogue.js check [--id math-4am]     (asks for the first KB only and verifies the %PDF signature)
 *   node tools/textbook_catalogue.js remove --id math-4am
 * The tool never invents links: every URL is typed by you. It cannot know whether the source allows downloading;
 * that is your responsibility. --allow-host adds the URL's host to web/config.js (textbookHosts), nothing else does. */
'use strict';
const fs=require('fs'),path=require('path'),https=require('https');
const root=path.resolve(__dirname,'..');
const CAT=path.join(root,'web/data/textbook-repository-index.json'),CFG=path.join(root,'web/config.js'),CUR=path.join(root,'web/data/curriculum-2026-2027.json');
const ID_RX=/^[A-Za-z0-9_.-]{1,80}$/,MAX=80*1048576;
const args=process.argv.slice(3),cmd=process.argv[2];
const opt=n=>{const i=args.indexOf('--'+n);return i<0?undefined:(args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:true)};
const die=m=>{console.error('ERREUR: '+m);process.exit(1)};
const load=()=>JSON.parse(fs.readFileSync(CAT,'utf8'));
const save=d=>fs.writeFileSync(CAT,JSON.stringify(d,null,2)+'\n');
function hostsInConfig(){const m=fs.readFileSync(CFG,'utf8').match(/textbookHosts:\s*\[([^\]]*)\]/);return m?[...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x=>x[1].toLowerCase()):[]}
function allowHost(h){
  const s=fs.readFileSync(CFG,'utf8'),m=s.match(/textbookHosts:\s*\[([^\]]*)\]/);if(!m)die('textbookHosts introuvable dans web/config.js');
  const cur=hostsInConfig();if(cur.includes(h))return false;
  fs.writeFileSync(CFG,s.replace(m[0],'textbookHosts: ['+cur.concat(h).map(x=>`'${x}'`).join(', ')+']'));return true;
}
function hostOk(u){const h=new URL(u).hostname.toLowerCase();return hostsInConfig().some(d=>h===d||h.endsWith('.'+d))}
function checkUrl(u){try{const x=new URL(u);if(x.protocol!=='https:')return 'le lien doit être en HTTPS';if(/^(localhost|\d+\.\d+\.\d+\.\d+|\[)/.test(x.hostname))return 'hôte local ou adresse IP refusé';return ''}catch(e){return 'URL invalide'}}
function probe(u,hops=0){return new Promise(res=>{
  const req=https.get(u,{headers:{Range:'bytes=0-1023',Accept:'application/pdf,*/*','User-Agent':'SM-EDUCATION-catalogue-check'},timeout:20000},r=>{
    if([301,302,303,307,308].includes(r.statusCode)&&r.headers.location&&hops<3){r.resume();const n=new URL(r.headers.location,u).href;return probe(n,hops+1).then(x=>res(Object.assign(x,{redirected:n})))}
    const chunks=[];r.on('data',c=>{chunks.push(c);if(Buffer.concat(chunks).length>=1024){r.destroy()}});
    r.on('close',()=>{const b=Buffer.concat(chunks),cr=r.headers['content-range'],cl=+r.headers['content-length']||0;
      const size=cr&&/\/(\d+)$/.test(cr)?+RegExp.$1:(r.statusCode===200?cl:0);
      res({status:r.statusCode,pdf:b.slice(0,4).toString('latin1')==='%PDF',size,partial:r.statusCode===206})});
  });
  req.on('timeout',()=>{req.destroy();res({status:0,error:'délai dépassé'})});req.on('error',e=>res({status:0,error:e.code||e.message}));
})}
(async()=>{
  if(cmd==='add'){
    const b={id:opt('id'),grade:opt('grade'),subject:opt('subject'),title:opt('title'),url:opt('url')};
    for(const k of Object.keys(b))if(!b[k]||b[k]===true)die('--'+k+' manquant');
    if(!ID_RX.test(b.id))die('id: lettres, chiffres, _ . - uniquement (80 max)');
    const bad=checkUrl(b.url);if(bad)die(bad);
    const cur=JSON.parse(fs.readFileSync(CUR,'utf8')).records;
    if(!cur.some(r=>r.grade===b.grade&&r.subject===b.subject))die(`le couple niveau/matière « ${b.grade} / ${b.subject} » n'existe pas dans le programme de l'application`);
    const d=load();if(d.books.some(x=>x.id===b.id))die('id déjà utilisé');
    if(opt('size')&&opt('size')!==true)b.size_mb=Number(opt('size'))||0;
    d.books.push(b);save(d);console.log('ajouté: '+b.id);
    const h=new URL(b.url).hostname.toLowerCase();
    if(opt('allow-host')){console.log(allowHost(h)?'hôte autorisé dans web/config.js: '+h:'hôte déjà autorisé: '+h)}
    else if(!hostOk(b.url))console.log(`ATTENTION: l'hôte ${h} n'est pas dans textbookHosts; le téléchargement restera désactivé. Relance avec --allow-host si la source l'autorise.`);
  }else if(cmd==='list'){
    const d=load();if(!d.books.length)return console.log('(catalogue vide)');
    d.books.forEach(b=>console.log(`${b.id}\t${b.grade}\t${b.subject}\t${b.title}\t${hostOk(b.url)?'hôte OK':'hôte NON autorisé'}`));
  }else if(cmd==='check'){
    const only=opt('id'),d=load(),list=d.books.filter(b=>!only||b.id===only);if(!list.length)die('aucun livre à vérifier');
    let bad=0;
    for(const b of list){
      const e=checkUrl(b.url);if(e){console.log(`✗ ${b.id}: ${e}`);bad++;continue}
      const r=await probe(b.url);
      const okHost=hostOk(b.url),big=r.size>MAX;
      const ok=r.status>=200&&r.status<300&&r.pdf&&!big;
      console.log(`${ok?'✓':'✗'} ${b.id}: HTTP ${r.status||r.error}${r.pdf?' · PDF valide':' · pas un PDF'}${r.size?` · ${(r.size/1048576).toFixed(1)} Mo`:''}${r.partial?' · Range supporté':''}${r.redirected?' · redirigé vers '+new URL(r.redirected).hostname:''}${big?' · > 80 Mo (refusé par l’app)':''}${okHost?'':' · hôte NON autorisé dans config.js'}`);
      if(!ok)bad++;
      if(r.redirected&&!hostOk(r.redirected))console.log(`  note: l'hôte de redirection ${new URL(r.redirected).hostname} n'est pas autorisé; l'app suit la redirection mais seul l'hôte initial est contrôlé.`);
    }
    process.exit(bad?2:0);
  }else if(cmd==='remove'){
    const id=opt('id'),d=load(),n=d.books.length;d.books=d.books.filter(b=>b.id!==id);if(d.books.length===n)die('id introuvable');save(d);console.log('supprimé: '+id);
  }else{
    console.log('Usage: node tools/textbook_catalogue.js add|list|check|remove  (voir l’en-tête du fichier)');process.exit(cmd?1:0);
  }
})();
