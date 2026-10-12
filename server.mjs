import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const STATIC = join(ROOT, 'static');
const DATA = join(ROOT, '.data');
mkdirSync(DATA, { recursive: true });
const secretPath = join(DATA, 'secret.key');
if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(48));
const PEPPER = readFileSync(secretPath);
const db = new DatabaseSync(join(DATA, 'secretsanta.db'));
db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    budget INTEGER, opens_at TEXT, christmas_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    name TEXT NOT NULL, code_hash TEXT NOT NULL, assigned_to INTEGER REFERENCES participants(id),
    opened_at TEXT, wishlist TEXT NOT NULL DEFAULT '', UNIQUE(round_id, name COLLATE NOCASE)
  );
  CREATE TABLE IF NOT EXISTS exclusions (
    round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    giver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    PRIMARY KEY(round_id,giver_id,receiver_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, participant_id INTEGER,
    expires_at INTEGER NOT NULL
  );
`);
if (!db.prepare('SELECT 1 FROM rounds LIMIT 1').get()) {
  const year = new Date().getFullYear();
  db.prepare('INSERT INTO rounds(title,christmas_date) VALUES(?,?)').run(`Julen ${year}`, `${year}-12-24T18:00:00+01:00`);
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
const COOKIE_POLICY = PUBLIC_ORIGIN ? 'SameSite=None; Secure' : 'SameSite=Strict';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const rate = new Map();

function json(res, status, body, cookies=[]) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...(PUBLIC_ORIGIN ? {'Access-Control-Allow-Origin':PUBLIC_ORIGIN,'Access-Control-Allow-Credentials':'true','Vary':'Origin'} : {}), ...(cookies.length ? {'Set-Cookie': cookies} : {}) });
  res.end(JSON.stringify(body));
}
function error(res, status, message) { json(res, status, { error: message }); }
async function body(req) {
  let raw='';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error('For stor forespørsel'); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('Ugyldig JSON'); }
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>{const i=v.indexOf('='); return [v.slice(0,i).trim(),decodeURIComponent(v.slice(i+1))]}));
}
function hash(value) { return createHash('sha256').update(PEPPER).update(String(value)).digest('hex'); }
function passwordHash(pass, salt=randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(pass, salt, 32).toString('hex')}`; }
function passwordOk(pass, saved=':') { const [salt, expected] = saved.split(':'); const got=scryptSync(pass,salt,32); const exp=Buffer.from(expected||'', 'hex'); return exp.length===got.length && timingSafeEqual(got,exp); }
function newSession(kind, participantId=null) {
  const token=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),kind,participantId,Date.now()+1000*60*60*24*30);
  return token;
}
function session(req, kind) {
  const token=cookies(req)[kind==='admin'?'ss_admin':'ss_guest']; if(!token) return null;
  const row=db.prepare('SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?').get(hash(token),kind,Date.now());
  return row||null;
}
function requireAdmin(req,res) { if(!session(req,'admin')) { error(res,401,'Logg inn som administrator.'); return false; } return true; }
function currentRound() { return db.prepare("SELECT * FROM rounds ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, id DESC LIMIT 1").get(); }
function publicRound(round=currentRound()) {
  if(!round) return null;
  return { id:round.id,title:round.title,budget:round.budget,opensAt:round.opens_at,christmasDate:round.christmas_date,status:round.status,participantCount:Number(db.prepare('SELECT count(*) n FROM participants WHERE round_id=?').get(round.id).n) };
}
function safeText(value,max=200) { return String(value??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max); }
function rateLimited(req, key, limit=8) {
  const ip=req.socket.remoteAddress||'unknown', id=`${ip}:${key}`, now=Date.now();
  const hits=(rate.get(id)||[]).filter(t=>now-t<60000); hits.push(now); rate.set(id,hits); return hits.length>limit;
}
function code() { return `${randomBytes(2).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`; }

