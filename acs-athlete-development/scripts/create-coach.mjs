import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';
import { credentials, passwordHash } from '../server.mjs';
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
let db;
try {
  const email=await prompt.question('Coach email: ');
  process.stdout.write('Password (12–128 characters; hidden): ');muted=true;
  const password=await prompt.question('');muted=false;process.stdout.write('\n');
  const normalized=credentials({email,password});
  db=openStore(process.env.ACS_DB_PATH || fileURLToPath(new URL('../data/acs.sqlite',import.meta.url)));
  const hash=await passwordHash(password);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(randomUUID(),normalized,hash,'coach',null);
  console.log('Coach account created. Sign in with that email and password.');
}catch(error){console.error(error.code?.includes('SQLITE')?'Account could not be created; the email may already exist.':error.message);process.exitCode=1;}
finally {prompt.close();db?.close();}
