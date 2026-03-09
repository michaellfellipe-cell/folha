'use client'
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

const SUPABASE_URL = "https://hgsqnehlmesizubpmbwz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnc3FuZWhsbWVzaXp1YnBtYnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDcwMzgsImV4cCI6MjA4NzgyMzAzOH0.lfJdQ98MI19VXpPJLf0VP84T6OROVnL9_z0Cy1Rh5nA";

async function sbReq(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) { const t = await res.text(); console.error("SB error", path, t); return null; }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { const d = await res.json(); return d; }
  return null;
}

// Library
async function dbGetLibrary(uid) { const r = await sbReq("GET", `folha_library?user_id=eq.${encodeURIComponent(uid)}&order=added_at.desc`, null); return r || []; }
async function dbUpsertBook(uid, book) { return sbReq("POST", "folha_library", { user_id: uid, title: book.title, author: book.author || "", year: book.year || "", genre: book.genre || "", pages: book.pages || null, rating: book.rating || "loved", added_at: book.addedAt || Date.now() }); }
async function dbUpdateBookRating(uid, title, rating) { return sbReq("PATCH", `folha_library?user_id=eq.${encodeURIComponent(uid)}&title=eq.${encodeURIComponent(title)}`, { rating }); }
async function dbDeleteBook(uid, title) { return sbReq("DELETE", `folha_library?user_id=eq.${encodeURIComponent(uid)}&title=eq.${encodeURIComponent(title)}`, null); }

// Reading
async function dbGetReading(uid) { const r = await sbReq("GET", `folha_reading?user_id=eq.${encodeURIComponent(uid)}&order=start_date.desc`, null); return (r || []).map(x => ({ book: x.book, pages: x.pages, totalPages: x.total_pages, startDate: x.start_date, _id: x.id })); }
async function dbAddReading(uid, entry) { return sbReq("POST", "folha_reading", { user_id: uid, book: entry.book, pages: entry.pages, total_pages: entry.totalPages, start_date: entry.startDate }); }
async function dbUpdateReadingPages(uid, title, pages) { return sbReq("PATCH", `folha_reading?user_id=eq.${encodeURIComponent(uid)}&book->>title=eq.${encodeURIComponent(title)}`, { pages }); }
async function dbDeleteReading(uid, title) { return sbReq("DELETE", `folha_reading?user_id=eq.${encodeURIComponent(uid)}&book->>title=eq.${encodeURIComponent(title)}`, null); }

// Finished
async function dbGetFinished(uid) { const r = await sbReq("GET", `folha_finished?user_id=eq.${encodeURIComponent(uid)}&order=finished_at.desc`, null); return (r || []).map(x => ({ book: x.book, pages: x.pages, totalPages: x.total_pages, startDate: x.start_date, finishedAt: x.finished_at })); }
async function dbAddFinished(uid, entry) { return sbReq("POST", "folha_finished", { user_id: uid, book: entry.book, pages: entry.pages, total_pages: entry.totalPages, start_date: entry.startDate, finished_at: entry.finishedAt || Date.now() }); }

// Notes
async function dbGetNotes(uid) { const r = await sbReq("GET", `folha_notes?user_id=eq.${encodeURIComponent(uid)}&order=date.desc`, null); const map = {}; (r || []).forEach(n => { if (!map[n.book_title]) map[n.book_title] = []; map[n.book_title].push({ type: n.type, text: n.text, date: n.date, _id: n.id }); }); return map; }
async function dbAddNote(uid, bookTitle, type, text) { return sbReq("POST", "folha_notes", { user_id: uid, book_title: bookTitle, type, text, date: Date.now() }); }
async function dbDeleteNote(uid, noteId) { return sbReq("DELETE", `folha_notes?id=eq.${noteId}`, null); }

// Wishlist
async function dbGetWishlist(uid) { const r = await sbReq("GET", `folha_wishlist?user_id=eq.${encodeURIComponent(uid)}&order=added_at.desc`, null); return (r || []).map(x => ({ title: x.title, author: x.author, year: x.year, genre: x.genre, pages: x.pages, priority: x.priority, addedAt: x.added_at })); }
async function dbUpsertWish(uid, book) { return sbReq("POST", "folha_wishlist", { user_id: uid, title: book.title, author: book.author || "", year: book.year || "", genre: book.genre || "", pages: book.pages || null, priority: book.priority || "media", added_at: book.addedAt || Date.now() }); }
async function dbDeleteWish(uid, title) { return sbReq("DELETE", `folha_wishlist?user_id=eq.${encodeURIComponent(uid)}&title=eq.${encodeURIComponent(title)}`, null); }
async function dbUpdateWishPriority(uid, title, priority) { return sbReq("PATCH", `folha_wishlist?user_id=eq.${encodeURIComponent(uid)}&title=eq.${encodeURIComponent(title)}`, { priority }); }

// User data (profile, goal, ai, challenges, followers, following, history)
async function dbGetUserData(uid) { const r = await sbReq("GET", `folha_user_data?user_id=eq.${encodeURIComponent(uid)}`, null); return (r && r[0]) || null; }
async function dbSetUserData(uid, data) { return sbReq("POST", "folha_user_data", { user_id: uid, ...data }); }
async function dbPatchUserData(uid, patch) { const exists = await dbGetUserData(uid); if (exists) return sbReq("PATCH", `folha_user_data?user_id=eq.${encodeURIComponent(uid)}`, patch); else return sbReq("POST", "folha_user_data", { user_id: uid, ...patch }); }

// Auth stays in localStorage (just session, not data)
async function sGet(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}}
async function sSet(k,v){try{if(v===null){localStorage.removeItem(k);}else{localStorage.setItem(k,JSON.stringify(v));}}catch{}}

const TR = {
  pt:{appName:"Folha",discover:"Descobrir",shelf:"Estante",reading:"Lendo",timeline:"Linha do Tempo",challenges:"Desafios",notes:"Notas",wishlist:"Desejos",club:"Clube",social:"Social",home:"Início",search:"Buscar",signIn:"Entrar",signUp:"Criar Conta",logout:"Sair",email:"E-mail ou Celular",password:"Senha",firstName:"Nome",lastName:"Sobrenome",birthday:"Data de Aniversário",alreadyHave:"Já tem conta?",noAccount:"Não tem conta?",followers:"seguidores",following:"seguindo",follow:"Seguir",unfollow:"Deixar de seguir",notifications:"Notificações",feed:"Feed",save:"Salvar",cancel:"Cancelar",booksRead:"livros lidos",loved:"amei",readingNow:"lendo agora",wishes:"desejos",challenge:"Desafio",badge:"Selo",completed:"Concluído",inProgress:"Em andamento",monthlyChallenge:"Desafio Mensal",globalChallenge:"Desafio Global",bookAdded:"Livro adicionado!",profileSaved:"Perfil salvo!",joined:"entrou",completedChallenge:"completou o desafio",startedReading:"começou a ler",newFollower:"novo seguidor",nowFollowing:"está te seguindo",editProfile:"Editar perfil",shareProfile:"Compartilhar",yourBooks:"Seus livros",finishedBooks:"Livros concluídos",noActivity:"Nenhuma atividade ainda. Explore o app!",timelineEmpty:"Sua jornada literária começa quando você concluir o primeiro livro.",lang:"EN"},
  en:{appName:"Folha",discover:"Discover",shelf:"Shelf",reading:"Reading",timeline:"Timeline",challenges:"Challenges",notes:"Notes",wishlist:"Wishlist",club:"Club",social:"Social",home:"Home",search:"Search",signIn:"Sign In",signUp:"Create Account",logout:"Sign Out",email:"Email or Phone",password:"Password",firstName:"First Name",lastName:"Last Name",birthday:"Date of Birth",alreadyHave:"Already have an account?",noAccount:"No account yet?",followers:"followers",following:"following",follow:"Follow",unfollow:"Unfollow",notifications:"Notifications",feed:"Feed",save:"Save",cancel:"Cancel",booksRead:"books read",loved:"loved",readingNow:"reading",wishes:"wishlist",challenge:"Challenge",badge:"Badge",completed:"Completed",inProgress:"In progress",monthlyChallenge:"Monthly Challenge",globalChallenge:"Global Challenge",bookAdded:"Book added!",profileSaved:"Profile saved!",joined:"joined",completedChallenge:"completed the challenge",startedReading:"started reading",newFollower:"new follower",nowFollowing:"is following you",editProfile:"Edit profile",shareProfile:"Share",yourBooks:"Your books",finishedBooks:"Finished books",noActivity:"No activity yet. Explore the app!",timelineEmpty:"Your literary journey begins when you finish your first book.",lang:"PT"},
};

const LangCtx = createContext({lang:"pt",t:TR.pt,toggle:()=>{}});
const useLang = () => useContext(LangCtx);

const yr = new Date().getFullYear();
const mo = new Date().getMonth();
const MONTHS=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTHS_EN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const C={bg:"#0F0D0B",surface:"#1A1714",border:"#2E2820",text:"#EDE8DE",textDim:"#B8A89A",muted:"#6B5D52",accent:"#C8A96E",accentDim:"#9B7E4F",gold:"#D4A853",green:"#6A9E6A",red:"#C4796A",blue:"#85C1E9"};

function bookPalette(title=""){const h=title.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%360;return[`hsl(${h},28%,22%)`,`hsl(${h},45%,55%)`,`hsl(${h},60%,85%)`];}

