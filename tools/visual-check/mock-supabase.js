// Attrappe für supabase-js: keine Netzwerkzugriffe, feste Beispieldaten.
(function(){
const page=location.pathname.split('/').pop()||'index.html';
const T='t1',ME='p1',SEASON='s1',SESSION='x1';
const now=Date.now(), iso=d=>new Date(d).toISOString();
const players=[['p1','Mike'],['p2','Jonas'],['p3','Leo'],['p4','Sami'],['p5','Nico'],['p6','Tim']].map(([id,n],i)=>({id,profile_id:id,display_name:n,avatar_path:i!==2?`u${i}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa${i}.jpg`:null,status:'approved',created_at:iso(now-864e5*(10-i))}));
const cats=[{id:'c1',name:'MVP'},{id:'c2',name:'Bester Assist'},{id:'c3',name:'Bester Scorer'},{id:'c4',name:'Beste Defense'}];
const SC=window.__scenario||'';const loggedIn=SC?SC!=='loggedout':page!=='index.html';
const rpcs={
 my_state:[{profile_id:ME,team_id:T,display_name:'Mike',avatar_path:'u1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1.jpg',role:'admin',status:'approved'}],
 current_rating_status: page==='ratings.html'?[{season_id:SEASON,season_name:'Saison 26/27',phase:'start',missing_count:2,total_targets:5}]:[{season_id:SEASON,season_name:'Saison 26/27',phase:'start',missing_count:0,total_targets:5}],
 pending_rating_targets:players.slice(1,3),
 current_vote_session:[{id:SESSION,title:'Training Do',started_at:iso(now-36e5*5),ends_at:iso(now+36e5*43),eligible_count:6,submitted_count:2,has_submitted:false}],
 eligible_candidates:players.slice(1),
 open_session_progress:[{session_id:SESSION,title:'Training Do',eligible_count:6,submitted_count:2}],
 leaderboard:players.map((x,i)=>({...x,points:30-i*4,first_places:3-Math.min(i,3)})),
 category_leaderboard:cats.flatMap(c=>players.slice(0,3).map((x,i)=>({category_id:c.id,category_name:c.name,profile_id:x.id,display_name:x.display_name,points:12-i*3}))),
 stats_summary:[{session_count:3,avg_participation:83.33,total_points:720}],
 skill_rating_summary:players.map((x,i)=>({...x,rating_count:i<4?5:2,shooting:i<4?6.5:null,layups:i<4?7:null,ballhandling:i<4?5.5:null,passing:i<4?6:null,defense:i<4?7.5:null,rebounding:i<4?6:null,conditioning:i<4?8:null,basketball_iq:i<4?6.5:null,teamplay:i<4?7:null})),
 admin_get_invite:[{invite_token:'abc123'}],
 admin_rating_progress:[{phase:'start',submitted_count:20,required_count:30}],
};
const tables={
 profiles:q=>q.eq.status==='pending'?[{id:'p9',display_name:'Neu',avatar_path:null,created_at:iso(now-36e5)}]:players,
 seasons:()=>[{id:SEASON,team_id:T,name:'Saison 26/27',status:'active',rating_stage:'start',starts_at:'2026-09-01',ends_at:null,created_at:iso(now-864e5*30)},{id:'s0',team_id:T,name:'Saison 25/26',status:'closed',rating_stage:'complete',starts_at:'2025-09-01',ends_at:'2026-06-30',created_at:iso(now-864e5*400)}],
 sessions:()=>[{id:SESSION,title:'Training Do',status:'open',started_at:iso(now-36e5*5),ends_at:iso(now+36e5*43),closed_at:null},{id:'x0',title:'Training Mo',status:'closed',started_at:iso(now-864e5*3),ends_at:iso(now-864e5),closed_at:iso(now-864e5)}],
 categories:()=>cats,
};
window.__calls=[];window.__log=[];const D=window.__mockDelay||0;const wait=v=>D?new Promise(r=>setTimeout(()=>r(v),D)):Promise.resolve(v);const t0=()=>performance.now();
const client={
 auth:{getUser:async()=>{__calls.push('getUser');const a=t0();const v=await wait({data:{user:loggedIn?{id:'u1',email:'mike@example.com'}:null},error:null});__log.push(['getUser',a,t0()]);return v},
  signInWithPassword:async()=>{__calls.push('signIn');return {error:{message:'mock'}}},signUp:async()=>{__calls.push('signUp');return {error:{message:'mock'}}},
  resend:async()=>{__calls.push('resend');return {error:null}},signOut:async()=>{__calls.push('signOut');return {}},updateUser:async()=>{__calls.push('updateUser');return {error:null}},
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null}})},
 rpc:(n,a)=>({then:async(res,rej)=>{__calls.push('rpc:'+n);const s0=t0();let v;if(!loggedIn&&(n==='my_state'||n==='current_rating_status'))v={data:null,error:{message:'permission denied for function '+n}};else if(n==='my_state'&&SC==='noprofile')v={data:[],error:null};else if(n==='my_state'&&(SC==='pending'||SC==='player'))v={data:[{...rpcs.my_state[0],status:SC==='pending'?'pending':'approved',role:'player'}],error:null};else if(n==='current_rating_status'&&SC==='ratingsmissing')v={data:[{...rpcs.current_rating_status[0],missing_count:3}],error:null};else if(n==='current_rating_status'&&SC==='pending')v={data:[],error:null};else if(n in rpcs)v={data:JSON.parse(JSON.stringify(rpcs[n])),error:null};else v={data:null,error:{message:'mock: write blocked '+n}};v=await wait(v);__log.push(['rpc:'+n,s0,t0()]);return res(v)}}),
 from:t=>{const q={eq:{}};const ch={select:()=>ch,eq:(k,v)=>{q.eq[k]=v;return ch},order:()=>ch,limit:()=>ch,then:(res,rej)=>{__calls.push('from:'+t);const s0=t0();return wait({data:JSON.parse(JSON.stringify((tables[t]||(()=>[]))(q))),error:null}).then(v=>{__log.push(['from:'+t,s0,t0()]);return v}).then(res,rej)}};return ch},
 storage:{from:()=>({upload:async()=>{__calls.push('upload');return {error:{message:'mock'}}}})},
};
window.supabase={createClient:()=>client};
})();
