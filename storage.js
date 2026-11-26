(()=>{
'use strict';
let activeData;
// Reuse the tested domain store. Only its tiny synchronous SQL surface is adapted;
// the whole mutation is committed atomically in one IndexedDB transaction.
class DatabaseSync {
 constructor(){this.data=activeData}
 exec(){}
 prepare(sql){
  const data=this.data;
  const query=(...args)=>{
   if(sql==='SELECT document FROM preferences WHERE id=1')return data.preferences?[{document:data.preferences}]:[];
   const table=sql.includes('FROM attempts')?data.attempts:data.articles;
   let rows=table;
   if(sql.includes('WHERE fingerprint=?'))rows=rows.filter(x=>x.fingerprint===args[0]&&(!sql.includes('id<>?')||x.id!==args[1]));
   else if(sql.includes('WHERE id=?'))rows=rows.filter(x=>x.id===args[0]);
   if(sql.includes('ORDER BY created_at DESC'))rows=[...rows].sort((a,b)=>b.created_at.localeCompare(a.created_at));
   return rows;
  };
  return {all:query,get:(...a)=>query(...a)[0],run:(...a)=>{
   if(sql.startsWith('INSERT INTO preferences'))data.preferences=a[0];
   else if(sql==='INSERT INTO articles VALUES (?,?,?,?)')data.articles.push({id:a[0],fingerprint:a[1],document:a[2],created_at:a[3]});
   else if(sql==='INSERT INTO attempts VALUES(?,?,?,?)')data.attempts.push({id:a[0],article_id:a[1],document:a[2],created_at:a[3]});
   else if(sql==='UPDATE articles SET document=? WHERE id=?'){const r=data.articles.find(x=>x.id===a[1]);if(r)r.document=a[0];}
   else if(sql==='UPDATE articles SET fingerprint=?,document=? WHERE id=?'){const r=data.articles.find(x=>x.id===a[2]);if(r){r.fingerprint=a[0];r.document=a[1];}}
   else throw Error('Unsupported storage operation.');
  }};
 }
}
const randomUUID=()=>crypto.randomUUID();
// Exact normalized duplicate comparison, not a security hash.
const createHash=()=>({update(text){this.text=text;return this},digest(){return this.text}});

function inferMetadata(raw){
  raw=trimArticleFooter(raw);
  const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),head=lines.slice(0,18).join('\n');
  const iso=head.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
  const months='January February March April May June July August September October November December'.split(' ');
  const mon='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const us=head.match(new RegExp('\\b('+mon+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,|\\s)*\\s*(20\\d{2})','i'));
  const uk=head.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+mon+')\\.?[,]?\\s+(20\\d{2})','i'));
  let date=null;
  if(iso)date=`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  else if(us||uk){const d=us?us[2]:uk[1],m=us?us[1]:uk[2],y=us?us[3]:uk[3];date=`${y}-${String(months.findIndex(x=>x.slice(0,3).toLowerCase()===m.slice(0,3).toLowerCase())+1).padStart(2,'0')}-${d.padStart(2,'0')}`;}
  if(date&&(Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))date=null;
  const source=[[/\bthe economist\b|economist\.com/i,'The Economist'],[/\bfinancial times\b|ft\.com/i,'Financial Times'],[/\breuters\b/i,'Reuters'],[/\bbbc\b/i,'BBC'],[/\bthe guardian\b/i,'The Guardian'],[/\bnew york times\b|nytimes\.com/i,'The New York Times'],[/\bwall street journal\b|wsj\.com/i,'The Wall Street Journal'],[/\bbloomberg\b/i,'Bloomberg']].find(([r])=>r.test(head));
  const skip=/^(?:share|save|listen(?: to this (?:article|story))?|read more|subscribe|sign in|menu|advertisement|the economist|by\s.+|\d+ min(?:ute)?s? read|https?:\/\/.*)$/i;
  const isDate=l=>l.length<100&&/^(?:(?:published|updated)\s*:?\s*)?(?:20\d{2}[-/.]\d|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d)/i.test(l);
  const categoryPattern=/^(?:science\s*(?:&|and)\s*(?:tech(?:nology)?)|science|technology|finance(?:\s*(?:&|and)\s*economics)?|business|china|world|artificial intelligence|briefing|leaders|asia|europe|britain|united states|the americas|middle east\s*(?:&|and)\s*africa|international|culture|economics|special report|the world ahead|obituary)$/i;
  const isBody=l=>l.length>150&&/[.!?][”"']?(?:\s|$)/.test(l)&&!skip.test(l);
  const dateLine=lines.findIndex(isDate);
  let bodyLine=dateLine>=0?lines.findIndex((l,i)=>i>dateLine&&!skip.test(l)&&!isDate(l)&&!categoryPattern.test(l)):lines.findIndex((l,i)=>i>0&&/^[“"‘']\s*\S/.test(l)&&!skip.test(l));
  if(bodyLine<0)bodyLine=lines.findIndex((l,i)=>i>0&&isBody(l));
  if(bodyLine<0&&dateLine<0){bodyLine=lines.findIndex((l,i)=>i>0&&l.split(/\s+/).length>=9&&/[.!][”"']?$/.test(l)&&!categoryPattern.test(l));}
  const headingEnd=bodyLine>=0?bodyLine:dateLine>=0?dateLine:Math.min(lines.length,4);
  const headerLines=lines.slice(0,headingEnd).filter(l=>!/^https?:\/\//i.test(l)).slice(0,16);
  const sourceCategory=headerLines.find(l=>categoryPattern.test(l))||'';
  const candidates=headerLines.filter(l=>l.length>=3&&l.length<=1000&&!skip.test(l)&&!isDate(l)&&l!==sourceCategory&&!/^(?:financial times|reuters|bbc|the guardian|the new york times|bloomberg|the wall street journal)$/i.test(l));
  const hasKicker=candidates.length>=2&&candidates[0].split(/\s+/).length<=8&&candidates[1].split(/\s+/).length>=7&&candidates[1].length>candidates[0].length+12;
  const kicker=hasKicker?candidates[0]:'',titleIndex=hasKicker?1:0;
  const title=candidates[titleIndex]||lines.find(l=>l.length>=8&&!skip.test(l)&&!isDate(l)&&!categoryPattern.test(l))||'Untitled article';
  const subtitle=candidates.slice(titleIndex+1).join(' ');
  const headerKeywords=headerLines.filter(l=>l!==title&&!isDate(l)&&!/^by\s|^\d+ min|^(share|save|listen|subscribe|sign in|menu|advertisement|the economist)$/i.test(l)).slice(0,6);
  const rawLines=raw.split(/\r?\n/),bodyOffset=bodyLine>=0?rawLines.findIndex(l=>l.trim()===lines[bodyLine]):-1;
  const body=bodyOffset>=0?rawLines.slice(bodyOffset).join('\n'):raw;
  let blocks=body.trim().split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
  if(blocks.length<2)blocks=body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const paragraphs=blocks.filter(s=>!skip.test(s)&&s!==title&&!headerKeywords.includes(s)&&!isDate(s));
  const bodyText=paragraphs.join(' '),topics=[['Artificial Intelligence',/\bartificial intelligence\b|\bAI\b|\bLLMs?\b/i],['China',/\bChina\b|\bChinese\b|\bBeijing\b/i],['Finance',/\bfinance\b|\binterest rates?\b|\binflation\b|\bbonds?\b|\bbanking\b/i],['Technology',/\btechnology\b|\bsemiconductors?\b|\bsoftware\b/i],['Politics',/\belection\b|\bparliament\b|\bpolitics\b/i],['Climate',/\bclimate\b|\bemissions\b|\bglobal warming\b/i],['Business',/\bcompanies\b|\bcorporate\b|\bbusiness\b/i]].filter(([,r])=>r.test(bodyText)).slice(0,3).map(([s])=>s);
  const stop=new Set('about after again also before being could every first their there these those through under using where which while would should because people'.split(' ')),frequency=new Map();for(const word of bodyText.match(/[A-Za-z][A-Za-z-]{4,}/g)||[]){const key=word.toLowerCase();if(!stop.has(key))frequency.set(key,(frequency.get(key)||0)+1)}
  const keywords=[...new Set([...topics,...[...frequency].sort((a,b)=>b[1]-a[1]).map(([w])=>w)])].slice(0,6);
  return {title,date,sourceCategory,kicker,subtitle,keywords:keywords.length?keywords:['Article'],structureVersion:1,headerLines,headerKeywords,source:source?.[1]||'The Economist',sourceAssumed:!source,topics:topics.length?topics:['World'],paragraphs:paragraphs.length?paragraphs:[raw.trim()]};
}
function trimArticleFooter(raw){
 const text=String(raw||'').replace(/\r\n/g,'\n');let end=text.length;
 const markers=/[■□◼◻](?=[ \t]*(?:\n|$))/g;let match;
 while((match=markers.exec(text))){if(text.slice(0,match.index).trim().length>=80){end=match.index;break;}}
 const footer=/^(?:(?:sign\s*up|subscribe)\b.*\b(?:newsletter|briefing|updates?|inbox)\b|(?:for more|to stay|stay informed|get (?:our|the|a)|discover our|want (?:more|to))\b.*\b(?:newsletter|sign\s*up|subscribe|inbox)\b|(?:our |the )?newsletters?\s*[:.!]?\s*$|this article appeared in\b.*\b(?:print|edition)\b|(?:more from|related articles|recommended for you|reuse this content|reprints and permissions)\b|(?:뉴스레터|구독 안내|관련 기사|추천 기사)\s*[:：]?\s*$|(?:더 많은|자세한|최신|매주|매일)\b.*(?:뉴스레터|구독|받아보세요))/i;
 let offset=0;for(const line of text.split('\n')){if(offset>=end)break;if(offset>=80&&footer.test(line.trim())){end=offset;break;}offset+=line.length+1;}
 return text.slice(0,end).trim();
}
function openStore(filename){
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 db.exec('CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, document TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id), document TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_attempts_article ON attempts(article_id); CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);');
 const defaults={time:'21:00',enabled:false,skip:true,language:'ko',autoGenerate:true};
 function read(id){const row=db.prepare('SELECT document FROM articles WHERE id=?').get(id);return row?JSON.parse(row.document):null}
 function write(a){db.prepare('UPDATE articles SET document=? WHERE id=?').run(JSON.stringify(a),a.id);return a}
 function generationInput(a){return {...a,headerLines:a.headerLines||inferMetadata(a.raw).headerLines||[]}}
 function readingComplete(a){return !!a.koreanTranslation?.trim()&&a.readingStatus==='ready'&&Array.isArray(a.summaryKorean)&&a.summaryKorean.length===(a.summary?.length||3)&&a.summaryKorean.every(s=>typeof s==='string'&&s.trim());}
 function applyPack(id,pack,readingOnly=false){
  const a=read(id),clean=s=>String(s||'').toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
  if(!a.metadataEdited){
   const header=clean((a.headerLines||inferMetadata(a.raw).headerLines||[]).join(' ')),savedKicker=a.kicker||'';
   for(const k of ['sourceCategory','kicker','subtitle'])if(pack[k]===null||typeof pack[k]==='string'){const value=(pack[k]||'').trim();a[k]=!value||header.includes(clean(value))?value:a[k]||'';}
   if(Array.isArray(pack.keywords)){const keys=[...new Set(pack.keywords.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))].slice(0,8);if(keys.length)a.keywords=keys;}
   a.structureVersion=1;
   if(typeof pack.title==='string'&&pack.title.trim()&&clean(a.raw).includes(clean(pack.title))){if(savedKicker&&clean(pack.title)===clean(savedKicker)&&clean(a.title)!==clean(savedKicker))a.kicker=savedKicker;else a.title=pack.title.trim();}
   if(typeof pack.source==='string'&&pack.source.trim())a.source=pack.source.trim();
   if(typeof pack.sourceAssumed==='boolean')a.sourceAssumed=pack.sourceAssumed;
   if(Array.isArray(pack.topics))a.topics=pack.topics.filter(t=>typeof t==='string'&&t.trim()).slice(0,3);
   if(typeof pack.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(pack.date)&&!Number.isNaN(Date.parse(pack.date))&&new Date(pack.date).toISOString().slice(0,10)===pack.date)a.date=pack.date;
   if(Array.isArray(pack.headerKeywords))a.headerKeywords=pack.headerKeywords.filter(t=>typeof t==='string'&&t.trim()&&clean(a.raw).includes(clean(t))&&clean(t)!==clean(a.title)).slice(0,6);
  }
  if(Array.isArray(pack.paragraphStudy))a.paragraphStudy=pack.paragraphStudy;
  if(pack.koreanTranslation!==undefined){if(pack.koreanTranslation)a.koreanTranslation=pack.koreanTranslation;a.paragraphVocabulary=pack.paragraphVocabulary||a.paragraphVocabulary||[];a.summaryKorean=pack.summaryKorean||a.summaryKorean||[];a.readingVersion=2;a.readingStatus=pack.readingStatus||'ready';a.readingError=pack.readingError||null;}
  if(!readingOnly)Object.assign(a,{summaryLanguage:'en',summary:pack.summary,questions:pack.questions,vocabulary:pack.vocabulary,generatedLanguage:settings().language,status:'ready',generatedAt:new Date().toISOString(),error:null});
  return write(a);
 }
 function create(raw){if(typeof raw==='string'&&/(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,})/.test(raw))throw Error('This text contains an API key. Paste keys only in Settings, not in an article.');if(typeof raw!=='string'||raw.trim().length<40||raw.length>120000)throw Error('Paste an article between 40 and 120,000 characters.');raw=raw.trim();const fingerprint=createHash('sha256').update(raw.replace(/\s+/g,' ').toLowerCase()).digest('hex');let old=db.prepare('SELECT document FROM articles WHERE fingerprint=?').get(fingerprint);if(old){const found=JSON.parse(old.document);if(found.deletedAt)throw Error('This article is in Recently deleted. Restore it from Archive.');return {article:found,duplicate:true}};let a={id:randomUUID(),raw,...inferMetadata(raw),createdAt:new Date().toISOString(),status:'saved',summary:null,questions:[],vocabulary:[],error:null,metadataEdited:false};db.prepare('INSERT INTO articles VALUES (?,?,?,?)').run(a.id,fingerprint,JSON.stringify(a),a.createdAt);return {article:a,duplicate:false}}
 function settings(patch){let row=db.prepare('SELECT document FROM preferences WHERE id=1').get(),s={...defaults,...(row?JSON.parse(row.document):{})};if(patch){if(patch.time!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.time))throw Error('Choose a valid time.');for(const k of ['enabled','skip','autoGenerate'])if(patch[k]!==undefined&&typeof patch[k]!=='boolean')throw Error('Invalid setting.');if(patch.language!==undefined&&!['en','ko'].includes(patch.language))throw Error('Invalid language.');for(const k of Object.keys(defaults))if(patch[k]!==undefined)s[k]=patch[k];db.prepare('INSERT INTO preferences VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(JSON.stringify(s))}return s}
 function patchArticle(id,p){let a=read(id);if(!a||a.deletedAt)throw Error('Article not found.');for(const k of ['sourceCategory','kicker','subtitle'])if(p[k]!==undefined){if(typeof p[k]!=='string'||p[k].length>1000)throw Error('Enter valid '+k+'.');a[k]=p[k].trim()}if(p.keywords!==undefined){if(!Array.isArray(p.keywords)||!p.keywords.length||p.keywords.length>8||p.keywords.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw Error('Use 1–8 non-empty keywords.');a.keywords=[...new Set(p.keywords.map(x=>x.trim()))]}for(const k of ['title','source'])if(p[k]!==undefined){if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>300)throw Error('Enter a valid '+k+'.');a[k]=p[k].trim()}if(p.date!==undefined){if(p.date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date))throw Error('Enter a valid date.');a.date=p.date}if(p.topics!==undefined){if(!Array.isArray(p.topics)||p.topics.length>5||p.topics.some(s=>typeof s!=='string'||s.length>60))throw Error('Use up to five short topics.');a.topics=p.topics}a.metadataEdited=true;a.sourceAssumed=false;return write(a)}
 function attempt(id,p){const a=read(id);if(a?.deletedAt||!a?.questions.length)throw Error('Generate the questions first.');if(p.revision!==undefined&&p.revision!==(a.revision||1))throw Error('The article changed. Reopen it before submitting answers.');if(typeof p.id!=='string'||p.id.length>80)throw Error('Invalid attempt.');const existing=db.prepare('SELECT document FROM attempts WHERE id=?').get(p.id);if(existing){const e=JSON.parse(existing.document);if(e.articleId!==id)throw Error('Attempt does not match article.');return e}if(!Array.isArray(p.questionIds)||!p.questionIds.length||new Set(p.questionIds).size!==p.questionIds.length)throw Error('Invalid question selection.');const qs=p.questionIds.map(qid=>a.questions.find(q=>q.id===qid));if(qs.some(q=>!q)||!p.answers||qs.some(q=>!Number.isInteger(p.answers[q.id])||p.answers[q.id]<0||p.answers[q.id]>3))throw Error('Answer every question first.');const responses=qs.map(q=>({id:q.id,choice:p.answers[q.id],correct:p.answers[q.id]===q.correct}));const r={id:p.id,articleId:id,revision:a.revision||1,title:a.title,date:new Date().toISOString(),responses,correct:responses.filter(x=>x.correct).length,total:qs.length,mode:p.mode==='review'?'review':p.mode==='vocabulary'?'vocabulary':'full'};db.prepare('INSERT INTO attempts VALUES(?,?,?,?)').run(r.id,id,JSON.stringify(r),r.date);return r}
 function editText(id,p){if(typeof p.raw==='string'&&/(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,})/.test(p.raw))throw Error('This text contains an API key. Paste keys only in Settings.');const a=read(id);if(!a||a.deletedAt)throw Error('Article not found.');if(a.status==='generating'||a.readingStatus==='generating')throw Error('Please wait for generation to finish before editing.');if(p.revision!==(a.revision||1))throw Error('This article changed. Reopen it before editing.');if(typeof p.raw!=='string'||p.raw.trim().length<40||p.raw.length>120000)throw Error('Paste an article between 40 and 120,000 characters.');const raw=p.raw.trim();if(raw===a.raw)return a;const fingerprint=createHash('sha256').update(raw.replace(/\s+/g,' ').toLowerCase()).digest('hex');const duplicate=db.prepare('SELECT id FROM articles WHERE fingerprint=? AND id<>?').get(fingerprint,id);if(duplicate)throw Error('That text already belongs to another saved article.');const {versions,...snapshot}=a;a.versions=[...(versions||[]),snapshot];Object.assign(a,inferMetadata(raw),{raw,revision:(a.revision||1)+1,updatedAt:new Date().toISOString(),status:'saved',summary:null,questions:[],vocabulary:[],paragraphStudy:[],koreanTranslation:'',paragraphVocabulary:[],summaryKorean:[],readingVersion:0,readingStatus:'saved',readingError:null,error:null,metadataEdited:false,generatedAt:null});db.prepare('UPDATE articles SET fingerprint=?,document=? WHERE id=?').run(fingerprint,JSON.stringify(a),id);return a}
 function trash(id,restore=false){const a=read(id);if(!a)throw Error('Article not found.');if(a.status==='generating'||a.readingStatus==='generating')throw Error('Please wait for generation to finish.');a.deletedAt=restore?null:new Date().toISOString();return write(a)}
 function state(){const all=db.prepare('SELECT document FROM articles ORDER BY created_at DESC').all().map(x=>JSON.parse(x.document));const active=new Set(all.filter(a=>!a.deletedAt).map(a=>a.id));return {articles:all.filter(a=>!a.deletedAt),deletedArticles:all.filter(a=>a.deletedAt),attempts:db.prepare('SELECT document FROM attempts ORDER BY created_at DESC').all().map(x=>JSON.parse(x.document)).filter(a=>active.has(a.articleId)),settings:settings()}}

 for(const row of db.prepare('SELECT document FROM articles').all()){const a=JSON.parse(row.document);if((a.structureVersion||0)<1){const inferred=inferMetadata(a.raw);for(const k of ['sourceCategory','kicker','subtitle','keywords'])if(a[k]===undefined)a[k]=inferred[k];if(!a.metadataEdited){a.title=inferred.title;a.headerLines=inferred.headerLines;if(!a.questions?.length&&!a.koreanTranslation&&!a.paragraphStudy?.length)a.paragraphs=inferred.paragraphs;}a.structureVersion=1;write(a)}if(a.status==='generating'){a.status='saved';a.error='Generation was interrupted. Please try again.';write(a)}if(a.readingStatus==='generating'){a.readingStatus='error';a.readingError='Translation was interrupted. Please try again.';write(a)}}
 return {db,read,write,create,settings,patchArticle,editText,trash,attempt,state,generationInput,applyPack,readingComplete};
}



const DB_NAME='daily-press-web-v1:'+location.pathname.replace(/index\.html$/,'');
let database;
function openDatabase(){return database??=new Promise((resolve,reject)=>{
 const request=indexedDB.open(DB_NAME,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('journal');
 request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null};resolve(request.result)};
 request.onerror=()=>{database=null;reject(Error('Browser storage is unavailable. Allow site storage and reopen Daily Press.'))};
 request.onblocked=()=>reject(Error('Close other Daily Press tabs, then reopen this page.'));
})}
async function transaction(action){
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('journal','readwrite'),bucket=tx.objectStore('journal'),request=bucket.get('data');let result,error;
  request.onsuccess=()=>{try{
   activeData=request.result||{articles:[],attempts:[],preferences:null};
   const store=openStore('browser');result=action(store,activeData);bucket.put(activeData,'data');
  }catch(e){error=e;tx.abort()}finally{activeData=null}};
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(error||Error('Could not save. Your browser may be out of space; export a backup before clearing anything.'));
  tx.onerror=()=>{};
 });
}
const jobs=new Map();
const aiStatus=()=>window.WebAI.status();
async function generateStudy(id,readingOnly){
 if(jobs.has(id))return jobs.get(id);
 const job=(async()=>{
  const run=async()=>{
   const a=await transaction(s=>{const a=s.read(id);if(!a||a.deletedAt)throw Error('Article not found.');return a});
   if(!readingOnly&&a.questions.length||readingOnly&&await transaction(s=>s.readingComplete(a)))return a;
   if(!aiStatus().connected)throw Error('Connect your AI service in Settings. Your article is saved.');
   const pack=await window.WebAI.generate(a,(await transaction(s=>s.settings())).language,readingOnly);
   return transaction(s=>{const latest=s.read(id);if(!latest||latest.deletedAt||(latest.revision||1)!==(a.revision||1))throw Error('The article changed during generation. No existing work was replaced.');if(!readingOnly&&latest.questions.length)return latest;const result=s.applyPack(id,pack,readingOnly);result.usage=pack.usage;return s.write(result)});
  };
  try{
   // An origin-wide lock prevents duplicate requests from another tab.
   if(!navigator.locks)throw Error('This browser cannot safely coordinate AI requests. Use a current version of Chrome, Edge or Safari.');
   return await navigator.locks.request('daily-press-generation',run);
  }catch(e){await transaction(s=>{const a=s.read(id);if(a&&!a.deletedAt){if(readingOnly){a.readingError=e.message;a.readingStatus='error'}else if(!a.questions.length){a.status='error';a.error=e.message}s.write(a)}});throw e}
 })().finally(()=>jobs.delete(id));jobs.set(id,job);return job;
}
function validArticle(a){
 const string=v=>typeof v==='string';
 if(!a||!string(a.id)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(a.id)||!string(a.raw)||a.raw.length>120000||!string(a.title)||!string(a.source)||!Number.isFinite(Date.parse(a.createdAt))||!Array.isArray(a.paragraphs)||!a.paragraphs.length||a.paragraphs.some(p=>!string(p))||!Array.isArray(a.questions)||!Array.isArray(a.vocabulary))throw Error('This backup contains an invalid article. Nothing was imported.');
 if(a.date!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!Number.isFinite(Date.parse(a.date))))throw Error('Invalid publication date.');
 if(a.revision!=null&&(!Number.isInteger(a.revision)||a.revision<1))throw Error('Invalid article version.');
 for(const k of ['sourceCategory','kicker','subtitle','koreanTranslation'])if(a[k]!=null&&!string(a[k]))throw Error('Invalid article metadata.');
 for(const k of ['keywords','topics','summary','summaryKorean'])if(a[k]!=null&&(!Array.isArray(a[k])||a[k].some(v=>!string(v))))throw Error('Invalid article list.');
 if(a.questions.some(q=>!q||!/^q\d+$/.test(q.id)||!['comprehension','vocabulary'].includes(q.kind)||!string(q.prompt)||!string(q.skill)||!string(q.explanation)||!string(q.evidence)||!Array.isArray(q.options)||q.options.length!==4||q.options.some(v=>!string(v))||!Number.isInteger(q.correct)||q.correct<0||q.correct>3))throw Error('This backup contains invalid questions. Nothing was imported.');
 for(const k of ['paragraphVocabulary','paragraphStudy'])if(a[k]!=null&&(!Array.isArray(a[k])||a[k].some(p=>!Number.isInteger(p?.paragraph)||!Array.isArray(p.words)||p.words.some(w=>!string(w?.term)||!string(w.meaning)))))throw Error('Invalid paragraph vocabulary.');
 if(a.vocabulary.some(w=>!string(w?.term)||!string(w.meaning)||!string(w.example)))throw Error('Invalid vocabulary.');
 if(a.versions!=null){if(!Array.isArray(a.versions)||a.versions.length>1000)throw Error('Invalid article versions.');for(const version of a.versions)validArticle(version);}
}
window.DailyPressWeb={
 async api(url,method='GET',p={}){
  if(url==='/api/state')return {...await transaction(s=>s.state()),ai:aiStatus()};
  if(url==='/api/connect'){await window.WebAI.connect(p);return aiStatus()}
  if(url==='/api/disconnect'){window.WebAI.disconnect();return aiStatus()}
  const match=url.match(/^\/api\/articles\/([a-f0-9-]+)(?:\/(generate|reading|attempts|text|trash|restore))?$/);
  if(match&&['generate','reading'].includes(match[2]))return generateStudy(match[1],match[2]==='reading');
  return transaction(s=>{
   if(url==='/api/articles'&&method==='POST')return s.create(p.raw);
   if(url==='/api/settings'&&method==='PATCH')return s.settings(p);
   if(!match)throw Error('Unknown request.');const id=match[1],a=s.read(id);if(!a)throw Error('Article not found.');
   if(jobs.has(id)&&['text','trash'].includes(match[2]))throw Error('Wait for generation to finish before editing or deleting.');
   if(match[2]==='trash')return s.trash(id);
   if(match[2]==='restore')return s.trash(id,true);
   if(a.deletedAt)throw Error('Restore this article from Archive first.');
   if(match[2]==='text')return s.editText(id,p);
   if(match[2]==='attempts')return s.attempt(id,p);
   if(!match[2]&&method==='PATCH')return s.patchArticle(id,p);
   throw Error('Unknown request.');
  });
 },
 busy:()=>jobs.size>0,
 async backup(){return transaction((s,d)=>({format:'daily-press-backup',version:1,exportedAt:new Date().toISOString(),articles:d.articles.map(x=>JSON.parse(x.document)),attempts:d.attempts.map(x=>JSON.parse(x.document)),settings:s.settings()}))},
 async importBackup(text){
  if(jobs.size)throw Error('Wait for generation to finish before importing.');
  if(text.length>30000000)throw Error('Choose a backup smaller than 30 MB.');
  if(/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,}/.test(text))throw Error('This backup contains an API key. Remove it from the backup before importing.');
  let data;try{data=JSON.parse(text)}catch{throw Error('Choose a Daily Press JSON backup file.')}
  if(data?.format!=='daily-press-backup'||data.version!==1||!Array.isArray(data.articles)||!Array.isArray(data.attempts)||data.articles.length>5000||data.attempts.length>50000)throw Error('This is not a supported Daily Press backup.');
  data.articles.forEach(validArticle);
  if(new Set(data.articles.map(a=>a.id)).size!==data.articles.length||new Set(data.attempts.map(r=>r.id)).size!==data.attempts.length)throw Error('The backup contains duplicate records.');
  for(const r of data.attempts){const a=data.articles.find(a=>a.id===r?.articleId),version=a&&((a.revision||1)===(r.revision||1)?a:a.versions?.find(v=>(v.revision||1)===(r.revision||1)));if(!a||!version||typeof r.id!=='string'||r.id.length>80||typeof r.title!=='string'||!Number.isFinite(Date.parse(r.date))||!Array.isArray(r.responses)||!r.responses.length||r.responses.some(v=>!version.questions.some(q=>q.id===v.id)||!Number.isInteger(v.choice)||v.choice<0||v.choice>3||typeof v.correct!=='boolean')||r.total!==r.responses.length||r.correct!==r.responses.filter(v=>v.correct).length)throw Error('The backup contains an invalid score. Nothing was imported.');}
  return transaction((s,d)=>{
   let added=0,skipped=0,attempts=0;const accepted=new Set(),empty=!d.articles.length;
   for(const a of data.articles){const key=a.raw.replace(/\s+/g,' ').toLowerCase(),existing=d.articles.find(x=>x.id===a.id||x.fingerprint===key);if(existing){skipped++;if(existing.id===a.id&&existing.document===JSON.stringify(a))accepted.add(a.id);continue}d.articles.push({id:a.id,fingerprint:key,document:JSON.stringify(a),created_at:a.createdAt});accepted.add(a.id);added++}
   for(const r of data.attempts)if(accepted.has(r.articleId)&&!d.attempts.some(x=>x.id===r.id)){d.attempts.push({id:r.id,article_id:r.articleId,document:JSON.stringify(r),created_at:r.date});attempts++}
   if(empty&&data.settings)s.settings(data.settings);
   return {added,skipped,attempts};
  });
 },
 download(name,text,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 },
 calendar(time){
  const date=new Date(),[h,m]=time.split(':');date.setHours(+h,+m,0,0);if(date<new Date())date.setDate(date.getDate()+1);
  const pad=n=>String(n).padStart(2,'0'),local=`${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`,stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  this.download('Daily-Press-reminder.ics',['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Mohani Lab//Daily Press//EN','BEGIN:VEVENT','UID:daily-press-reading@local','DTSTAMP:'+stamp,'DTSTART:'+local,'DURATION:PT15M','RRULE:FREQ=DAILY','SUMMARY:Daily Press - time to read','DESCRIPTION:Read an article and complete your study set.','BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:Daily Press - time to read','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n'),'text/calendar');
 }
};
})();
