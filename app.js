const cfg = window.HOOPVOTE_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('PASTE_') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes('PASTE_');
const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = v => new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const initials = n => (n||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const avatarUrl = path => path ? `${cfg.supabaseUrl}/storage/v1/object/public/avatars/${path}` : '';

function showConfigError(){
  document.body.innerHTML = `<div class="app"><section class="card" style="margin-top:60px"><div class="eyebrow">Backend noch nicht verbunden</div><h1>HoopVote ist bereit für Supabase</h1><p class="muted">Trage die Supabase Project URL und den öffentlichen anon key in <code>config.js</code> ein. Danach sind Login, Datenbank und Profilbilder aktiv.</p></section></div>`;
}
async function sessionUser(){ if(!sb) return null; const {data}=await sb.auth.getUser(); return data.user; }
async function profile(){ if(!sb) return null; const {data,error}=await sb.rpc('my_state'); if(error) throw error; return data?.[0]||null; }
async function guard({admin=false, allowPending=false, skipRatings=false}={}){
  if(!configured){ showConfigError(); throw new Error('not configured'); }
  const user=await sessionUser(); if(!user){ location.href=`index.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`; throw new Error('no auth'); }
  const p=await profile();
  if(!p){ location.href='index.html?onboarding=1'; throw new Error('no profile'); }
  if(!allowPending && p.status!=='approved'){ location.href='index.html?pending=1'; throw new Error('pending'); }
  if(p.status==='approved' && !skipRatings){
    const {data:ratingStatus,error:ratingError}=await sb.rpc('current_rating_status');
    if(ratingError) throw ratingError;
    const rs=ratingStatus?.[0];
    if(rs && Number(rs.missing_count)>0){ location.href='ratings.html'; throw new Error('ratings required'); }
  }
  if(admin && p.role!=='admin'){ location.href='vote.html'; throw new Error('not admin'); }
  const adminLink=$('[data-admin-link]'); if(adminLink) adminLink.style.display=p.role==='admin'?'':'none';
  const name=$('[data-user-name]'); if(name) name.textContent=p.display_name;
  return p;
}
async function signOut(){ if(sb) await sb.auth.signOut(); location.href='index.html'; }
function wireSignOut(){ $$('[data-signout]').forEach(b=>b.onclick=signOut); }
async function uploadAvatar(file,userId){
  if(!file) throw new Error('Profilfoto fehlt.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${userId}/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('avatars').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
  if(error) throw error; return path;
}
window.HoopVote={sb,configured,$,$$,esc,fmtDate,initials,avatarUrl,sessionUser,profile,guard,signOut,wireSignOut,uploadAvatar,showConfigError};