const CHALLENGES_PT=[{id:"classic",title:"Clássico Eterno",desc:"Leia um clássico da literatura universal",badge:"🏛️",color:"#D4A853",type:"monthly"},{id:"debut",title:"Primeira Vez",desc:"Leia um livro de um autor que nunca leu",badge:"🌱",color:"#6A9E6A",type:"monthly"},{id:"100pages",title:"Maratonista",desc:"Leia 100 páginas em um único dia",badge:"⚡",color:"#85C1E9",type:"global"},{id:"series",title:"Saga Completa",desc:"Termine uma trilogia ou saga",badge:"⚔️",color:"#C4796A",type:"global"},{id:"5books",title:"Cinco Estrelas",desc:"Leia 5 livros que você deu amei",badge:"⭐",color:"#D4A853",type:"global"},{id:"genre",title:"Explorador",desc:"Leia um livro de um gênero diferente do habitual",badge:"🗺️",color:"#8A6AA8",type:"monthly"},{id:"friend",title:"Leitura em Dupla",desc:"Leia o mesmo livro que um amigo",badge:"🤝",color:"#76D7C4",type:"global"},{id:"annual12",title:"Uma por Mês",desc:"Leia pelo menos um livro por mês durante um ano",badge:"📅",color:"#D4A853",type:"global"}];
const CHALLENGES_EN=[{id:"classic",title:"Eternal Classic",desc:"Read a universal literature classic",badge:"🏛️",color:"#D4A853",type:"monthly"},{id:"debut",title:"First Timer",desc:"Read a book by an author you've never read before",badge:"🌱",color:"#6A9E6A",type:"monthly"},{id:"100pages",title:"Marathoner",desc:"Read 100 pages in a single day",badge:"⚡",color:"#85C1E9",type:"global"},{id:"series",title:"Full Saga",desc:"Finish a trilogy or saga",badge:"⚔️",color:"#C4796A",type:"global"},{id:"5books",title:"Five Stars",desc:"Read 5 books you marked as loved",badge:"⭐",color:"#D4A853",type:"global"},{id:"genre",title:"Explorer",desc:"Read a book from an unfamiliar genre",badge:"🗺️",color:"#8A6AA8",type:"monthly"},{id:"friend",title:"Buddy Read",desc:"Read the same book as a friend",badge:"🤝",color:"#76D7C4",type:"global"},{id:"annual12",title:"One a Month",desc:"Read at least one book per month for a year",badge:"📅",color:"#D4A853",type:"global"}];

