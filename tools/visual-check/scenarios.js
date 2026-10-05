const {chromium}=require('playwright');const {spawn}=require('child_process');
const [A,B]=process.argv.slice(2);
const SC=['loggedout','noprofile','pending','player','ratingsmissing'];const PAGES=['vote','stats','ratings','settings','admin'];
async function run(b,sc,pg){const ctx=await b.newContext();await ctx.addInitScript(s=>{window.__scenario=s},sc);
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='localhost')return r.continue();if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({path:__dirname+'/mock-supabase.js',contentType:'application/javascript'});if(r.request().resourceType()==='image')return r.fulfill({body:Buffer.alloc(0)});return r.abort()});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 // Weiterleitungen protokollieren (erste Zielseite zählt, index.js leitet ggf. weiter)
 const navs=[];p.on('framenavigated',f=>{if(f===p.mainFrame())navs.push(new URL(f.url()).pathname.slice(1)+new URL(f.url()).search)});
 await p.goto(`http://localhost:8100/${pg}.html`);await p.waitForTimeout(1200);await ctx.close();return navs.slice(0,2).join(' → ')+(errs.length?'  [Abbruch: '+[...new Set(errs)].join(',')+']':'');}
(async()=>{const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});const res={};
 for(const [k,dir] of [['A',A],['B',B]]){const s=spawn('python3',['-m','http.server','8100'],{cwd:dir,stdio:'ignore'});await new Promise(r=>setTimeout(r,800));
  for(const sc of SC)for(const pg of PAGES)res[sc+'|'+pg+'|'+k]=await run(b,sc,pg);s.kill();await new Promise(r=>setTimeout(r,300));}
 let ok=true;for(const sc of SC)for(const pg of PAGES){const a=res[sc+'|'+pg+'|A'],c=res[sc+'|'+pg+'|B'];const same=a===c;if(!same)ok=false;
  console.log(`${same?'GLEICH     ':'UNTERSCHIED'} ${sc.padEnd(15)} ${pg.padEnd(9)} ${c}${same?'':'\n            vorher: '+a}`);}
 await b.close();process.exit(ok?0:1)})();