export function solveAssignments(ids, blocked=new Set(), rng=Math.random) {
  const order=[...ids].sort((a,b)=>{
    const ca=ids.filter(x=>x!==a&&!blocked.has(`${a}:${x}`)).length;
    const cb=ids.filter(x=>x!==b&&!blocked.has(`${b}:${x}`)).length;
    return ca-cb || rng()-.5;
  });
  const result=new Map(), used=new Set();
  function walk(i) {
    if(i===order.length) return true;
    const giver=order[i];
    const options=ids.filter(x=>x!==giver&&!used.has(x)&&!blocked.has(`${giver}:${x}`)).sort(()=>rng()-.5);
    for(const receiver of options) { result.set(giver,receiver); used.add(receiver); if(walk(i+1)) return true; used.delete(receiver); result.delete(giver); }
    return false;
  }
  return walk(0) ? result : null;
}

function adminState() {
  const round=currentRound();
  const participants=db.prepare('SELECT id,name,opened_at openedAt,wishlist FROM participants WHERE round_id=? ORDER BY name COLLATE NOCASE').all(round.id);
  const exclusions=db.prepare('SELECT giver_id giverId,receiver_id receiverId FROM exclusions WHERE round_id=?').all(round.id);
  return { round:publicRound(round),participants,exclusions };
}

