/** Local WebAuthn ceremonies: validate origin, challenge, RP hash, UP/UV and ES256 signature.
 * PRF derives a wrapping key, so a successful dialog alone never unlocks plaintext data.
 * WebAuthn cannot force Face ID instead of the device's allowed verification methods.
 */
import {randomBytes,b64url,unb64url,equalBytes,utf8} from './crypto.js';
export async function platformAvailable(){try{return Boolean(window.isSecureContext&&window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch{return false;}}
function requirePlatform(){if(!window.isSecureContext||!window.PublicKeyCredential||!navigator.credentials)throw new Error('Face ID zahteva HTTPS adresu i pregledač sa podrškom za passkey.');}
export function explainAuthError(error){
 if(error.name==='NotAllowedError'||error.name==='AbortError')return 'Potvrda je otkazana ili nije završena. Pokušaj ponovo ili upotrebi rezervnu lozinku.';
 if(error.name==='SecurityError')return 'Passkey ne važi za ovu adresu. Otvori stalnu HTTPS adresu aplikacije.';
 if(error.name==='NotSupportedError')return 'Ovaj uređaj ili čuvar lozinki ne podržava traženi passkey. Koristi rezervnu lozinku.';
 return error.message||'Sistemska potvrda nije uspela.';
}
export async function validateClientData(raw,type,challenge,origin){
 const c=JSON.parse(new TextDecoder().decode(raw));
 if(c.type!==type||c.origin!==origin||c.crossOrigin===true||!equalBytes(unb64url(c.challenge),challenge))throw new Error('Neispravna WebAuthn potvrda (adresa ili zahtev).');
}
export async function validateAuthenticatorData(raw,rpId){
 const a=new Uint8Array(raw);const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(rpId)));
 if(a.length<37||!equalBytes(a.slice(0,32),expected)||(a[32]&5)!==5)throw new Error('Sistem nije potvrdio korisnika ili adresu aplikacije.');
 return new DataView(a.buffer,a.byteOffset,a.byteLength).getUint32(33);
}
/** Strict ASN.1 DER ECDSA signature -> Web Crypto IEEE-P1363 r||s. */
export function derToRaw(signature){
 const a=new Uint8Array(signature);let p=0;
 if(a[p++]!==0x30||a[p++]!==a.length-2)throw new Error('Neispravan potpis.');
 const out=new Uint8Array(64);
 for(let j=0;j<2;j++){
  if(a[p++]!==2)throw new Error('Neispravan potpis.');const len=a[p++];
  if(!len||len>33||p+len>a.length||(a[p]&0x80))throw new Error('Neispravan potpis.');
  let v=a.slice(p,p+len);p+=len;
  if(v.length>1&&v[0]===0){if(!(v[1]&0x80))throw new Error('Neispravan potpis.');v=v.slice(1);}
  if(v.length>32)throw new Error('Neispravan potpis.');out.set(v,j*32+32-v.length);
 }
 if(p!==a.length)throw new Error('Neispravan potpis.');return out;
}
export async function verifyAssertion(credential,record,challenge,origin=location.origin){
 if(!credential||credential.type!=='public-key'||!equalBytes(credential.rawId,unb64url(record.credentialId)))throw new Error('Nije izabran ključ ove evidencije.');
 await validateClientData(credential.response.clientDataJSON,'webauthn.get',challenge,origin);
 await validateAuthenticatorData(credential.response.authenticatorData,record.rpId);
 const auth=new Uint8Array(credential.response.authenticatorData),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',credential.response.clientDataJSON));
 const signed=new Uint8Array(auth.length+hash.length);signed.set(auth);signed.set(hash,auth.length);
 const key=await crypto.subtle.importKey('spki',unb64url(record.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,derToRaw(credential.response.signature),signed))throw new Error('Potpis uređaja nije ispravan.');
 const output=credential.getClientExtensionResults()?.prf?.results?.first;
 if(!output||new Uint8Array(output).length!==32)throw new Error('Nema podrške za šifrovano otključavanje (WebAuthn PRF). Face ID nije uključen; koristi rezervnu lozinku. Probaj ažuriran iOS i Apple Passwords.');
 return new Uint8Array(output);
}
// Must be invoked immediately from a user click, before unrelated asynchronous work.
export async function registerPasskey(vaultId,signal){
 requirePlatform();const challenge=randomBytes(32),salt=randomBytes(32),rpId=location.hostname;
 const c=await navigator.credentials.create({publicKey:{rp:{name:'Moj budžet',id:rpId},user:{id:randomBytes(32),name:'moj-budzet-'+vaultId.slice(0,8),displayName:'Moj budžet na ovom uređaju'},challenge,pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',userVerification:'required'},attestation:'none',timeout:60000,extensions:{prf:{eval:{first:salt}}}},signal});
 if(!c||c.type!=='public-key')throw new Error('Ključ nije napravljen.');
 await validateClientData(c.response.clientDataJSON,'webauthn.create',challenge,location.origin);
 if(typeof c.response.getPublicKey!=='function'||typeof c.response.getAuthenticatorData!=='function')throw new Error('Ova verzija pregledača ne podržava bezbednu registraciju. Koristi rezervnu lozinku.');
 await validateAuthenticatorData(c.response.getAuthenticatorData(),rpId);
 const publicKey=c.response.getPublicKey();if(!publicKey||c.response.getPublicKeyAlgorithm()!==-7)throw new Error('Nepodržan tip ključa.');
 // A second explicit click tests get()+PRF before saving any change to the vault.
 return {credentialId:b64url(c.rawId),publicKey:b64url(publicKey),rpId,origin:location.origin,salt:b64url(salt)};
}
export async function authenticatePasskey(record,signal){
 requirePlatform();if(record.origin!==location.origin||record.rpId!==location.hostname)throw new Error('Promenjena je adresa aplikacije. Otključaj rezervnom lozinkom i ponovo uključi Face ID.');
 const challenge=randomBytes(32);
 const c=await navigator.credentials.get({publicKey:{challenge,rpId:record.rpId,allowCredentials:[{type:'public-key',id:unb64url(record.credentialId),transports:['internal']}],userVerification:'required',timeout:60000,extensions:{prf:{evalByCredential:{[record.credentialId]:{first:unb64url(record.salt)}}}}},signal});
 return verifyAssertion(c,record,challenge);
}
