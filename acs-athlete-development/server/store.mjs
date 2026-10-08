import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { METRICS } from '../src/domain.js';
export const emptyState = () => ({schemaVersion:1,athletes:[],records:[],plans:[],workouts:[]});
export function openStore(filename) {
  mkdirSync(dirname(filename), {recursive:true, mode:0o700});
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('coach','athlete')),athlete_id TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,data TEXT NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO workspace VALUES(1,0,?)').run(JSON.stringify(emptyState()));
  return db;
}
export function readState(db) {const row=db.prepare('SELECT * FROM workspace WHERE id=1').get();return {revision:row.revision,data:JSON.parse(row.data)};}
export function visibleState(state,user) {
  if(user.role==='coach')return state;
  return Object.fromEntries(Object.entries(state).map(([key,value])=>[key,Array.isArray(value)?value.filter(row=>(key==='athletes'?row.id:row.athleteId)===user.athlete_id):value]));
}
export function validateState(value) {
  if(!value || value.schemaVersion!==1)throw new Error('Invalid workspace');
  for(const key of ['athletes','records','plans','workouts']) {
    if(!Array.isArray(value[key]) || value[key].length>50000)throw new Error('Invalid '+key);
    const ids=new Set();
    for(const row of value[key]) {
      if(!row || typeof row.id!=='string' || !row.id || ids.has(row.id))throw new Error('Missing or duplicate ID in '+key);
      ids.add(row.id);
      if(key==='athletes' && row.sex!==undefined && row.sex!==null && !['female','male'].includes(row.sex))throw new Error('Sex must be female, male, or not recorded');
      if(key==='athletes') {if(typeof row.name!=='string' || !row.name.trim() || row.name.length>200 || (row.events!==undefined && (!Array.isArray(row.events) || !row.events.every(x=>typeof x==='string'))) || (row.baselines!==undefined && !Array.isArray(row.baselines)) || !Number.isInteger(row.level) || row.level<1 || row.level>5)throw new Error('Invalid athlete');}
      else if(!value.athletes.some(a=>a.id===row.athleteId))throw new Error('Unknown athlete ID');
      if(key==='records' && (!METRICS.some(m=>m.id===row.metric) || !Number.isFinite(row.value) || row.value<0))throw new Error('Invalid result');
      if(['plans','workouts'].includes(key) && (!Array.isArray(row.exercises) || row.exercises.length>100 || !row.exercises.every(x=>x && typeof x.name==='string' && x.name.length<=200) || !['A','C','B'].includes(row.block)))throw new Error('Invalid workout');
    }
  }
  return Object.fromEntries(['schemaVersion','athletes','records','plans','workouts'].map(key=>[key,value[key]]));
}