const G = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0F0D0B;color:#EDE8DE;}
@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fadeIn .45s ease both}
.badge-pop{animation:fadeIn .4s ease both;transition:transform .2s}
.badge-pop:hover{transform:scale(1.08)}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#1A1714}::-webkit-scrollbar-thumb{background:#2E2820}
`;

async function callClaude(system,msg,maxTok=1500){
  const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system,message:msg,maxTokens:maxTok})});
  const d=await res.json();if(d.error)throw new Error(d.error);
  return d.text||"";
}

function Spine({title="",author="",size=66,showText=true}){
  const [bg,ac,tx]=bookPalette(title);const h=Math.round(size*1.42);
  const words=title.split(" ");const lines=[];let cur="";
  for(const w of words){if((cur+" "+w).trim().length>10&&cur){lines.push(cur);cur=w;}else cur=(cur+" "+w).trim();}
  if(cur)lines.push(cur);
  return(<div style={{width:size,height:h,background:bg,flexShrink:0,position:"relative",overflow:"hidden",boxShadow:"3px 4px 16px rgba(0,0,0,.6)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:size>60?"8px 7px":"5px 5px"}}><div style={{position:"absolute",right:0,top:0,bottom:0,width:4,background:ac,opacity:.7}}/><div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"rgba(255,255,255,.06)"}}/>{showText&&lines.slice(0,4).map((l,i)=><span key={i} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:size>60?Math.max(8,size*.13):7,fontWeight:500,color:tx,lineHeight:1.2,display:"block",wordBreak:"break-word",textShadow:"0 1px 2px rgba(0,0,0,.8)",letterSpacing:.3}}>{l}</span>)}{showText&&author&&size>55&&<span style={{fontFamily:"'Jost',sans-serif",fontSize:Math.max(6,size*.09),color:ac,letterSpacing:"0.5px",display:"block",marginTop:"auto",textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap",opacity:.9}}>{author.split(" ").slice(-1)[0]}</span>}</div>);
}
function Dots(){return <div style={{display:"flex",gap:6,alignItems:"center"}}>{[0,.18,.36].map(d=><div key={d} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1.3s ease-in-out ${d}s infinite`}}/>)}</div>;}
function Toast({msg}){return msg?<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.surface,border:`1px solid ${C.border}`,color:C.accent,padding:"11px 22px",fontSize:12,letterSpacing:"1.5px",zIndex:999,animation:"fadeIn .3s ease",whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>{msg}</div>:null;}
function Btn({children,onClick,variant="ghost",disabled,style={},full}){
  const s={primary:{background:C.accent,color:"#0F0D0B",border:"none"},ghost:{background:"transparent",color:C.textDim,border:`1px solid ${C.border}`},danger:{background:"transparent",color:C.red,border:`1px solid ${C.red}`}};
  return <button onClick={onClick} disabled={disabled} style={{padding:"9px 18px",cursor:disabled?"not-allowed":"pointer",fontFamily:"'Jost',sans-serif",fontSize:11,fontWeight:600,letterSpacing:"2px",textTransform:"uppercase",transition:"all .15s",opacity:disabled?0.4:1,width:full?"100%":"auto",...s[variant],...style}}>{children}</button>;
}
function Input({label,value,onChange,type="text",placeholder,error}){
  return(<div style={{marginBottom:16}}>{label&&<label style={{display:"block",fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.muted,marginBottom:7}}>{label}</label>}<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"13px 16px",background:C.surface,border:`1px solid ${error?C.red:C.border}`,color:C.text,fontSize:14,outline:"none"}}/>{error&&<p style={{fontSize:11,color:C.red,marginTop:5}}>{error}</p>}</div>);
}
function Avatar({photo,name,size=36}){
  const initials=(name||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();
  const [bg]=bookPalette(name||"");
  return(<div style={{width:size,height:size,borderRadius:"50%",background:photo?"transparent":bg,border:`1px solid ${C.border}`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{photo?<img src={photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={name}/>:<span style={{fontSize:size*.38,fontFamily:"'Cormorant Garamond',serif",color:"#EDE8DE",fontWeight:500}}>{initials}</span>}</div>);
}

function AuthScreen({onAuth,lang,toggleLang}){
  const t=TR[lang];
  const [mode,setMode]=useState("signin");
  const [form,setForm]=useState({firstName:"",lastName:"",birthday:"",email:"",password:""});
  const [errors,setErrors]=useState({});
  const [loading,setLoading]=useState(false);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const validate=()=>{const e={};if(mode==="signup"){if(!form.firstName.trim())e.firstName="Obrigatório";if(!form.lastName.trim())e.lastName="Obrigatório";if(!form.birthday)e.birthday="Obrigatório";}if(!form.email.trim())e.email="Obrigatório";if(!form.password||form.password.length<6)e.password="Mínimo 6 caracteres";return e;};
  const submit=async()=>{
    const e=validate();if(Object.keys(e).length){setErrors(e);return;}
    setLoading(true);await new Promise(r=>setTimeout(r,600));
    const uid=form.email.toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,24)+"_"+Date.now().toString().slice(-6);
    const user={uid,firstName:form.firstName||"Leitor",lastName:form.lastName||"",birthday:form.birthday,email:form.email,createdAt:Date.now()};
    await sSet("folha_auth",user);onAuth(user);setLoading(false);
  };
  return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}><div style={{position:"absolute",top:20,right:24}}><button onClick={toggleLang} style={{background:"none",border:`1px solid ${C.border}`,color:C.textDim,padding:"6px 14px",cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:11,letterSpacing:"2px"}}>{t.lang}</button></div><div style={{width:"100%",maxWidth:400}} className="fu"><div style={{textAlign:"center",marginBottom:44}}><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}><div style={{width:40,height:56,position:"relative"}}><Spine title="F" author="" size={40} showText={false}/></div><h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:52,fontWeight:300,color:C.accent,letterSpacing:4}}>{t.appName}</h1></div><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.muted}}>{lang==="pt"?"Sua jornada literária":"Your literary journey"}</p></div><div style={{background:C.surface,border:`1px solid ${C.border}`,padding:32}}><div style={{display:"flex",gap:0,marginBottom:24,border:`1px solid ${C.border}`}}>{[["signin",t.signIn],["signup",t.signUp]].map(([id,lbl])=>(<button key={id} onClick={()=>{setMode(id);setErrors({});}} style={{flex:1,padding:"10px 0",border:"none",cursor:"pointer",background:mode===id?C.accent:"transparent",color:mode===id?"#0F0D0B":C.textDim,fontFamily:"'Jost',sans-serif",fontSize:11,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase"}}>{lbl}</button>))}</div>{mode==="signup"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}><Input label={t.firstName} value={form.firstName} onChange={v=>set("firstName",v)} placeholder="João" error={errors.firstName}/><Input label={t.lastName} value={form.lastName} onChange={v=>set("lastName",v)} placeholder="Silva" error={errors.lastName}/><div style={{gridColumn:"1/-1"}}><Input label={t.birthday} value={form.birthday} onChange={v=>set("birthday",v)} type="date" error={errors.birthday}/></div></div>)}<Input label={t.email} value={form.email} onChange={v=>set("email",v)} placeholder="joao@email.com" error={errors.email}/><Input label={t.password} value={form.password} onChange={v=>set("password",v)} type="password" placeholder="••••••••" error={errors.password}/><Btn variant="primary" full onClick={submit} disabled={loading} style={{marginTop:8,padding:"14px 0"}}>{loading?<Dots/>:mode==="signin"?t.signIn:t.signUp}</Btn></div><p style={{textAlign:"center",marginTop:16,fontSize:12,color:C.muted}}>{mode==="signin"?t.noAccount:t.alreadyHave}{" "}<button onClick={()=>setMode(mode==="signin"?"signup":"signin")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:12}}>{mode==="signin"?t.signUp:t.signIn}</button></p></div></div>);
}

function HomeTab({user,profile,library,finished,reading,challenges,followers,following}){
  const {t,lang}=useLang();
  const loved=library.filter(b=>b.rating==="loved");
  const completedChallenges=challenges.filter(c=>c.completed);
  const booksThisMonth=finished.filter(r=>{const d=new Date(r.finishedAt);return d.getMonth()===mo&&d.getFullYear()===yr;});
  const activities=[...completedChallenges.map(c=>({type:"challenge",icon:c.badge,text:lang==="pt"?`Você conquistou o selo "${c.title}"!`:`You earned the "${c.title}" badge!`,date:c.completedAt||Date.now(),color:c.color})),...finished.slice(0,3).map(r=>({type:"finished",icon:"✅",text:lang==="pt"?`Você terminou "${r.book.title}"`:`You finished "${r.book.title}"`,date:r.finishedAt,color:C.green})),...followers.slice(0,3).map(f=>({type:"follower",icon:"👤",text:lang==="pt"?`@${f} começou a te seguir`:`@${f} started following you`,date:Date.now()-Math.random()*86400000*7,color:C.blue}))].sort((a,b)=>b.date-a.date).slice(0,12);
  const name=`${user?.firstName||""}${user?.lastName?" "+user.lastName:""}`.trim()||"Leitor";
  return(<main style={{padding:"32px 24px 80px",maxWidth:920,margin:"0 auto"}}><div className="fu" style={{marginBottom:36}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}><Avatar photo={profile?.photo} name={name} size={54}/><div><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:300,lineHeight:1.1}}>{lang==="pt"?"Olá,":"Hello,"} <em style={{color:C.accent,fontStyle:"italic"}}>{user?.firstName||name}</em></h2>{profile?.username&&<p style={{fontSize:11,color:C.muted,letterSpacing:"1px"}}>@{profile.username}</p>}</div></div><div style={{display:"flex",gap:1,background:C.border}}>{[[loved.length,t.loved],[finished.length,t.booksRead],[reading.length,t.readingNow],[followers.length,t.followers],[following.length,t.following]].map(([v,l])=>(<div key={l} style={{flex:1,background:C.surface,padding:"14px 8px",textAlign:"center"}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:300,color:C.gold,lineHeight:1}}>{v}</p><p style={{fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:C.muted,marginTop:3}}>{l}</p></div>))}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:22}}><div className="fu" style={{animationDelay:".08s"}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:14}}>{lang==="pt"?"Atividade Recente":t.feed}</p>{activities.length===0?(<div style={{border:`1px dashed ${C.border}`,padding:32,textAlign:"center"}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontStyle:"italic",color:C.muted}}>{t.noActivity}</p></div>):(<div style={{display:"flex",flexDirection:"column",gap:1,background:C.border}}>{activities.map((a,i)=>(<div key={i} className="fu" style={{animationDelay:`${i*.04}s`,background:C.surface,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}}><div style={{width:32,height:32,background:"#2E2820",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,borderLeft:`3px solid ${a.color}`}}>{a.icon}</div><div style={{flex:1}}><p style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:300}}>{a.text}</p><p style={{fontSize:10,color:C.muted,marginTop:3}}>{new Date(a.date).toLocaleDateString(lang==="pt"?"pt-BR":"en-US",{day:"2-digit",month:"short"})}</p></div></div>))}</div>)}</div><div style={{display:"flex",flexDirection:"column",gap:18}}><div className="fu" style={{animationDelay:".12s",background:C.surface,border:`1px solid ${C.border}`,padding:20}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:12}}>{lang==="pt"?`${MONTHS[mo]} · ${yr}`:`${MONTHS_EN[mo]} · ${yr}`}</p><div style={{display:"flex",gap:12,alignItems:"center"}}><div style={{textAlign:"center"}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:300,color:C.gold,lineHeight:1}}>{booksThisMonth.length}</p><p style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:C.muted}}>{lang==="pt"?"este mês":"this month"}</p></div><div style={{flex:1,display:"flex",gap:4,flexWrap:"wrap"}}>{booksThisMonth.slice(0,4).map(r=><Spine key={r.book.title} title={r.book.title} author="" size={36} showText={false}/>)}</div></div></div>{challenges.filter(c=>!c.completed).slice(0,1).map(ch=>(<div key={ch.id} className="fu" style={{animationDelay:".16s",background:"#1F1A14",border:`2px solid ${ch.color}`,padding:20}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:8}}>{t.challenge}</p><div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}><span style={{fontSize:28}}>{ch.badge}</span><div><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:400,color:ch.color}}>{ch.title}</p><p style={{fontSize:11,color:C.textDim,marginTop:2}}>{ch.desc}</p></div></div><span style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:ch.color,border:`1px solid ${ch.color}`,padding:"2px 8px"}}>{t.inProgress}</span></div>))}{completedChallenges.length>0&&(<div className="fu" style={{animationDelay:".2s",background:C.surface,border:`1px solid ${C.border}`,padding:20}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:12}}>{t.badge}s</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{completedChallenges.map(c=><div key={c.id} title={c.title} style={{width:44,height:44,background:"#2E2820",border:`2px solid ${c.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}} className="badge-pop">{c.badge}</div>)}</div></div>)}</div></div></main>);
}

function TimelineTab({finished}){
  const {t,lang}=useLang();
  const byYear={};finished.forEach(r=>{const d=new Date(r.finishedAt);const y=d.getFullYear();const m=d.getMonth();if(!byYear[y])byYear[y]={};if(!byYear[y][m])byYear[y][m]=[];byYear[y][m].push(r);});
  const years=Object.keys(byYear).sort((a,b)=>Number(b)-Number(a));const MO=lang==="pt"?MONTHS:MONTHS_EN;
  if(!finished.length)return(<main style={{padding:"80px 24px",maxWidth:920,margin:"0 auto",textAlign:"center"}}><span style={{fontSize:48,display:"block",marginBottom:20}}>📖</span><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontStyle:"italic",color:C.muted}}>{t.timelineEmpty}</p></main>);
  return(<main style={{padding:"48px 24px 80px",maxWidth:920,margin:"0 auto"}}><div className="fu" style={{marginBottom:40}}><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1,marginBottom:4}}>{lang==="pt"?"Linha do ":" "}<em style={{color:C.accent,fontStyle:"italic"}}>{lang==="pt"?"Tempo":"Timeline"}</em></h2><p style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:C.textDim}}>{finished.length} {t.booksRead}</p></div>{years.map((year,yi)=>(<div key={year} className="fu" style={{animationDelay:`${yi*.08}s`,marginBottom:48}}><div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28}}><div style={{height:1,background:C.border,flex:1}}/><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:300,color:C.gold,letterSpacing:2}}>{year}</span><div style={{height:1,background:C.border,flex:1}}/></div>{Object.keys(byYear[year]).sort((a,b)=>Number(b)-Number(a)).map(m=>(<div key={m} style={{display:"grid",gridTemplateColumns:"80px 1fr",gap:"0 20px",marginBottom:28}}><div style={{textAlign:"right",paddingTop:8}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:400,color:C.accentDim}}>{MO[Number(m)]}</p><p style={{fontSize:10,color:C.muted}}>{byYear[year][m].length} {lang==="pt"?"livro"+(byYear[year][m].length>1?"s":""):"book"+(byYear[year][m].length>1?"s":"")}</p></div><div style={{borderLeft:`2px solid ${C.border}`,paddingLeft:20}}><div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>{byYear[year][m].map((r,i)=>(<div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,maxWidth:66}}><div style={{position:"relative"}}><Spine title={r.book.title} author={r.book.author||""} size={54}/><div style={{position:"absolute",bottom:-4,right:-4,width:16,height:16,background:C.green,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff"}}>✓</div></div><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,textAlign:"center",color:C.textDim,lineHeight:1.2,maxWidth:60,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{r.book.title}</p></div>))}</div></div></div>))}<div style={{marginLeft:100,paddingLeft:20,borderLeft:`2px solid ${C.border}`,paddingBottom:8}}><span style={{fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.muted}}>{Object.values(byYear[year]).flat().length} {lang==="pt"?"livros em":"books in"} {year}</span></div></div>))}</main>);
}

function ChallengesTab({challenges,onComplete,onJoin}){
  const {t,lang}=useLang();const ALL=lang==="pt"?CHALLENGES_PT:CHALLENGES_EN;const monthly=ALL.filter(c=>c.type==="monthly");const global=ALL.filter(c=>c.type==="global");
  return(<main style={{padding:"48px 24px 80px",maxWidth:920,margin:"0 auto"}}><div className="fu" style={{marginBottom:36}}><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1,marginBottom:4}}><em style={{color:C.accent,fontStyle:"italic"}}>{t.challenges}</em></h2><p style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:C.textDim}}>{challenges.filter(c=>c.completed).length} {lang==="pt"?"selos conquistados":"badges earned"}</p></div>{challenges.filter(c=>c.completed).length>0&&(<div className="fu" style={{animationDelay:".04s",background:"#1F1A14",border:`1px solid ${C.accentDim}`,padding:24,marginBottom:32}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.accentDim,marginBottom:16}}>✦ {lang==="pt"?"Seus Selos":"Your Badges"}</p><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{challenges.filter(c=>c.completed).map(c=>(<div key={c.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,width:72}}><div style={{width:60,height:60,background:"#2E2820",border:`2px solid ${c.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:`0 0 16px ${c.color}44`}} className="badge-pop">{c.badge}</div><p style={{fontSize:9,letterSpacing:"1px",textTransform:"uppercase",color:C.textDim,textAlign:"center",lineHeight:1.3}}>{c.title}</p></div>))}</div></div>)}{[["monthly","📅",t.monthlyChallenge,monthly],["global","🌍",t.globalChallenge,global]].map(([type,icon,label,list])=>(<div key={type} className="fu" style={{animationDelay:".08s",marginBottom:32}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:16}}>{icon} {label}{type==="monthly"?` · ${lang==="pt"?MONTHS[mo]:MONTHS_EN[mo]} ${yr}`:""}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>{list.map((ch,i)=>{const state=challenges.find(c=>c.id===ch.id);const done=state?.completed;const joined=!!state;return(<div key={ch.id} className="fu" style={{animationDelay:`${i*.06}s`,background:done?"#1F1A14":C.surface,border:`1px solid ${done?ch.color:C.border}`,padding:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div style={{width:52,height:52,background:"#2E2820",border:`2px solid ${done?ch.color:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:done?`0 0 12px ${ch.color}44`:"none"}}>{ch.badge}</div>{done&&<span style={{fontSize:10,letterSpacing:"1.5px",textTransform:"uppercase",color:ch.color,border:`1px solid ${ch.color}`,padding:"3px 8px"}}>✓ {t.completed}</span>}</div><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:400,color:done?ch.color:C.text,marginBottom:6}}>{ch.title}</p><p style={{fontSize:12,color:C.textDim,lineHeight:1.6,marginBottom:14,fontWeight:300}}>{ch.desc}</p>{!done&&<div style={{display:"flex",gap:8}}>{!joined&&<Btn onClick={()=>onJoin(ch)} style={{fontSize:9,padding:"6px 12px"}}>{lang==="pt"?"Participar":"Join"}</Btn>}{joined&&<Btn variant="primary" onClick={()=>onComplete(ch)} style={{fontSize:9,padding:"6px 12px"}}>{lang==="pt"?"Marcar Concluído":"Mark Done"}</Btn>}</div>}</div>);})}</div></div>))}</main>);
}

function BookSearchModal({onSelect,onClose,title}){
  const {lang}=useLang();
  const [q,setQ]=useState(""),[results,setResults]=useState(null),[loading,setLoading]=useState(false);
  const search=async()=>{
    if(!q.trim()||loading)return;setLoading(true);
    try{
      const text=await callClaude(
        `You are a book database. Given a search query, return ONLY a raw JSON object with no markdown, no backticks, no extra text. Format: {"books":[{"title":"Book Title","author":"Author Name","year":"2001","genre":"Fiction","pages":300}]}. Return exactly 8 real books matching the query.`,
        `Search query: "${q}"`,900
      );
      const clean=text.replace(/```json|```/g,"").trim();
      const m=clean.match(/\{[\s\S]*\}/);
      if(m)setResults(JSON.parse(m[0]).books||[]);
      else setResults([]);
    }catch(e){console.error(e);setResults([]);}
    finally{setLoading(false);}
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:24}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,padding:26,maxWidth:480,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column"}} className="fu"><div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim}}>{title}</p><button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button></div><div style={{display:"flex",background:C.bg,border:`1px solid ${C.border}`,marginBottom:14}}><input type="text" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder={lang==="pt"?"ex: Dom Casmurro, Tolkien…":"e.g. 1984, Tolkien…"} style={{flex:1,padding:"12px 14px",background:"transparent",border:"none",outline:"none",color:C.text,fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontStyle:"italic"}}/><button onClick={search} disabled={loading||!q.trim()} style={{padding:"0 18px",background:C.accent,border:"none",color:"#0F0D0B",fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",cursor:"pointer",opacity:loading||!q.trim()?0.4:1}}>{loading?<Dots/>:(lang==="pt"?"Buscar":"Search")}</button></div><div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:1,background:results?.length?C.border:"transparent"}}>{results===null&&<p style={{color:C.muted,fontSize:12,fontStyle:"italic",padding:12}}>{lang==="pt"?"Digite e pressione Buscar":"Type and press Search"}</p>}{results?.length===0&&!loading&&<p style={{color:C.muted,fontSize:12,fontStyle:"italic",padding:12}}>{lang==="pt"?"Nenhum resultado. Tente outros termos.":"No results. Try different terms."}</p>}{(results||[]).map((b,i)=>(<button key={i} onClick={()=>onSelect(b)} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 12px",background:C.surface,border:"none",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background="#2E2820"} onMouseLeave={e=>e.currentTarget.style.background=C.surface}><Spine title={b.title} author={b.author} size={34} showText={false}/><div style={{flex:1}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,color:C.text,marginBottom:1}}>{b.title}</p><p style={{fontSize:10,letterSpacing:"1.5px",textTransform:"uppercase",color:C.accentDim}}>{b.author}{b.year?` · ${b.year}`:""}</p></div><span style={{fontSize:9,color:C.accentDim,border:`1px solid ${C.border}`,padding:"2px 7px",flexShrink:0}}>+</span></button>))}</div></div></div>);
}

function ShelfTab({library,onRate,onAddBook,onRemoveBook,aiAnalysis,onRefreshAi,onAddToWish}){
  const {t,lang}=useLang();
  const [filter,setFilter]=useState("all"),[showSearch,setShowSearch]=useState(false),[aiLoading,setAiLoading]=useState(false);
  const loved=library.filter(b=>b.rating==="loved");
  const groups={loved,saved:library.filter(b=>b.rating==="saved"),disliked:library.filter(b=>b.rating==="disliked")};
  const shown=filter==="all"?library:groups[filter]||[];
  const FILTERS=lang==="pt"?[["all",`Todos (${library.length})`],["loved",`❤️ Amei (${loved.length})`],["saved",`🔖 Salvos (${groups.saved.length})`],["disliked",`👎 Não curti (${groups.disliked.length})`]]:[["all",`All (${library.length})`],["loved",`❤️ Loved (${loved.length})`],["saved",`🔖 Saved (${groups.saved.length})`],["disliked",`👎 Disliked (${groups.disliked.length})`]];
  const handleRefresh=async(mode)=>{setAiLoading(true);await onRefreshAi(mode,lang);setAiLoading(false);};
  return(<main style={{padding:"48px 24px 80px",maxWidth:960,margin:"0 auto"}}>{showSearch&&<BookSearchModal title={lang==="pt"?"Pesquisar livro já lido":"Search a book you've read"} onSelect={b=>{onAddBook(b);setShowSearch(false);}} onClose={()=>setShowSearch(false)}/>}<div className="fu" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}><div><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1,marginBottom:4}}>{t.shelf}</h2><p style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:C.textDim}}>{library.length} {lang==="pt"?"livros":"books"}</p></div><button onClick={()=>setShowSearch(true)} style={{padding:"10px 18px",background:C.accent,border:"none",color:"#0F0D0B",fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer"}}>+ {lang==="pt"?"Adicionar Lido":"Add Read Book"}</button></div>{loved.length>=5&&(<div className="fu" style={{animationDelay:".05s",background:"#1F1A14",border:`1px solid ${C.accentDim}`,padding:22,marginBottom:24}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}><div style={{display:"flex",alignItems:"center",gap:8}}><span>🧠</span><span style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.accentDim}}>{lang==="pt"?"Análise do perfil":"Profile Analysis"}</span></div><div style={{display:"flex",gap:6}}><button onClick={()=>handleRefresh("last5")} disabled={aiLoading} style={{fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:C.textDim,background:"none",border:`1px solid ${C.border}`,padding:"5px 10px",cursor:"pointer",fontFamily:"'Jost',sans-serif",opacity:aiLoading?0.4:1}}>↻ {lang==="pt"?"Últimos 5":"Last 5"}</button><button onClick={()=>handleRefresh("all")} disabled={aiLoading} style={{fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:C.accentDim,background:"none",border:`1px solid ${C.accentDim}`,padding:"5px 10px",cursor:"pointer",fontFamily:"'Jost',sans-serif",opacity:aiLoading?0.4:1}}>↻ {lang==="pt"?"Todos":"All"}</button></div></div>{aiLoading?<div style={{padding:"16px 0",display:"flex",justifyContent:"center"}}><Dots/></div>:aiAnalysis?(<><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontStyle:"italic",color:C.textDim,lineHeight:1.7,marginBottom:16}}>{aiAnalysis.profile}</p>{aiAnalysis.recs&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>{aiAnalysis.recs.map((r,i)=>(<div key={i} style={{background:C.surface,padding:"10px 12px",border:`1px solid ${C.border}`}}><div style={{display:"flex",gap:8,alignItems:"flex-start"}}><Spine title={r.title} author={r.author||""} size={30} showText={false}/><div style={{flex:1}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:C.text}}>{r.title}</p><p style={{fontSize:9,color:C.accentDim,letterSpacing:"1px"}}>{r.author}</p><p style={{fontSize:10,color:C.textDim,marginTop:4,lineHeight:1.5}}>{r.reason}</p></div></div></div>))}</div>)}</>):(<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,fontStyle:"italic",color:C.muted}}>{lang==="pt"?"Clique em Todos para gerar sua análise literária.":"Click All to generate your literary analysis."}</p>)}</div>)}<div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:20}}>{FILTERS.map(([id,lbl])=><button key={id} onClick={()=>setFilter(id)} style={{padding:"8px 14px",background:"none",border:"none",borderBottom:filter===id?`2px solid ${C.accent}`:"2px solid transparent",cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:10,letterSpacing:"1px",textTransform:"uppercase",color:filter===id?C.accent:C.muted,marginBottom:-1,transition:"all .15s"}}>{lbl}</button>)}</div>{library.length===0?(<div style={{textAlign:"center",padding:"60px 0",border:`1px dashed ${C.border}`}}><span style={{fontSize:40,display:"block",marginBottom:12}}>📚</span><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontStyle:"italic",color:C.muted,marginBottom:16}}>{lang==="pt"?"Sua estante está vazia.":"Your shelf is empty."}</p><button onClick={()=>setShowSearch(true)} style={{padding:"10px 20px",background:C.accent,border:"none",color:"#0F0D0B",fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",cursor:"pointer"}}>+ {lang==="pt"?"Adicionar livro":"Add a book"}</button></div>):(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>{shown.map((book,i)=>{const RATINGS=lang==="pt"?[["loved","❤️ Amei",C.red],["saved","🔖 Salvar",C.accentDim],["disliked","👎 Não curti",C.muted]]:[["loved","❤️ Loved",C.red],["saved","🔖 Save",C.accentDim],["disliked","👎 Disliked",C.muted]];return(<div key={book.title} className="fu" style={{animationDelay:`${i*.04}s`,background:C.surface,border:`1px solid ${C.border}`,padding:"14px 14px 12px",display:"flex",gap:12,alignItems:"flex-start"}}><Spine title={book.title} author={book.author||""} size={54}/><div style={{flex:1,minWidth:0}}><h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:400,marginBottom:3,lineHeight:1.2}}>{book.title}</h3><p style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:C.accentDim,marginBottom:8}}>{book.author}</p><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{RATINGS.map(([r,lbl,col])=>(<button key={r} onClick={()=>onRate(book,r)} style={{padding:"3px 9px",border:`1px solid ${book.rating===r?col:C.border}`,background:book.rating===r?"#2E2820":"transparent",color:book.rating===r?col:C.muted,fontFamily:"'Jost',sans-serif",fontSize:9,cursor:"pointer",transition:"all .15s"}}>{lbl}</button>))}</div><div style={{display:"flex",gap:6}}>{onAddToWish&&<button onClick={()=>onAddToWish(book)} style={{fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border}`,padding:"2px 7px",cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px"}}>🎯</button>}<button onClick={()=>onRemoveBook(book.title)} style={{fontSize:9,color:C.muted,background:"none",border:`1px solid ${C.border}`,padding:"2px 7px",cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px"}}>×</button></div></div></div>);})}</div>)}</main>);
}

