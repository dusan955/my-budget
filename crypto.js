/** Web Crypto only. No network, external libraries, plaintext persisted keys or biometric data. */
export const KDF_ITERATIONS=600000;
export const utf8=new TextEncoder();
export const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
export function b64url(value){let s='';for(const n of new Uint8Array(value))s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unb64url(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]*$/.test(s))throw new Error('Neispravan kriptografski zapis.');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function equalBytes(a,b){a=new Uint8Array(a);b=new Uint8Array(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
export async function aesKey(raw){if(new Uint8Array(raw).length!==32)throw new Error('Neispravan ključ.');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
export function validatePassword(p){if(typeof p!=='string'||p.length<12||p.length>1024)throw new Error('Rezervna lozinka mora imati između 12 i 1024 znaka. Koristi dugu, jedinstvenu frazu.');}
export async function passwordKey(password,salt){
 const base=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function prfKey(output,vaultId){
 if(new Uint8Array(output).length!==32)throw new Error('Uređaj nije vratio ključ za šifrovanje.');
 const base=await crypto.subtle.importKey('raw',output,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:utf8.encode(vaultId),info:utf8.encode('moj-budzet/passkey-wrap/v1')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(key,data,context){const iv=randomBytes(12);return {iv:b64url(iv),data:b64url(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(context)},key,data))};}
export async function unseal(key,box,context){
 if(!box||typeof box.data!=='string'||box.data.length>32*1024*1024)throw new Error('Neispravan šifrovani zapis.');
 const iv=unb64url(box.iv);if(iv.length!==12)throw new Error('Neispravan šifrovani zapis.');
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:utf8.encode(context)},key,unb64url(box.data)));
}
export async function sealJSON(key,value,context){return seal(key,utf8.encode(JSON.stringify(value)),context);}
export async function unsealJSON(key,box,context){return JSON.parse(new TextDecoder().decode(await unseal(key,box,context)));}
