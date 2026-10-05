const {chromium}=require('playwright');const {spawn}=require('child_process');const [A,B]=process.argv.slice(2);
const PAGES=['vote','stats','ratings','settings','admin'];
async function run(b,pg){const ctx=await b.newContext();await ctx.addInitScript(()=>{window.__mockDelay=100});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='localhost')return r.continue();if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({path:__dirname+'/mock-supabase.js',contentType:'application/javascript'});if(r.request().resourceType()==='image')return r.fulfill({body:Buffer.alloc(0)});return r.abort()});
 const p=await ctx.newPage();await p.goto(`http://localhost:8100/${pg}.html`);await p.waitForTimeout(2500);
 const r=await p.evaluate(()=>{const l=window.__log||[];if(!l.length)return null;const s=Math.min(...l.map(x=>x[1])),e=Math.max(...l.map(x=>x[2]));return Math.round(e-s)});await ctx.close();return r;}
(async()=>{const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});const res={};
 for(const [k,dir] of [['A',A],['B',B]]){const s=spawn('python3',['-m','http.server','8100'],{cwd:dir,stdio:'ignore'});await new Promise(r=>setTimeout(r,800));
  for(const pg of PAGES){const t=[];for(let i=0;i<3;i++)t.push(await run(b,pg));t.sort((x,y)=>x-y);res[pg+k]=t[1];}s.kill();await new Promise(r=>setTimeout(r,300));}
 console.log('Seite      vorher   nachher');for(const pg of PAGES)console.log(`${pg.padEnd(9)} ${String(res[pg+'A']).padStart(5)} ms ${String(res[pg+'B']).padStart(6)} ms`);await b.close()})();