function ReadingCard({r,onProgress,onFinish,lang}){
  const [pg,setPg]=useState(String(r.pages));const pct=Math.round((r.pages/r.totalPages)*100);
  return(<div style={{background:C.surface,border:`1px solid ${C.border}`,padding:"16px 16px 14px",display:"grid",gridTemplateColumns:"66px 1fr",gap:"0 14px",alignItems:"start"}}><Spine title={r.book.title} author={r.book.author||""} size={66}/><div><h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:400,marginBottom:2,lineHeight:1.2}}>{r.book.title}</h3><p style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:C.accentDim,marginBottom:10}}>{r.book.author}</p><div style={{height:3,background:C.border,marginBottom:7,width:"100%"}}><div style={{height:"100%",background:C.accent,width:`${pct}%`,transition:"width .4s"}}/></div><p style={{fontSize:10,color:C.muted,marginBottom:9}}>{r.pages} / {r.totalPages} {lang==="pt"?"páginas":"pages"} · {pct}%</p><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><input type="number" value={pg} onChange={e=>setPg(e.target.value)} min={0} max={r.totalPages} style={{width:68,padding:"5px 9px",background:C.bg,border:`1px solid ${C.border}`,color:C.text,fontSize:13,outline:"none"}}/><Btn onClick={()=>onProgress(r.book.title,pg)} style={{padding:"6px 12px",fontSize:10}}>{lang==="pt"?"Atualizar":"Update"}</Btn>{r.pages>=r.totalPages&&<Btn variant="primary" onClick={()=>onFinish(r)} style={{padding:"6px 12px",fontSize:10}}>✓ {lang==="pt"?"Concluir":"Done"}</Btn>}</div></div></div>);
}

