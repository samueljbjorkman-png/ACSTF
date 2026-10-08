import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { teamLeaderboards } from './src/domain.js';
import { openStore, readState, visibleState, validateState } from './server/store.mjs';
const derive=promisify(scrypt);
const hashToken=token=>createHash('sha256').update(token).digest('hex');
const publicUser=u=>({id:u.id,email:u.email,role:u.role,athleteId:u.athlete_id});
const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const requireThat=(condition,status,message)=>{if(!condition)throw new HttpError(status,message);};
async function body(req) {let text='';for await(const chunk of req){text+=chunk;requireThat(Buffer.byteLength(text)<=2_000_000,413,'Request too large');}try{return JSON.parse(text);}catch{throw new HttpError(400,'Invalid JSON');}}
export async function passwordHash(password) {const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt,64)).toString('hex');}
async function passwordMatches(password,encoded) {const [salt,key]=encoded.split(':');return timingSafeEqual(Buffer.from(key,'hex'),await derive(password,salt,64));}
export function credentials(data) {requireThat(typeof data.email==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) && data.email.length<=254,400,'Enter a valid email');requireThat(typeof data.password==='string' && data.password.length>=12 && data.password.length<=128,400,'Use a password of 12–128 characters');return data.email.trim().toLowerCase();}
export function createApp({filename=process.env.ACS_DB_PATH || join(root,'data','acs.sqlite'),production=process.env.NODE_ENV==='production',origin=process.env.APP_ORIGIN}={}) {
  requireThat(!production || origin?.startsWith('https://'),500,'Production requires an HTTPS APP_ORIGIN');
  const db=openStore(filename), attempts=new Map();
  const server=createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      if(path.startsWith('/api/')) {
        if(!['GET','HEAD'].includes(req.method)) {
          const expected=origin || `http://${req.headers.host}`;
          requireThat(req.headers.origin===expected,403,'Request origin rejected');
          requireThat(req.headers['content-type']?.split(';')[0]==='application/json',415,'JSON required');
        }
        const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('acs_session='))?.slice(12);
        const token=raw?hashToken(raw):'';
        const user=db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token,Date.now());
        const count=db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
        const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
        const setupAvailable=!production && local && count===0;
        if(path==='/api/session' && req.method==='GET')return send(200,{user:user?publicUser(user):null,setupAvailable});
        if(['/api/login','/api/setup'].includes(path) && req.method==='POST') {
          const ip=req.socket.remoteAddress;
          const now=Date.now();let entry=attempts.get(ip);
          if(!entry || entry.until<now){entry={n:0,until:now+15*60_000};attempts.set(ip,entry);}
          requireThat(++entry.n<=20,429,'Too many attempts. Try again in 15 minutes.');
          const data=await body(req),email=credentials(data);
          if(path==='/api/setup') {
            requireThat(setupAvailable,403,'Initial setup unavailable');
            const password=await passwordHash(data.password);
            // Recheck after asynchronous hashing to prevent two first coaches.
            requireThat(db.prepare('SELECT COUNT(*) AS n FROM users').get().n===0,409,'Setup already completed');
            db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),email,password,'coach',null);
          }
          const account=db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const fallback='00000000000000000000000000000000:'+ '00'.repeat(64);
          const valid=await passwordMatches(data.password,account?.password || fallback);
          requireThat(account && valid && db.prepare('SELECT password FROM users WHERE id=?').get(account.id)?.password===account.password,401,'Email or password is incorrect');
          const session=randomBytes(32).toString('hex');
          db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
          db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(session),account.id,now+7*24*60*60_000);
          res.setHeader('Set-Cookie',`acs_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${production?'; Secure':''}`);
          return send(200,{user:publicUser(account)});
        }
        requireThat(user,401,'Sign in required');
        if(path==='/api/logout' && req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(token);res.setHeader('Set-Cookie',`acs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`);return send(200,{ok:true});}
        if(path==='/api/password' && req.method==='POST') {
          const data=await body(req);credentials({email:user.email,password:data.password});
          requireThat(typeof data.currentPassword==='string' && data.currentPassword.length<=128,400,'Invalid current password');
          requireThat(await passwordMatches(data.currentPassword,user.password),403,'Current password is incorrect');
          const password=await passwordHash(data.password);
          const changed=db.prepare('UPDATE users SET password=? WHERE id=? AND password=?').run(password,user.id,user.password);
          requireThat(changed.changes===1,409,'Password changed in another session. Sign in again.');
          db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,token);
          return send(200,{ok:true});
        }
        if(path==='/api/accounts' && req.method==='GET') {
          requireThat(user.role==='coach',403,'Coach permission required');
          return send(200,{accounts:db.prepare('SELECT id,email,role,athlete_id FROM users ORDER BY email').all().map(publicUser)});
        }
        if(path==='/api/accounts' && req.method==='DELETE') {
          requireThat(user.role==='coach',403,'Coach permission required');
          const data=await body(req);
          requireThat(typeof data.id==='string' && data.id!==user.id,400,'You cannot remove your own account');
          requireThat(db.prepare('DELETE FROM users WHERE id=?').run(data.id).changes===1,404,'Account not found');
          return send(200,{ok:true});
        }
        if(path==='/api/accounts' && req.method==='POST') {
          requireThat(user.role==='coach',403,'Coach permission required');
          const data=await body(req),email=credentials(data);
          requireThat(['coach','athlete'].includes(data.role),400,'Invalid role');
          requireThat(data.role==='coach' || readState(db).data.athletes.some(a=>a.id===data.athleteId),400,'Choose an existing athlete');
          const password=await passwordHash(data.password);
          try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),email,password,data.role,data.role==='athlete'?data.athleteId:null);}catch{throw new HttpError(409,'Account already exists');}
          return send(201,{ok:true});
        }
        if(path==='/api/leaderboards' && req.method==='GET') {
          const state=readState(db);
          return send(200,{leaderboards:teamLeaderboards(state.data.athletes,state.data.records)});
        }
        if(path==='/api/workspace' && req.method==='GET') {const state=readState(db);return send(200,{revision:state.revision,data:visibleState(state.data,user)});}
        if(path==='/api/workspace' && req.method==='PUT') {
          requireThat(user.role==='coach',403,'Only coaches can change roster, records, or plans');
          const payload=await body(req);let data;
          try{data=validateState(payload.data);}catch(e){throw new HttpError(400,e.message);}
          const links=db.prepare("SELECT athlete_id FROM users WHERE role='athlete'").all();
          requireThat(links.every(u=>data.athletes.some(a=>a.id===u.athlete_id)),400,'Cannot remove a profile with an athlete account');
          const result=db.prepare('UPDATE workspace SET data=?,revision=revision+1 WHERE id=1 AND revision=?').run(JSON.stringify(data),payload.revision);
          requireThat(result.changes===1,409,'Workspace changed on another device. Refresh and retry.');
          return send(200,{revision:payload.revision+1,data});
        }
        if(path==='/api/workouts' && req.method==='POST') {
          const payload=await body(req),state=readState(db),plan=state.data.plans.find(p=>p.id===payload.planId);
          requireThat(plan && (user.role==='coach' || plan.athleteId===user.athlete_id),403,'Workout unavailable');
          requireThat(plan.status!=='completed',409,'Workout already logged');
          requireThat(Array.isArray(payload.done) && payload.done.length===plan.exercises.length && payload.done.every(x=>typeof x==='boolean') && typeof payload.note==='string' && payload.note.length<=4000,400,'Invalid workout log');
          const date=new Date().toISOString();
          state.data.workouts.push({id:randomUUID(),planId:plan.id,athleteId:plan.athleteId,block:plan.block,date:date.slice(0,10),title:plan.title,isDeload:plan.isDeload,completed:true,exercises:plan.exercises.map((x,i)=>({...x,done:payload.done[i]})),coachNote:payload.note,progressionEligible:!plan.isDeload,createdAt:date});
          plan.status='completed';
          db.prepare('UPDATE workspace SET data=?,revision=revision+1 WHERE id=1').run(JSON.stringify(state.data));
          return send(201,{revision:state.revision+1,data:visibleState(state.data,user)});
        }
        throw new HttpError(404,'Not found');
      }
      requireThat(req.method==='GET' || req.method==='HEAD',405,'Method not allowed');
      // Serve explicit public assets only; never expose source server files or database.
      requireThat(path==='/' || path==='/index.html' || /^\/src\/[a-z-]+\.(js|css)$/.test(path) && !path.endsWith('.test.js') || path==='/public/favicon.svg',404,'Not found');
      const file=path==='/'?'index.html':path.slice(1),data=await readFile(join(root,file));
      res.writeHead(200,{'content-type':mime[extname(file)],'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){send(e.status || (e.code==='ENOENT'?404:500),{error:e.status?e.message:'Request failed'});}
  });
  server.on('close',()=>db.close());
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT || 4173),host=process.env.HOST || '127.0.0.1';
  createApp().listen(port,host,()=>console.log(`ACS server listening on ${host}:${port}`));
}
