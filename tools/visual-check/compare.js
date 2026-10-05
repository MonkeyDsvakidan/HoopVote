// Vergleicht alle Seiten zwischen zwei lokalen Servern: berechnete Styles jedes Elements + Screenshot-Pixel.
const {chromium}=require('playwright'); const fs=require('fs');
const [A,B]=[process.argv[2],process.argv[3]]; const out=process.argv[4]||'.'; const {spawn}=require('child_process');
const serve=async dir=>{const s=spawn('python3',['-m','http.server','8100'],{cwd:dir,stdio:'ignore'});await new Promise(r=>setTimeout(r,800));return s};
const PAGES=['index','vote','stats','ratings','settings','admin']; const W=[[390,844],[1280,900]];
const png1x1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
async function snap(b,port,page,[w,h]){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='localhost')return r.continue();if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({path:__dirname+'/mock-supabase.js',contentType:'application/javascript'});if(r.request().resourceType()==='image')return r.fulfill({body:png1x1,contentType:'image/png'});return r.abort()});
 const p=await ctx.newPage(); await p.clock.install({time:new Date('2026-10-05T12:00:00Z')}); await p.clock.pauseAt(new Date('2026-10-05T12:00:00Z'));
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://localhost:${port}/${page}.html`); await p.clock.runFor(2000); await p.waitForTimeout(300); await p.clock.runFor(1000);
 const url=new URL(p.url()).pathname;
 const styles=await p.evaluate(()=>{const props=['display','position','width','height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','color','background-color','background-image','border-top-width','border-top-color','border-top-style','border-radius','font-size','font-weight','gap','grid-template-columns','align-items','justify-content','object-fit','flex-direction','visibility'];
  const r=[];const walk=(el,path)=>{const cs=getComputedStyle(el);const box=el.getBoundingClientRect();r.push(path+' '+props.map(k=>k+'='+cs.getPropertyValue(k)).join(';')+` box=${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`);[...el.children].forEach((c,i)=>walk(c,path+'>'+c.tagName.toLowerCase()+(c.id?'#'+c.id:'')+'['+i+']'))};walk(document.body,'body');return r});
 const shot=await p.screenshot({fullPage:true}); const calls=await p.evaluate(()=>window.__calls||[]); await ctx.close(); return {url,styles,shot,errs,calls};}
(async()=>{const b=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});let allSame=true;
 const res={};for(const [k,dir] of [['a',A],['c',B]]){const srv=await serve(dir);res[k]={};for(const pg of PAGES)for(const vp of W)res[k][pg+vp[0]]=await snap(b,8100,pg,vp);srv.kill();await new Promise(r=>setTimeout(r,300));}
 for(const pg of PAGES)for(const vp of W){const a=res.a[pg+vp[0]],c=res.c[pg+vp[0]];
  const diff=[];const n=Math.max(a.styles.length,c.styles.length);for(let i=0;i<n;i++)if(a.styles[i]!==c.styles[i])diff.push([a.styles[i],c.styles[i]]);
  const shotSame=Buffer.compare(a.shot,c.shot)===0; fs.writeFileSync(`${out}/${pg}-${vp[0]}-A.png`,a.shot);fs.writeFileSync(`${out}/${pg}-${vp[0]}-B.png`,c.shot);
  const callsSame=JSON.stringify([...a.calls].sort())===JSON.stringify([...c.calls].sort());const same=callsSame&&a.url===c.url&&diff.length===0&&shotSame&&JSON.stringify(a.errs)===JSON.stringify(c.errs);if(!same)allSame=false;
  console.log(`${same?'GLEICH     ':'UNTERSCHIED'} ${pg.padEnd(8)} ${vp[0]}px  url=${c.url} elemente=${c.styles.length} style-diffs=${diff.length} pixel=${shotSame?'identisch':'anders'} fehler=${c.errs.length} aufrufe=${c.calls.length} gleiche-abfragen=${callsSame}`);if(!callsSame){console.log('   A: '+a.calls.join(','));console.log('   B: '+c.calls.join(','));}
  for(const [x,y] of diff.slice(0,4)){console.log('   A: '+(x||'-').slice(0,300));console.log('   B: '+(y||'-').slice(0,300));}
  if(c.errs.length)console.log('   fehler: '+c.errs.join(' | '));}
 await b.close();process.exit(allSame?0:1)})();
