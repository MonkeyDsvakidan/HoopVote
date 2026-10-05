const cfg = window.HOOPVOTE_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('PASTE_') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes('PASTE_');
const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = v => new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const initials = n => (n||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const avatarUrl = path => path ? `${cfg.supabaseUrl}/storage/v1/object/public/avatars/${String(path).split('/').map(encodeURIComponent).join('/')}` : '';
// Runder Platzhalter mit Initialen bzw. Profilbild (imgClass = Grössenklasse, z. B. 'avatar-img-34').
const avatarInitials = name => `<div class="avatar">${initials(name)}</div>`;
const avatarHtml = (name, path, imgClass) => path ? `<img class="${imgClass}" src="${esc(avatarUrl(path))}" alt="">` : avatarInitials(name);

function showConfigError(){
  document.body.innerHTML = `<div class="app"><section class="card" style="margin-top:60px"><div class="eyebrow">Backend noch nicht verbunden</div><h1>HoopVote ist bereit für Supabase</h1><p class="muted">Trage die Supabase Project URL und den öffentlichen anon key in <code>config.js</code> ein. Danach sind Login, Datenbank und Profilbilder aktiv.</p></section></div>`;
}
async function sessionUser(){ if(!sb) return null; const {data}=await sb.auth.getUser(); return data.user; }
async function profile(){ if(!sb) return null; const {data,error}=await sb.rpc('my_state'); if(error) throw error; return data?.[0]||null; }
async function guard({admin=false, allowPending=false, skipRatings=false}={}){
  if(!configured){ showConfigError(); throw new Error('not configured'); }
  // Benutzer, Profil und Rating-Status gleichzeitig abfragen statt nacheinander (spart zwei Wartezeiten).
  const profileReq=profile(), ratingReq=skipRatings?null:Promise.resolve(sb.rpc('current_rating_status'));
  profileReq.catch(()=>{}); ratingReq?.catch(()=>{});
  const user=await sessionUser(); if(!user){ location.href=`index.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`; throw new Error('no auth'); }
  const p=await profileReq;
  if(!p){ location.href='index.html?onboarding=1'; throw new Error('no profile'); }
  if(!allowPending && p.status!=='approved'){ location.href='index.html?pending=1'; throw new Error('pending'); }
  if(p.status==='approved' && !skipRatings){
    const {data:ratingStatus,error:ratingError}=await ratingReq;
    if(ratingError) throw ratingError;
    const rs=ratingStatus?.[0];
    if(rs && Number(rs.missing_count)>0){ location.href='ratings.html'; throw new Error('ratings required'); }
  }
  if(admin && p.role!=='admin'){ location.href='vote.html'; throw new Error('not admin'); }
  const adminLink=$('[data-admin-link]'); if(adminLink) adminLink.style.display=p.role==='admin'?'':'none';
  const name=$('[data-user-name]'); if(name) name.textContent=p.display_name;
  return p;
}
// Dialoge im App-Stil statt Browser-Fenster. ask() liefert true/false, notify() wartet auf «OK».
function dialog(message,{ok='OK',cancel=null,danger=false}={}){
  return new Promise(resolve=>{
    const wrap=document.createElement('div'); wrap.className='dialog-backdrop';
    wrap.innerHTML=`<div class="dialog" role="alertdialog" aria-modal="true"><p class="dialog-text"></p><div class="dialog-actions">${cancel?'<button type="button" class="btn secondary" data-r="0"></button>':''}<button type="button" class="btn ${danger?'danger':'primary'}" data-r="1"></button></div></div>`;
    wrap.querySelector('.dialog-text').textContent=String(message);
    wrap.querySelector('[data-r="1"]').textContent=ok;
    if(cancel) wrap.querySelector('[data-r="0"]').textContent=cancel;
    const key=e=>{ if(e.key==='Escape') done(!cancel); else if(e.key==='Enter'){ e.preventDefault(); done(true); } };
    const done=v=>{ document.removeEventListener('keydown',key); wrap.remove(); resolve(v); };
    wrap.onclick=e=>{ const b=e.target.closest('[data-r]'); if(b) done(b.dataset.r==='1'); else if(e.target===wrap && cancel) done(false); };
    document.addEventListener('keydown',key);
    document.body.appendChild(wrap); wrap.querySelector('[data-r="1"]').focus();
  });
}
const ask=(message,{danger=false}={})=>dialog(message,{cancel:'Abbrechen',danger});
const notify=message=>dialog(message);
async function signOut(){ if(sb) await sb.auth.signOut(); location.href='index.html'; }
function wireSignOut(){ $$('[data-signout]').forEach(b=>b.onclick=signOut); }
// Verkleinert ein Foto im Browser (kürzere Seite max. 400 px) zu JPEG. null, wenn nicht möglich oder nicht kleiner.
async function shrinkImage(file,max=400){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image(); img.src=url; await img.decode();
    const w0=img.naturalWidth,h0=img.naturalHeight; if(!w0||!h0) return null;
    const s=Math.min(1,max/Math.min(w0,h0),(max*3)/Math.max(w0,h0));
    const w=Math.max(1,Math.round(w0*s)),h=Math.max(1,Math.round(h0*s));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.85));
    return blob && blob.type==='image/jpeg' && blob.size<file.size ? blob : null;
  }catch{ return null; }
  finally{ URL.revokeObjectURL(url); }
}
async function uploadAvatar(file,userId){
  if(!file) throw new Error('Profilfoto fehlt.');
  const small=await shrinkImage(file);
  const ext=small?'jpg':(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${userId}/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('avatars').upload(path,small||file,{upsert:false,contentType:small?'image/jpeg':(file.type||'image/jpeg')});
  if(error) throw error; return path;
}
window.HoopVote={sb,configured,$,$$,esc,fmtDate,initials,avatarUrl,avatarInitials,avatarHtml,ask,notify,sessionUser,profile,guard,signOut,wireSignOut,uploadAvatar,showConfigError};