function NotesTab({library,notes,onAddNote,onDeleteNote}){
  const {t,lang}=useLang();
  const [sel,setSel]=useState(null),[type,setType]=useState("note"),[text,setText]=useState("");
  const books=library.filter(b=>b.rating!=="disliked");const cur=sel?(notes[sel.title]||[]):[];
  return(<main style={{padding:"48px 24px 80px",maxWidth:920,margin:"0 auto"}}><div className="fu" style={{marginBottom:24}}><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1}}>{t.notes} & <em style={{color:C.accent,fontStyle:"italic"}}>{lang==="pt"?"Citações":"Quotes"}</em></h2></div><div style={{display:"grid",gridTemplateColumns:"170px 1fr",gap:18}}><div className="fu" style={{animationDelay:".06s"}}><p style={{fontSize:9,letterSpacing:"3px",textTransform:"uppercase",color:C.muted,marginBottom:10}}>{lang==="pt"?"Livro":"Book"}</p><div style={{display:"flex",flexDirection:"column",gap:1,background:C.border}}>{books.length===0?<p style={{color:C.muted,fontSize:12,padding:12,fontStyle:"italic"}}>{lang==="pt"?"Adicione livros na Estante.":"Add books to your Shelf."}</p>:books.map(b=><button key={b.title} onClick={()=>setSel(b)} style={{padding:"9px 10px",background:sel?.title===b.title?"#2E2820":C.surface,border:"none",cursor:"pointer",textAlign:"left",borderLeft:sel?.title===b.title?`3px solid ${C.accent}`:"3px solid transparent"}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:sel?.title===b.title?C.accent:C.text,lineHeight:1.2,marginBottom:1,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{b.title}</p><p style={{fontSize:9,color:C.muted}}>{(notes[b.title]||[]).length}</p></button>)}</div></div><div className="fu" style={{animationDelay:".12s"}}>{!sel?<div style={{height:200,display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.border}`,color:C.muted,fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif",fontSize:15}}>← {lang==="pt"?"Selecione um livro":"Select a book"}</div>:<><div style={{display:"flex",gap:0,marginBottom:10,border:`1px solid ${C.border}`,width:"fit-content"}}>{[["note",lang==="pt"?"📝 Nota":"📝 Note"],["quote",lang==="pt"?"💬 Citação":"💬 Quote"]].map(([id,lbl])=><button key={id} onClick={()=>setType(id)} style={{padding:"7px 13px",border:"none",cursor:"pointer",background:type===id?C.accent:"transparent",color:type===id?"#0F0D0B":C.textDim,fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:600}}>{lbl}</button>)}</div><textarea value={text} onChange={e=>setText(e.target.value)} rows={4} style={{width:"100%",padding:"11px 13px",background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",marginBottom:9,fontFamily:type==="quote"?"'Cormorant Garamond',serif":"'Jost',sans-serif",fontStyle:type==="quote"?"italic":"normal"}}/><Btn variant="primary" onClick={()=>{onAddNote(sel.title,type,text);setText("");}}>{lang==="pt"?"Salvar":"Save"}</Btn>{cur.length>0&&<div style={{marginTop:18,display:"flex",flexDirection:"column",gap:1,background:C.border}}>{cur.map((n,i)=><div key={n._id||i} style={{background:C.surface,padding:"11px 13px"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><div style={{flex:1}}><span style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:n.type==="quote"?C.gold:C.accentDim,display:"block",marginBottom:4}}>{n.type==="quote"?"💬":"📝"} {new Date(n.date).toLocaleDateString(lang==="pt"?"pt-BR":"en-US")}</span><p style={{fontSize:13,lineHeight:1.7,fontFamily:n.type==="quote"?"'Cormorant Garamond',serif":"'Jost',sans-serif",fontStyle:n.type==="quote"?"italic":"normal",fontWeight:n.type==="quote"?400:300}}>{n.type==="quote"&&<span style={{color:C.gold,marginRight:3,fontSize:15}}>"</span>}{n.text}{n.type==="quote"&&<span style={{color:C.gold,marginLeft:2,fontSize:15}}>"</span>}</p></div><button onClick={()=>onDeleteNote(sel.title,n._id||i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button></div></div>)}</div>}</> }</div></div></main>);
}

function WishlistTab({wishlist,onAddToWish,onRemoveWish,onUpdatePriority,onStartReading,toast$}){
  const {t,lang}=useLang();
  const [showSearch,setShowSearch]=useState(false),[filter,setFilter]=useState("all");
  const PRIO=[{id:"alta",label:lang==="pt"?"Alta":"High",color:"#C4796A"},{id:"media",label:lang==="pt"?"Média":"Medium",color:"#D4A853"},{id:"baixa",label:lang==="pt"?"Baixa":"Low",color:"#6A9E6A"}];
  const shown=filter==="all"?wishlist:wishlist.filter(b=>b.priority===filter);
  return(<main style={{padding:"48px 24px 80px",maxWidth:920,margin:"0 auto"}}>{showSearch&&<BookSearchModal title={lang==="pt"?"Buscar para Lista de Desejos":"Search Wishlist"} onSelect={b=>{onAddToWish(b);setShowSearch(false);toast$(lang==="pt"?"🎯 Adicionado!":"🎯 Added!");}} onClose={()=>setShowSearch(false)}/>}<div className="fu" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}><div><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1}}>{t.wishlist}</h2><p style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:C.textDim}}>{wishlist.length} {lang==="pt"?"livros":"books"}</p></div><button onClick={()=>setShowSearch(true)} style={{padding:"10px 18px",background:C.accent,border:"none",color:"#0F0D0B",fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer"}}>+ {lang==="pt"?"Adicionar":"Add"}</button></div><div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:20}}>{[["all",lang==="pt"?"Todos":"All"],...PRIO.map(p=>[p.id,p.label])].map(([id,lbl])=><button key={id} onClick={()=>setFilter(id)} style={{padding:"8px 13px",background:"none",border:"none",borderBottom:filter===id?`2px solid ${C.accent}`:"2px solid transparent",cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:10,letterSpacing:"1px",textTransform:"uppercase",color:filter===id?C.accent:C.muted,marginBottom:-1}}>{lbl}</button>)}</div>{wishlist.length===0?<div style={{textAlign:"center",padding:"44px 0",border:`1px dashed ${C.border}`}}><span style={{fontSize:32,display:"block",marginBottom:12}}>🎯</span><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontStyle:"italic",color:C.muted}}>{lang==="pt"?"Lista vazia":"Empty wishlist"}</p></div>:(<div style={{display:"flex",flexDirection:"column",gap:1,background:C.border}}>{shown.map((book,i)=>{const pr=PRIO.find(p=>p.id===book.priority)||PRIO[1];return(<div key={book.title} className="fu" style={{animationDelay:`${i*.05}s`,background:C.surface,padding:"12px 0",display:"grid",gridTemplateColumns:"56px 1fr auto",gap:"0 12px",alignItems:"start",borderLeft:`3px solid ${pr.color}`}}><Spine title={book.title} author={book.author||""} size={56}/><div><h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:400,marginBottom:2}}>{book.title}</h3><p style={{fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.accentDim,marginBottom:7}}>{book.author}</p><div style={{display:"flex",gap:5,flexWrap:"wrap"}}><select value={book.priority||"media"} onChange={e=>onUpdatePriority(book.title,e.target.value)} style={{background:C.bg,border:`1px solid ${pr.color}`,color:pr.color,fontSize:9,padding:"2px 6px",cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px"}}>{PRIO.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select><button onClick={()=>onStartReading(book,book.pages||300)} style={{fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",background:"transparent",border:`1px solid ${C.border}`,color:C.textDim,cursor:"pointer",fontFamily:"'Jost',sans-serif",padding:"2px 7px"}}>📖 {lang==="pt"?"Começar":"Start"}</button></div></div><button onClick={()=>onRemoveWish(book.title)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"2px 8px",lineHeight:1,flexShrink:0}}>×</button></div>);})}</div>)}</main>);
}

function SocialTab({user,profile,library,finished,wishlist,reading,followers,following,onSaveProfile,onFollow,onUnfollow,toast$}){
  const {t,lang}=useLang();
  const [editing,setEditing]=useState(!profile);const [username,setUsername]=useState(profile?.username||"");const [bio,setBio]=useState(profile?.bio||"");const [photo,setPhoto]=useState(profile?.photo||null);const fileRef=useRef(null);
  const name=`${user?.firstName||""}${user?.lastName?" "+user.lastName:""}`.trim()||"Leitor";const loved=library.filter(b=>b.rating==="loved");
  return(<main style={{padding:"48px 24px 80px",maxWidth:640,margin:"0 auto"}}><div className="fu" style={{background:C.surface,border:`1px solid ${C.border}`,padding:28,marginBottom:24}}><div style={{display:"flex",gap:16,alignItems:"flex-start",marginBottom:20}}><div style={{position:"relative",flexShrink:0}}><div style={{width:60,height:60,borderRadius:"50%",overflow:"hidden",border:`2px solid ${C.accentDim}`}}>{photo?<img src={photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="foto"/>:<Avatar photo={null} name={name} size={60}/>}</div><button onClick={()=>fileRef.current?.click()} style={{position:"absolute",bottom:-1,right:-1,width:18,height:18,background:C.accent,border:"none",borderRadius:"50%",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✎</button><input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhoto(ev.target.result);r.readAsDataURL(f);}} style={{display:"none"}}/></div><div style={{flex:1}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:400,marginBottom:2}}>{profile?.username?`@${profile.username}`:name}</p>{profile?.bio&&!editing&&<p style={{fontSize:12,color:C.textDim,lineHeight:1.6}}>{profile.bio}</p>}</div></div>{editing?(<><Input label={lang==="pt"?"Usuário":"Username"} value={username} onChange={v=>setUsername(v.replace(/\s/g,"").toLowerCase())} placeholder="@leitor"/><div style={{marginBottom:14}}><label style={{display:"block",fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.muted,marginBottom:6}}>Bio</label><textarea value={bio} onChange={e=>setBio(e.target.value)} rows={2} style={{width:"100%",padding:"10px 13px",background:C.bg,border:`1px solid ${C.border}`,color:C.text,fontSize:13,resize:"none",outline:"none",lineHeight:1.6}}/></div><div style={{display:"flex",gap:8}}>{profile&&<Btn onClick={()=>setEditing(false)} style={{flex:1}}>{t.cancel}</Btn>}<Btn variant="primary" style={{flex:1}} disabled={!username.trim()} onClick={()=>{onSaveProfile({username,bio,photo});setEditing(false);}}>{t.save}</Btn></div></>):(<><div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>{[[loved.length,t.loved],[finished.length,t.booksRead],[followers.length,t.followers],[following.length,t.following]].map(([v,l])=>(<div key={l} style={{textAlign:"center"}}><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:300,color:C.gold}}>{v}</p><p style={{fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:C.muted}}>{l}</p></div>))}</div>{loved.length>0&&<div style={{marginBottom:14}}><p style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:C.muted,marginBottom:6}}>{lang==="pt"?"Favoritos":"Favorites"}</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{loved.slice(0,7).map(b=><div key={b.title} title={b.title}><Spine title={b.title} author="" size={32} showText={false}/></div>)}</div></div>}<Btn onClick={()=>setEditing(true)} style={{width:"100%"}}>{t.editProfile}</Btn></>)}</div></main>);
}

function DiscoverTab({library,onRate,onAddToWish,onStartReading,toast$,uid}){
  const {t,lang}=useLang();
  const [query,setQuery]=useState(""),[mood,setMood]=useState(null);
  const [loading,setLoading]=useState(false),[results,setResults]=useState(null);
  const [error,setError]=useState(null),[startModal,setStartModal]=useState(null),[pages,setPages]=useState("");
  const [lovePending,setLovePending]=useState(null),[loveText,setLoveText]=useState(""),[loveLoading,setLoveLoading]=useState(false);
  const [history,setHistory]=useState([]);
  const [histResults,setHistResults]=useState({});
  const inputRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{if(!uid)return;dbGetUserData(uid).then(d=>{if(d?.discover_history)setHistory(d.discover_history);if(d?.discover_hist_results)setHistResults(d.discover_hist_results);});},[uid]);
  const MOODS_=[{id:"adventure",label:lang==="pt"?"Aventura":"Adventure",icon:"⚔️"},{id:"thoughtful",label:lang==="pt"?"Reflexivo":"Thoughtful",icon:"🌙"},{id:"cozy",label:lang==="pt"?"Aconchegante":"Cozy",icon:"☕"},{id:"dark",label:lang==="pt"?"Sombrio":"Dark",icon:"🌑"},{id:"romantic",label:lang==="pt"?"Romântico":"Romantic",icon:"🌹"},{id:"funny",label:lang==="pt"?"Divertido":"Funny",icon:"😄"}];
  const saveHistEntry=(q_,mood_,books)=>{
    const moodLabel=mood_?MOODS_.find(m=>m.id===mood_)?.icon:"";
    const label=[q_.trim(),moodLabel].filter(Boolean).join(" ").trim();
    if(!label)return;
    const entry={label,query:q_,mood:mood_,date:Date.now()};
    const newHist=[entry,...history.filter(h=>h.label!==label)].slice(0,5);
    const newHistR={...histResults,[label]:books};
    setHistory(newHist);setHistResults(newHistR);
    if(uid)dbPatchUserData(uid,{discover_history:newHist,discover_hist_results:newHistR});
  };
  const doSearch=async(overrideQ,overrideMood)=>{
    const q_=overrideQ!==undefined?overrideQ:query;
    const mood_=overrideMood!==undefined?overrideMood:mood;
    if((!q_.trim()&&!mood_)||loading)return;
    setLoading(true);setResults(null);setError(null);
    const loved=library.filter(b=>b.rating==="loved").map(b=>b.title).slice(0,8);
    const disliked=library.filter(b=>b.rating==="disliked").map(b=>b.title).slice(0,5);
    const msg=[q_.trim()?`Book: "${q_.trim()}"`:null,mood_?`Mood: ${MOODS_.find(m=>m.id===mood_)?.label}`:null,loved.length?`Loved: ${loved.join(", ")}`:null,disliked.length?`Avoid similar to: ${disliked.join(", ")}`:null].filter(Boolean).join("\n");
    const isPt=lang==="pt";
    try{
      const sysPrompt=isPt?`Especialista literário. Retorne 10 recomendações. JSON APENAS (sem markdown):\n{"books":[{"title":"...","author":"...","year":"...","genre":"...","pages":320,"reason":"2-3 frases em português","tag":"Mesmo Autor|Mesmo Gênero|Tema Similar|Estilo Similar|Mesma Época|Por Humor","match":85}]}`:`Literary expert. Return 10 recommendations. JSON ONLY (no markdown):\n{"books":[{"title":"...","author":"...","year":"...","genre":"...","pages":320,"reason":"2-3 sentences","tag":"Same Author|Same Genre|Similar Theme|Similar Style|Same Era|By Mood","match":85}]}`;
      const text=await callClaude(sysPrompt,msg,2000);
      const clean=text.replace(/```json|```/g,"").trim();
      const m=clean.match(/\{[\s\S]*\}/);
      if(!m){setError(isPt?"Tente novamente.":"Try again.");return;}
      const books=(JSON.parse(m[0]).books||[]).sort((a,b)=>(b.match||0)-(a.match||0));
      setResults(books);
      saveHistEntry(q_,mood_,books);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };
  const doLove=async(book)=>{
    setLovePending(book);setLoveText("");setLoveLoading(true);
    const loved=library.filter(b=>b.rating==="loved").map(b=>`"${b.title}"`).join(", ");
    const isPt=lang==="pt";
    try{const text=await callClaude(isPt?"Conselheiro literário. Escreva 3-4 parágrafos calorosos SEMPRE EM PORTUGUÊS.":"Literary advisor. Write 3-4 warm paragraphs ALWAYS IN ENGLISH.",isPt?`Leitor amou: ${loved||"sem histórico"}\nConsiderando: "${book.title}" de ${book.author}\nExplique por que vai ou não vai amar este livro.`:`User loved: ${loved||"no history"}\nConsidering: "${book.title}" by ${book.author}\nExplain why they will or won't love this book.`,700);setLoveText(text);}
    catch{setLoveText(lang==="pt"?"Não foi possível gerar análise.":"Could not generate analysis.");}
    finally{setLoveLoading(false);}
  };
  return(<main style={{padding:"48px 24px 80px",maxWidth:860,margin:"0 auto"}}>{lovePending&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:24}} onClick={()=>setLovePending(null)}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,padding:28,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} className="fu"><div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.accentDim}}>{lang==="pt"?"Por que vou amar?":"Why will I love it?"}</p><button onClick={()=>setLovePending(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button></div><div style={{display:"flex",gap:12,marginBottom:18,alignItems:"flex-start"}}><Spine title={lovePending.title} author={lovePending.author||""} size={54}/><div><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:400}}>{lovePending.title}</p><p style={{fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.accentDim,marginTop:3}}>{lovePending.author}</p></div></div>{loveLoading?<div style={{display:"flex",justifyContent:"center",padding:"24px 0"}}><Dots/></div>:<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,lineHeight:1.8,color:C.textDim,fontStyle:"italic",whiteSpace:"pre-wrap"}}>{loveText}</p>}</div></div>)}{startModal&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:24}} onClick={()=>setStartModal(null)}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,padding:26,maxWidth:360,width:"100%"}} className="fu"><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:16}}>{lang==="pt"?"Quantas páginas tem?":"How many pages?"}</p><input type="number" value={pages} onChange={e=>setPages(e.target.value)} placeholder={startModal.pages||"300"} style={{width:"100%",padding:"12px 14px",background:C.bg,border:`1px solid ${C.border}`,color:C.text,fontSize:15,outline:"none",marginBottom:14}}/><div style={{display:"flex",gap:8}}><Btn onClick={()=>setStartModal(null)} style={{flex:1}}>{lang==="pt"?"Cancelar":"Cancel"}</Btn><Btn variant="primary" style={{flex:1}} onClick={()=>{onStartReading(startModal,pages||startModal.pages||300);setStartModal(null);}}>📖 {lang==="pt"?"Começar":"Start"}</Btn></div></div></div>)}<div className="fu" style={{marginBottom:32}}><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1,marginBottom:4}}><em style={{color:C.accent,fontStyle:"italic"}}>{t.discover}</em></h2><p style={{fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:C.textDim}}>{lang==="pt"?"Encontre seu próximo livro":"Find your next book"}</p></div><div style={{display:"flex",background:C.surface,border:`1px solid ${C.border}`,marginBottom:16}}><input ref={inputRef} type="text" placeholder={lang==="pt"?"ex: Duna, Dom Quixote, Kafka…":"e.g. Dune, Don Quixote, Kafka…"} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} style={{flex:1,padding:"15px 18px",background:"transparent",border:"none",outline:"none",color:C.text,fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontStyle:"italic"}}/><button onClick={()=>doSearch()} disabled={loading||(!query.trim()&&!mood)} style={{padding:"0 22px",background:C.accent,border:"none",color:"#0F0D0B",fontFamily:"'Jost',sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",opacity:(loading||(!query.trim()&&!mood))?0.4:1,minWidth:90}}>{loading?<Dots/>:(lang==="pt"?"Buscar":"Search")}</button></div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>{[{id:null,label:lang==="pt"?"Qualquer humor":"Any mood",icon:"✨"},...[{id:"adventure",label:lang==="pt"?"Aventura":"Adventure",icon:"⚔️"},{id:"thoughtful",label:lang==="pt"?"Reflexivo":"Thoughtful",icon:"🌙"},{id:"cozy",label:lang==="pt"?"Aconchegante":"Cozy",icon:"☕"},{id:"dark",label:lang==="pt"?"Sombrio":"Dark",icon:"🌑"},{id:"romantic",label:lang==="pt"?"Romântico":"Romantic",icon:"🌹"},{id:"funny",label:lang==="pt"?"Divertido":"Funny",icon:"😄"}]].map(m=><button key={m.id||"null"} onClick={()=>setMood(m.id)} style={{padding:"6px 13px",border:`1px solid ${mood===m.id?C.accent:C.border}`,background:mood===m.id?"#2E2820":"transparent",color:mood===m.id?C.accent:C.textDim,cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:10,display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}>{m.icon} {m.label}</button>)}</div>{error&&<p style={{color:C.red,fontSize:12,marginBottom:14,fontStyle:"italic"}}>{error}</p>}{history.length>0&&!results&&!loading&&(<div className="fu" style={{animationDelay:".1s",marginBottom:24}}><p style={{fontSize:10,letterSpacing:"2.5px",textTransform:"uppercase",color:C.textDim,marginBottom:10}}>🕐 {lang==="pt"?"Pesquisas recentes":"Recent searches"}</p><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{history.map((h,i)=>(<button key={i} onClick={()=>{setQuery(h.query||"");setMood(h.mood||null);const saved=histResults[h.label];if(saved){setResults(saved);}else{doSearch(h.query||"",h.mood||null);}}} style={{padding:"7px 13px",border:`1px solid ${C.border}`,background:C.surface,color:C.textDim,cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:11,display:"flex",alignItems:"center",gap:6,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textDim;}}><span>🕐</span>{h.label}<button onClick={ev=>{ev.stopPropagation();const nh=history.filter((_,j)=>j!==i);setHistory(nh);if(uid)dbPatchUserData(uid,{discover_history:nh});}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,lineHeight:1,padding:"0 0 0 4px"}}>×</button></button>))}</div></div>)}{loading&&<div style={{display:"flex",justifyContent:"center",padding:"48px 0"}}><Dots/></div>}{results&&(<div><p style={{fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:C.textDim,marginBottom:16}}>{results.length} {lang==="pt"?"recomendações":"recommendations"}</p><div style={{display:"flex",flexDirection:"column",gap:1,background:C.border}}>{results.map((book,i)=>(<div key={i} className="fu" style={{animationDelay:`${i*.04}s`,background:C.surface,padding:"16px 16px 14px",display:"grid",gridTemplateColumns:"66px 1fr auto",gap:"0 14px",alignItems:"start"}}><Spine title={book.title} author={book.author||""} size={66}/><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}><h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:400}}>{book.title}</h3>{book.match&&<span style={{fontSize:8,padding:"2px 7px",border:`1px solid ${C.gold}`,color:C.gold,letterSpacing:"1px"}}>{book.match}% match</span>}{book.tag&&<span style={{fontSize:8,padding:"2px 7px",background:"#2E2820",color:C.accentDim,letterSpacing:"1px"}}>{book.tag}</span>}</div><p style={{fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:C.accentDim,marginBottom:6}}>{book.author}{book.year?` · ${book.year}`:""}{book.genre?` · ${book.genre}`:""}</p><p style={{fontSize:12,color:C.textDim,lineHeight:1.6,fontWeight:300}}>{book.reason}</p></div><div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",paddingTop:2}}><button onClick={()=>doLove(book)} style={{fontSize:10,padding:"5px 10px",border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px",whiteSpace:"nowrap"}}>❓ {lang==="pt"?"Por que vou amar?":"Why love it?"}</button><button onClick={()=>onRate(book,"loved")} style={{fontSize:10,padding:"5px 10px",border:`1px solid ${C.border}`,background:"transparent",color:C.red,cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px",whiteSpace:"nowrap"}}>❤️ {lang==="pt"?"Já li":"Read it"}</button><button onClick={()=>{setStartModal(book);setPages(String(book.pages||""));}} style={{fontSize:10,padding:"5px 10px",border:`1px solid ${C.accentDim}`,background:"transparent",color:C.accentDim,cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px",whiteSpace:"nowrap"}}>📖 {lang==="pt"?"Começar":"Start"}</button><button onClick={()=>onAddToWish(book)} style={{fontSize:10,padding:"5px 10px",border:`1px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontFamily:"'Jost',sans-serif",letterSpacing:"1px",whiteSpace:"nowrap"}}>🎯 {lang==="pt"?"Desejos":"Wishlist"}</button></div></div>))}</div></div>)}</main>);
}

function MainApp({user,onLogout}){
  const {t,lang}=useLang();
  const [tab,setTab]=useState("home");
  const [library,setLibrary]=useState([]);
  const [reading,setReading]=useState([]);
  const [finished,setFinished]=useState([]);
  const [notes,setNotes]=useState({});
  const [wishlist,setWishlist]=useState([]);
  const [goal,setGoal]=useState({target:12,done:0});
  const [profile,setProfile]=useState(null);
  const [aiAnalysis,setAiAnalysis]=useState(null);
  const [challenges,setChallenges]=useState([]);
  const [followers,setFollowers]=useState([]);
  const [following,setFollowing]=useState([]);
  const [toast,setToast]=useState(null);
  const [ready,setReady]=useState(false);
  const uid=user?.uid||"guest";

  useEffect(()=>{
    Promise.all([
      dbGetLibrary(uid),dbGetReading(uid),dbGetFinished(uid),
      dbGetNotes(uid),dbGetWishlist(uid),dbGetUserData(uid)
    ]).then(([lib,rd,fin,nt,wl,ud])=>{
      setLibrary(lib.map(x=>({title:x.title,author:x.author,year:x.year,genre:x.genre,pages:x.pages,rating:x.rating,addedAt:x.added_at})));
      setReading(rd);setFinished(fin);setNotes(nt);setWishlist(wl);
      if(ud){if(ud.goal)setGoal(ud.goal);if(ud.profile)setProfile(ud.profile);if(ud.ai_analysis)setAiAnalysis(ud.ai_analysis);if(ud.challenges)setChallenges(ud.challenges);if(ud.followers)setFollowers(ud.followers||[]);if(ud.following)setFollowing(ud.following||[]);}
      setReady(true);
    });
  },[uid]);

  const toast$=useCallback((m)=>{setToast(m);setTimeout(()=>setToast(null),2800);},[]);

  const addBook=useCallback(async(book)=>{
    const b={...book,rating:"loved",addedAt:Date.now()};
    if(library.find(x=>x.title===book.title)){toast$(lang==="pt"?"Já na estante":"Already on shelf");return;}
    await dbUpsertBook(uid,b);
    setLibrary(p=>[b,...p]);
    toast$("📚 "+(lang==="pt"?"Adicionado à estante!":"Added to shelf!"));
  },[uid,library,toast$,lang]);

  const rateBook=useCallback(async(book,rating)=>{
    const existing=library.find(b=>b.title===book.title);
    if(existing){
      if(existing.rating===rating){await dbUpdateBookRating(uid,book.title,null);setLibrary(p=>p.map(b=>b.title===book.title?{...b,rating:null}:b));toast$(lang==="pt"?"↩ Avaliação removida":"↩ Rating removed");return;}
      await dbUpdateBookRating(uid,book.title,rating);setLibrary(p=>p.map(b=>b.title===book.title?{...b,rating}:b));
    }else{
      const b={...book,rating,addedAt:Date.now()};await dbUpsertBook(uid,b);setLibrary(p=>[b,...p]);
    }
    toast$({loved:"❤️ Amei!",saved:"🔖 Salvo",disliked:"👎 Registrado"}[rating]);
  },[uid,library,toast$,lang]);

  const removeBook=useCallback(async(title)=>{
    await dbDeleteBook(uid,title);setLibrary(p=>p.filter(b=>b.title!==title));toast$(lang==="pt"?"Removido":"Removed");
  },[uid,toast$,lang]);

  const addToWish=useCallback(async(book)=>{
    if(wishlist.find(b=>b.title===book.title)){toast$(lang==="pt"?"Já na lista":"Already in list");return;}
    const b={...book,priority:"media",addedAt:Date.now()};
    await dbUpsertWish(uid,b);setWishlist(p=>[b,...p]);toast$("🎯 "+t.bookAdded);
  },[uid,wishlist,toast$,t,lang]);

  const removeWish=useCallback(async(title)=>{
    await dbDeleteWish(uid,title);setWishlist(p=>p.filter(b=>b.title!==title));
  },[uid]);

  const updateWishPriority=useCallback(async(title,priority)=>{
    await dbUpdateWishPriority(uid,title,priority);setWishlist(p=>p.map(b=>b.title===title?{...b,priority}:b));
  },[uid]);

  const startReading=useCallback(async(book,totalPages)=>{
    if(reading.find(r=>r.book.title===book.title)){toast$(lang==="pt"?"Já está lendo":"Already reading");return;}
    const entry={book,pages:0,totalPages:parseInt(totalPages)||300,startDate:Date.now()};
    await dbAddReading(uid,entry);setReading(p=>[entry,...p]);
    toast$("📖 "+(lang==="pt"?"Adicionado a Lendo":"Added to Reading"));
  },[uid,reading,toast$,lang]);

  const updateProgress=useCallback(async(title,pages)=>{
    const pg=Math.max(0,parseInt(pages)||0);
    await dbUpdateReadingPages(uid,title,pg);
    setReading(p=>p.map(r=>r.book.title===title?{...r,pages:Math.min(pg,r.totalPages)}:r));
  },[uid]);

  const finishBook=useCallback(async(r)=>{
    const entry={...r,finishedAt:Date.now()};
    await dbDeleteReading(uid,r.book.title);
    await dbAddFinished(uid,entry);
    setReading(p=>p.filter(x=>x.book.title!==r.book.title));
    setFinished(p=>[entry,...p]);
    const newGoal={...goal,done:goal.done+1};setGoal(newGoal);
    await dbPatchUserData(uid,{goal:newGoal});
    toast$("🎉 "+(lang==="pt"?"Livro concluído!":"Book finished!"));
  },[uid,goal,toast$,lang]);

  const addNote=useCallback(async(bookTitle,type,text)=>{
    if(!text.trim())return;
    const res=await dbAddNote(uid,bookTitle,type,text);
    const note={type,text,date:Date.now(),_id:res?.[0]?.id||Date.now()};
    setNotes(p=>({...p,[bookTitle]:[note,...(p[bookTitle]||[])]}));
    toast$(type==="quote"?"💬":"📝");
  },[uid,toast$]);

  const deleteNote=useCallback(async(bookTitle,noteId)=>{
    if(typeof noteId==="string"&&noteId.includes("-")){await dbDeleteNote(uid,noteId);}
    setNotes(p=>{const arr=[...(p[bookTitle]||[])];const idx=typeof noteId==="number"?noteId:arr.findIndex(n=>n._id===noteId);if(idx>=0)arr.splice(idx,1);return{...p,[bookTitle]:arr};});
  },[uid]);

  const saveProfile=useCallback(async(data)=>{
    const loved=library.filter(b=>b.rating==="loved");
    const p={...data,booksRead:finished.length,loved:loved.slice(0,20),updatedAt:Date.now()};
    setProfile(p);await dbPatchUserData(uid,{profile:p});toast$(t.profileSaved);
  },[uid,library,finished,toast$,t]);

  const refreshAi=useCallback(async(mode,lg="pt")=>{
    const loved=library.filter(b=>b.rating==="loved");
    const books=mode==="last5"?loved.slice(0,5):loved;
    if(!books.length)return;
    const isPt=lg==="pt";
    const sysPrompt=isPt?`Retorne JSON APENAS:\n{"profile":"2-3 frases sobre o DNA literário deste leitor em português","recs":[{"title":"...","author":"...","reason":"1-2 frases personalizadas em português"}]}`:`Return JSON ONLY:\n{"profile":"2-3 sentences about this reader's literary DNA in English","recs":[{"title":"...","author":"...","reason":"1-2 personalized sentences in English"}]}`;
    const userMsg=isPt?`Livros amados: ${books.map(b=>`"${b.title}"`).join(", ")}\n\nRecomende 6 livros.`:`Books loved: ${books.map(b=>`"${b.title}"`).join(", ")}\n\nRecommend 6 books.`;
    try{const text=await callClaude(sysPrompt,userMsg,1200);const clean=text.replace(/```json|```/g,"").trim();const m=clean.match(/\{[\s\S]*\}/);if(m){const ai=JSON.parse(m[0]);setAiAnalysis(ai);await dbPatchUserData(uid,{ai_analysis:ai});}}catch{}
  },[uid,library]);

  const joinChallenge=useCallback(async(ch)=>{
    const n=[...challenges.filter(c=>c.id!==ch.id),{...ch,joined:true,joinedAt:Date.now()}];
    setChallenges(n);await dbPatchUserData(uid,{challenges:n});
    toast$(lang==="pt"?"🎯 Desafio iniciado!":"🎯 Challenge started!");
  },[uid,challenges,toast$,lang]);

  const completeChallenge=useCallback(async(ch)=>{
    const n=challenges.map(c=>c.id===ch.id?{...c,completed:true,completedAt:Date.now()}:c);
    setChallenges(n);await dbPatchUserData(uid,{challenges:n});
    toast$(`${ch.badge} ${lang==="pt"?"Selo conquistado!":"Badge earned!"}`);
  },[uid,challenges,toast$,lang]);

  const followUser=useCallback(async(username)=>{
    const n=[...new Set([...following,username])];
    setFollowing(n);await dbPatchUserData(uid,{following:n});
    toast$(`✓ ${lang==="pt"?"Seguindo":"Following"} @${username}`);
  },[uid,following,toast$,lang]);

  const unfollowUser=useCallback(async(username)=>{
    const n=following.filter(u=>u!==username);
    setFollowing(n);await dbPatchUserData(uid,{following:n});
    toast$(`${lang==="pt"?"Deixou de seguir":"Unfollowed"} @${username}`);
  },[uid,following,toast$,lang]);

  const TABS=[{id:"home",label:t.home,icon:"🏠"},{id:"discover",label:t.discover,icon:"🔍"},{id:"shelf",label:t.shelf,icon:"📚"},{id:"reading",label:t.reading,icon:"📖"},{id:"timeline",label:t.timeline,icon:"📅"},{id:"challenges",label:t.challenges,icon:"🏅"},{id:"notes",label:t.notes,icon:"✏️"},{id:"wishlist",label:t.wishlist,icon:"🎯"},{id:"social",label:t.social,icon:"👥"}];

  const P={library,reading,finished,notes,wishlist,goal,profile,aiAnalysis,challenges,followers,following,uid,user,toast$,onRate:rateBook,onAddBook:addBook,onRemoveBook:removeBook,onAddToWish:addToWish,onRemoveWish:removeWish,onUpdatePriority:updateWishPriority,onStartReading:startReading,onProgress:updateProgress,onFinish:finishBook,onAddNote:addNote,onDeleteNote:deleteNote,onSaveProfile:saveProfile,onRefreshAi:refreshAi,onJoinChallenge:joinChallenge,onCompleteChallenge:completeChallenge,onFollow:followUser,onUnfollow:unfollowUser};

  if(!ready)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}><Dots/></div>;

  return(<>
    <Toast msg={toast}/>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:C.bg}}>
      <nav style={{background:C.surface,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1060,margin:"0 auto",padding:"0 8px",display:"flex",alignItems:"center",justifyContent:"space-between",height:50}}>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:300,color:C.accent,letterSpacing:3,flexShrink:0,marginRight:8}}>{t.appName}</span>
          <div style={{display:"flex",gap:0,overflowX:"auto",flex:1}}>
            {TABS.map(tab_=>(<button key={tab_.id} onClick={()=>setTab(tab_.id)} style={{padding:"7px 8px",border:"none",cursor:"pointer",background:"transparent",color:tab===tab_.id?C.accent:C.muted,fontFamily:"'Jost',sans-serif",fontSize:9,fontWeight:tab===tab_.id?600:400,letterSpacing:"0.8px",textTransform:"uppercase",borderBottom:tab===tab_.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .2s",display:"flex",flexDirection:"column",alignItems:"center",gap:2,whiteSpace:"nowrap",flexShrink:0}}><span style={{fontSize:14}}>{tab_.icon}</span><span>{tab_.label}</span></button>))}
          </div>
          <button onClick={onLogout} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"5px 10px",cursor:"pointer",fontFamily:"'Jost',sans-serif",fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",flexShrink:0,marginLeft:8}}>{t.logout}</button>
        </div>
      </nav>
      <div style={{flex:1}}>
        {tab==="home"&&<HomeTab {...P}/>}
        {tab==="discover"&&<DiscoverTab {...P}/>}
        {tab==="shelf"&&<ShelfTab {...P}/>}
        {tab==="reading"&&<main style={{padding:"48px 24px 80px",maxWidth:920,margin:"0 auto"}}><div className="fu" style={{marginBottom:24}}><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:40,fontWeight:300,letterSpacing:-1}}>{lang==="pt"?"Lendo":"Reading"}</h2></div>{reading.length===0?<div style={{textAlign:"center",padding:"60px 0",border:`1px dashed ${C.border}`}}><span style={{fontSize:40,display:"block",marginBottom:12}}>📖</span><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontStyle:"italic",color:C.muted}}>{lang==="pt"?"Nenhum livro em andamento":"No books in progress"}</p></div>:<div style={{display:"flex",flexDirection:"column",gap:12}}>{reading.map((r,i)=><ReadingCard key={r.book.title} r={r} onProgress={P.onProgress} onFinish={P.onFinish} lang={lang}/>)}</div>}</main>}
        {tab==="timeline"&&<TimelineTab {...P}/>}
        {tab==="challenges"&&<ChallengesTab {...P} onComplete={completeChallenge} onJoin={joinChallenge}/>}
        {tab==="notes"&&<NotesTab {...P}/>}
        {tab==="wishlist"&&<WishlistTab {...P}/>}
        {tab==="social"&&<SocialTab {...P}/>}
      </div>
    </div>
  </>);
}

export default function Root(){
  const [lang,setLang]=useState("pt");
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(true);
  const toggleLang=()=>setLang(l=>l==="pt"?"en":"pt");
  useEffect(()=>{sGet("folha_auth").then(u=>{setUser(u);setChecking(false);});},[]);
  const onAuth=useCallback((u)=>setUser(u),[]);
  const onLogout=useCallback(async()=>{await sSet("folha_auth",null);setUser(null);},[]);
  if(checking)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}><Dots/></div>;
  return(<>
    <style>{G}</style>
    <LangCtx.Provider value={{lang,t:TR[lang],toggle:toggleLang}}>
      {user?<MainApp user={user} onLogout={onLogout}/>:<AuthScreen onAuth={onAuth} lang={lang} toggleLang={toggleLang}/>}
    </LangCtx.Provider>
  </>);
}
