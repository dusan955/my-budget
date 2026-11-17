import {validateState} from './core.js';
const ITERATIONS=600000;
function b64(bytes){let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s);}
function unb64(s){if(typeof s!=='string')throw new Error('Neispravna kopija.');return Uint8Array.from(atob(s),x=>x.charCodeAt(0));}
async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encodeBackup(state,password=''){
 const payload={format:'moj-budzet-backup',version:1,exportedAt:new Date().toISOString(),data:validateState(state)};
 if(!password)return JSON.stringify(payload,null,2);
 if(password.length<10)throw new Error('Za šifrovanu kopiju koristi lozinku od najmanje 10 znakova.');
 if(!crypto.subtle)throw new Error('Šifrovanje zahteva HTTPS ili localhost.');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt);
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload)));
 return JSON.stringify({format:'moj-budzet-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-GCM-256',salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))});
}
export async function decodeBackup(text,password=''){
 if(typeof text!=='string'||text.length>20*1024*1024)throw new Error('Kopija je prevelika (najviše 20 MB).');
 let payload;try{payload=JSON.parse(text);}catch{throw new Error('Fajl nije ispravan JSON.');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Fajl nije ispravna kopija.');
 if(payload.format==='moj-budzet-encrypted'){
  if(payload.version!==1||payload.iterations!==ITERATIONS||payload.kdf!=='PBKDF2-SHA256'||payload.cipher!=='AES-GCM-256')throw new Error('Nepodržana šifrovana kopija.');
  if(!crypto.subtle)throw new Error('Vraćanje šifrovane kopije zahteva HTTPS ili localhost.');
  try{const salt=unb64(payload.salt),iv=unb64(payload.iv);if(salt.length!==16||iv.length!==12)throw new Error();const key=await derive(password,salt);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,unb64(payload.ciphertext));payload=JSON.parse(new TextDecoder().decode(clear));}catch{throw new Error('Pogrešna lozinka ili oštećena kopija.');}
 }
 if(payload.format!=='moj-budzet-backup'||payload.version!==1)throw new Error('Ovo nije podržana kopija aplikacije Moj budžet.');
 return validateState(payload.data);
}
