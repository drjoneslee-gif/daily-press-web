const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'_site');
const assets=['index.html','app.js','style.css','ai.js','storage.js','icon.svg','manifest.webmanifest'];
fs.mkdirSync(out,{recursive:true});
for(const file of assets){
 const text=fs.readFileSync(path.join(root,file),'utf8');
 if(/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,}/.test(text))throw Error('Possible credential found in '+file+'. Deployment stopped.');
 if(file.endsWith('.js'))new Function(text);
 fs.writeFileSync(path.join(out,file),text);
}
const hash=crypto.createHash('sha256').update(assets.map(f=>fs.readFileSync(path.join(root,f))).join('')).digest('hex').slice(0,12);
const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8').replace(/daily-press-[a-f0-9]+-/g,'daily-press-'+hash+'-');
new Function(worker);fs.writeFileSync(path.join(out,'sw.js'),worker);fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Checked and prepared '+assets.length+' public app assets. Version '+hash+'. No private data is included.');