async function api(req,res,url) {
  const path=url.pathname;
  if(path==='/api/public' && req.method==='GET') return json(res,200,{round:publicRound(),adminReady:!!db.prepare("SELECT value FROM settings WHERE key='admin_hash'").get()});
  if(path==='/api/admin/status' && req.method==='GET') return json(res,200,{authenticated:!!session(req,'admin'),setupRequired:!db.prepare("SELECT value FROM settings WHERE key='admin_hash'").get()});
  if(path==='/api/admin/setup' && req.method==='POST') {
    if(db.prepare("SELECT 1 FROM settings WHERE key='admin_hash'").get()) return error(res,409,'Administrator er allerede satt opp.');
    const ip=req.socket.remoteAddress||''; if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) return error(res,403,'Førstegangsoppsett må gjøres på maskinen som kjører serveren.');
    const b=await body(req), pass=safeText(b.password,200); if(pass.length<10) return error(res,400,'Bruk minst 10 tegn.');
    db.prepare("INSERT INTO settings(key,value) VALUES('admin_hash',?)").run(passwordHash(pass));
    const token=newSession('admin'); return json(res,200,{ok:true},[`ss_admin=${token}; HttpOnly; ${COOKIE_POLICY}; Path=/; Max-Age=2592000`]);
  }
  if(path==='/api/admin/login' && req.method==='POST') {
    if(rateLimited(req,'admin-login',6)) return error(res,429,'For mange forsøk. Vent ett minutt.');
    const b=await body(req), row=db.prepare("SELECT value FROM settings WHERE key='admin_hash'").get();
    if(!row || !passwordOk(String(b.password||''),row.value)) return error(res,401,'Feil passord.');
    const token=newSession('admin'); return json(res,200,{ok:true},[`ss_admin=${token}; HttpOnly; ${COOKIE_POLICY}; Path=/; Max-Age=2592000`]);
  }
  if(path==='/api/admin/logout' && req.method==='POST') return json(res,200,{ok:true},[`ss_admin=; HttpOnly; ${COOKIE_POLICY}; Path=/; Max-Age=0`]);
  if(path==='/api/guest/logout' && req.method==='POST') {
    const token=cookies(req).ss_guest;
    if(token) db.prepare("DELETE FROM sessions WHERE token_hash=? AND kind='guest'").run(hash(token));
    return json(res,200,{ok:true},[`ss_guest=; HttpOnly; ${COOKIE_POLICY}; Path=/; Max-Age=0`]);
  }
  if(path.startsWith('/api/admin/') && !requireAdmin(req,res)) return;
  if(path==='/api/admin/state' && req.method==='GET') return json(res,200,adminState());
  if(path==='/api/admin/round' && req.method==='PATCH') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'En publisert runde kan ikke endres.');
    const b=await body(req), title=safeText(b.title,80), budget=b.budget===''||b.budget==null?null:Number(b.budget), opens=safeText(b.opensAt,40)||null, christmas=safeText(b.christmasDate,40);
    if(!title||!christmas||budget<0) return error(res,400,'Kontroller rundens innstillinger.');
    db.prepare('UPDATE rounds SET title=?,budget=?,opens_at=?,christmas_date=? WHERE id=?').run(title,budget,opens,christmas,r.id);
    return json(res,200,adminState());
  }
  if(path==='/api/admin/round/new' && req.method==='POST') {
    const b=await body(req), year=Number(b.year)||new Date().getFullYear()+1, title=safeText(b.title,80)||`Julen ${year}`;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE rounds SET status='closed' WHERE status='open'").run();
      db.prepare("DELETE FROM sessions WHERE kind='guest'").run();
      db.prepare('INSERT INTO rounds(title,christmas_date) VALUES(?,?)').run(title,`${year}-12-24T18:00:00+01:00`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return json(res,201,adminState());
  }
  if(path==='/api/admin/participants' && req.method==='POST') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'Deltakerlisten er låst etter publisering.');
    const b=await body(req), names=(Array.isArray(b.names)?b.names:[b.name]).map(x=>safeText(x,60)).filter(Boolean), made=[];
    const insert=db.prepare('INSERT INTO participants(round_id,name,code_hash) VALUES(?,?,?)');
    for(const name of [...new Set(names.map(n=>n.toLocaleLowerCase('nb-NO')))].map(lower=>names.find(n=>n.toLocaleLowerCase('nb-NO')===lower))) {
      const c=code(); try { const info=insert.run(r.id,name,hash(c)); made.push({id:Number(info.lastInsertRowid),name,code:c}); } catch {}
    }
    return json(res,201,{state:adminState(),created:made});
  }
  const pm=path.match(/^\/api\/admin\/participants\/(\d+)(?:\/(code))?$/);
  if(pm && req.method==='PATCH') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'Deltakerlisten er låst.');
    const b=await body(req), name=safeText(b.name,60); if(!name) return error(res,400,'Navn mangler.');
    try { db.prepare('UPDATE participants SET name=? WHERE id=? AND round_id=?').run(name,Number(pm[1]),r.id); } catch { return error(res,409,'Navnet finnes allerede.'); }
    return json(res,200,adminState());
  }
  if(pm && req.method==='DELETE') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'Deltakerlisten er låst.');
    db.prepare('DELETE FROM participants WHERE id=? AND round_id=?').run(Number(pm[1]),r.id); return json(res,200,adminState());
  }
  if(pm && pm[2]==='code' && req.method==='POST') {
    const c=code(), result=db.prepare('UPDATE participants SET code_hash=? WHERE id=?').run(hash(c),Number(pm[1]));
    if(!result.changes) return error(res,404,'Deltaker ikke funnet.'); return json(res,200,{code:c});
  }
  if(path==='/api/admin/exclusions' && req.method==='PUT') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'Reglene er låst.');
    const b=await body(req), giver=Number(b.giverId), receiver=Number(b.receiverId); if(!giver||!receiver||giver===receiver) return error(res,400,'Velg to ulike personer.');
    db.prepare('INSERT OR IGNORE INTO exclusions VALUES(?,?,?)').run(r.id,giver,receiver); return json(res,200,adminState());
  }
  if(path==='/api/admin/exclusions' && req.method==='DELETE') {
    const r=currentRound(), b=await body(req); db.prepare('DELETE FROM exclusions WHERE round_id=? AND giver_id=? AND receiver_id=?').run(r.id,Number(b.giverId),Number(b.receiverId)); return json(res,200,adminState());
  }
  if(path==='/api/admin/publish' && req.method==='POST') {
    const r=currentRound(); if(r.status!=='draft') return error(res,409,'Runden er allerede publisert.');
    const ids=db.prepare('SELECT id FROM participants WHERE round_id=?').all(r.id).map(x=>Number(x.id)); if(ids.length<2) return error(res,400,'Legg til minst to deltakere.');
    const blocked=new Set(db.prepare('SELECT giver_id,receiver_id FROM exclusions WHERE round_id=?').all(r.id).map(x=>`${x.giver_id}:${x.receiver_id}`));
    const solved=solveAssignments(ids,blocked); if(!solved) return error(res,422,'Ingen gyldig fordeling finnes med disse reglene. Fjern én eller flere regler.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const up=db.prepare('UPDATE participants SET assigned_to=? WHERE id=?');
      for(const [g,t] of solved) up.run(t,g);
      db.prepare("UPDATE rounds SET status='open' WHERE id=?").run(r.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return json(res,200,adminState());
  }
  if(path==='/api/identify' && req.method==='POST') {
    if(rateLimited(req,'identify',10)) return error(res,429,'For mange forsøk. Vent litt.');
    const b=await body(req), r=currentRound(), name=safeText(b.name,60), c=safeText(b.code,40).toUpperCase();
    if(!r||r.status!=='open') return error(res,403,'Trekningen er ikke åpen ennå.');
    if(r.opens_at && new Date(r.opens_at).getTime()>Date.now()) return error(res,403,`Trekningen åpner ${new Date(r.opens_at).toLocaleString('nb-NO')}.`);
    const p=db.prepare('SELECT * FROM participants WHERE round_id=? AND name=? COLLATE NOCASE').get(r.id,name);
    if(!p || p.code_hash!==hash(c)) return error(res,401,'Navn eller privat kode stemmer ikke.');
    const token=newSession('guest',Number(p.id)); return json(res,200,{name:p.name,opened:!!p.opened_at},[`ss_guest=${token}; HttpOnly; ${COOKIE_POLICY}; Path=/; Max-Age=2592000`]);
  }
  if(path==='/api/me' && req.method==='GET') {
    const s=session(req,'guest'); if(!s) return error(res,401,'Skriv inn navn og kode først.');
    const p=db.prepare('SELECT p.*,r.title,r.budget,r.christmas_date FROM participants p JOIN rounds r ON r.id=p.round_id WHERE p.id=?').get(s.participant_id); if(!p) return error(res,404,'Deltaker ikke funnet.');
    let recipient=null; if(p.opened_at) recipient=db.prepare('SELECT name,wishlist FROM participants WHERE id=?').get(p.assigned_to);
    return json(res,200,{name:p.name,opened:!!p.opened_at,wishlist:p.wishlist,recipient,round:{title:p.title,budget:p.budget,christmasDate:p.christmas_date}});
  }
  if(path==='/api/reveal' && req.method==='POST') {
    const s=session(req,'guest'); if(!s) return error(res,401,'Identifisering kreves.');
    const p=db.prepare('SELECT p.*,r.status,r.opens_at FROM participants p JOIN rounds r ON r.id=p.round_id WHERE p.id=?').get(s.participant_id);
    if(!p||p.status!=='open'||(p.opens_at&&new Date(p.opens_at).getTime()>Date.now())) return error(res,403,'Trekningen er ikke åpen.');
    db.prepare('UPDATE participants SET opened_at=COALESCE(opened_at,CURRENT_TIMESTAMP) WHERE id=?').run(p.id);
    const recipient=db.prepare('SELECT name,wishlist FROM participants WHERE id=?').get(p.assigned_to); return json(res,200,{name:p.name,recipient});
  }
  if(path==='/api/wishlist' && req.method==='PUT') {
    const s=session(req,'guest'); if(!s) return error(res,401,'Identifisering kreves.'); const b=await body(req), wishlist=safeText(b.wishlist,1000);
    db.prepare('UPDATE participants SET wishlist=? WHERE id=?').run(wishlist,s.participant_id); return json(res,200,{ok:true});
  }
  error(res,404,'Ikke funnet.');
}

function serve(res,urlPath) {
  let rel=urlPath==='/'?'index.html':urlPath==='/admin'?'admin.html':urlPath.slice(1);
  const file=normalize(join(STATIC,rel)); if(!file.startsWith(STATIC)||!existsSync(file)) return false;
  const data=readFileSync(file); res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}); res.end(data); return true;
}

if (process.env.NODE_ENV !== 'test') createServer(async(req,res)=>{
  try { const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); if(req.method==='OPTIONS'&&url.pathname.startsWith('/api/')){res.writeHead(204,{'Access-Control-Allow-Origin':PUBLIC_ORIGIN||'null','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});return res.end()} if(url.pathname.startsWith('/api/')) return await api(req,res,url); if(!serve(res,url.pathname)) error(res,404,'Ikke funnet.'); }
  catch(e) { console.error(e); error(res,500,e.message==='For stor forespørsel'?e.message:'Noe gikk galt på serveren.'); }
}).listen(PORT,HOST,()=>console.log(`🎄 Secret Santa kjører på http://localhost:${PORT}`));
