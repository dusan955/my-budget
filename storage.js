/** Encrypted local vault. Atomic migration from v0.1 removes legacy plaintext records.
 * Keys exist in memory only. All database writes use optimistic compare-and-swap.
 */
import {blankState,validateState} from './core.js';
import {randomBytes,b64url,unb64url,aesKey,passwordKey,prfKey,seal,unseal,sealJSON,unsealJSON,validatePassword,KDF_ITERATIONS} from './crypto.js';
import {registerPasskey,authenticatePasskey} from './passkeys.js';
const DB='moj-budzet-v1';let dbPromise,meta=null,session=null,epoch=0;
export function openDB(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('app');
  q.onsuccess=()=>{const db=q.result;db.onversionchange=()=>{db.close();dbPromise=null;lockVault();};resolve(db);};
  q.onerror=()=>reject(new Error('Lokalna baza nije dostupna. Ne briši podatke pregledača.'));
  q.onblocked=()=>reject(new Error('Zatvori ostale prozore aplikacije.'));
 });return dbPromise;
}
async function snapshot(){const db=await openDB();return new Promise((resolve,reject)=>{
 const tx=db.transaction('app','readonly'),s=tx.objectStore('app'),q=s.get('vault'),old=s.get('state'),recovery=s.get('recovery');
 tx.oncomplete=()=>resolve({vault:q.result||null,legacy:old.result||null,recovery:recovery.result||null});tx.onerror=()=>reject(tx.error);
});}
function validateVault(v){if(!v||v.format!=='moj-budzet-vault'||v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<1||typeof v.id!=='string'||v.kdfIterations!==KDF_ITERATIONS||unb64url(v.passwordSalt).length!==16||!v.passwordWrap||!v.data)throw new Error('Neispravan ili nepodržan šifrovani sef. Postojeći podaci nisu izmenjeni.');return v;}
/** The transaction has no awaits inside it (Safari IDB auto-commit safe). */
async function commit(next,old,{legacyRevision}={}){
 const db=await openDB();return new Promise((resolve,reject)=>{
  let error;const tx=db.transaction('app','readwrite'),s=tx.objectStore('app');const q=s.get('vault');
  const fail=()=>{error=new Error('Podaci su promenjeni u drugom prozoru. Ponovi radnju.');error.code='CONFLICT';tx.abort();};
  q.onsuccess=()=>{
   const current=q.result;
   if(old ? (!current||current.id!==old.id||current.revision!==old.revision) : Boolean(current)){fail();return;}
   const put=()=>{s.put(next,'vault');s.delete('state');s.delete('recovery');};
   if(!old){const l=s.get('state');l.onsuccess=()=>{if((l.result?.revision??0)!==legacyRevision){fail();return;}put();};}else put();
  };
  tx.oncomplete=()=>{meta=next;resolve();};tx.onabort=tx.onerror=()=>reject(error||new Error('Čuvanje nije uspelo. Postojeći sef nije zamenjen. Proveri slobodan prostor.'));
 });
}
const ctx=(v,label)=>`moj-budzet/vault/1/${v.id}/${label}`;
export function securityInfo(){return {exists:Boolean(meta),faceId:Boolean(meta?.passkey),unlocked:Boolean(session)};}
export function isUnlocked(){return Boolean(session);}
export function lockVault(){session?.raw.fill(0);session=null;epoch++;}
function requireSession(){if(!session){const e=new Error('Aplikacija je zaključana. Ponovo je otključaj.');e.code='LOCKED';throw e;}return session;}
function checkEpoch(e){if(e!==epoch){const error=new Error('Aplikacija se zaključala. Pokušaj ponovo.');error.code='LOCKED';throw error;}}
async function current(){const v=validateVault((await snapshot()).vault);if(session&&session.id!==v.id){lockVault();throw new Error('Promenjen je sef. Otključaj ponovo.');}meta=v;return v;}
export async function initVault(){const s=await snapshot();meta=s.vault?validateVault(s.vault):null;return {...securityInfo(),hasLegacy:Boolean(s.legacy)};}
export async function createVault(password){
 validatePassword(password);const e=epoch,s=await snapshot();if(s.vault)throw new Error('Zaštita je već postavljena. Otključaj postojeću evidenciju.');
 const data=s.legacy?validateState(s.legacy):blankState(),recovery=s.recovery?validateState(s.recovery):null;
 const raw=randomBytes(32),key=await aesKey(raw),salt=randomBytes(16),id=b64url(randomBytes(16));
 const v={format:'moj-budzet-vault',version:1,revision:1,id,passwordSalt:b64url(salt),kdfIterations:KDF_ITERATIONS,passkey:null};
 try{
  v.passwordWrap=await seal(await passwordKey(password,salt),raw,ctx(v,'password'));
  v.data=await sealJSON(key,data,ctx(v,'data'));v.recovery=recovery?await sealJSON(key,recovery,ctx(v,'recovery')):null;
  checkEpoch(e);await commit(v,null,{legacyRevision:s.legacy?.revision??0});checkEpoch(e);
  session={raw,key,id};return data;
 }catch(error){raw.fill(0);throw error;}
}
async function activate(raw,v,e){
 try{const key=await aesKey(raw);const data=validateState(await unsealJSON(key,v.data,ctx(v,'data')));checkEpoch(e);session?.raw.fill(0);session={raw,key,id:v.id};meta=v;return data;}catch(error){raw.fill(0);throw error;}
}
export async function unlockPassword(password){
 const e=epoch,v=await current();let raw;
 try{raw=await unseal(await passwordKey(password,unb64url(v.passwordSalt)),v.passwordWrap,ctx(v,'password'));}catch{throw new Error('Pogrešna rezervna lozinka ili oštećen zapis. Podaci nisu obrisani.');}
 return activate(raw,v,e);
}
// meta is loaded by initVault before the user clicks, preserving Safari user activation.
export async function unlockPasskey(signal){
 const e=epoch,v=meta;if(!v?.passkey)throw new Error('Face ID nije podešen.');
 const output=await authenticatePasskey(v.passkey,signal);
 try{const wrapping=await prfKey(output,v.id),raw=await unseal(wrapping,v.passkey.wrap,ctx(v,'passkey'));return await activate(raw,v,e);}finally{output.fill(0);}
}
export async function beginPasskey(signal){const s=requireSession(),e=epoch;const pending=await registerPasskey(s.id,signal);checkEpoch(e);return pending;}
export async function finishPasskey(pending,signal){
 const s=requireSession(),e=epoch;const output=await authenticatePasskey(pending,signal);
 try{
  const v=await current();checkEpoch(e);const wrap=await seal(await prfKey(output,v.id),s.raw,ctx(v,'passkey'));
  const next={...v,revision:v.revision+1,passkey:{...pending,wrap}};checkEpoch(e);await commit(next,v);checkEpoch(e);
 }finally{output.fill(0);}
}
export async function removePasskey(){const e=epoch;requireSession();const v=await current();checkEpoch(e);await commit({...v,revision:v.revision+1,passkey:null},v);}
export async function changePassword(password){
 validatePassword(password);const s=requireSession(),e=epoch,v=await current(),salt=randomBytes(16);
 const wrap=await seal(await passwordKey(password,salt),s.raw,ctx(v,'password'));checkEpoch(e);
 await commit({...v,revision:v.revision+1,passwordSalt:b64url(salt),passwordWrap:wrap},v);
}
export async function readState(){const s=requireSession(),e=epoch,v=await current();const data=validateState(await unsealJSON(s.key,v.data,ctx(v,'data')));checkEpoch(e);return data;}
export async function readRecovery(){const s=requireSession(),e=epoch,v=await current();const data=v.recovery?validateState(await unsealJSON(s.key,v.recovery,ctx(v,'recovery'))):null;checkEpoch(e);return data;}
export async function writeState(next,expectedRevision,{saveRecovery=false}={}){
 const s=requireSession(),e=epoch;next=validateState(next);const v=await current(),old=validateState(await unsealJSON(s.key,v.data,ctx(v,'data')));
 if(old.revision!==expectedRevision){const error=new Error('Evidencija je promenjena u drugom prozoru. Ponovi čuvanje.');error.code='CONFLICT';throw error;}
 next.revision=old.revision+1;
 const record={...v,revision:v.revision+1,data:await sealJSON(s.key,next,ctx(v,'data')),recovery:saveRecovery?await sealJSON(s.key,old,ctx(v,'recovery')):v.recovery};
 checkEpoch(e);await commit(record,v);checkEpoch(e);return next;
}
