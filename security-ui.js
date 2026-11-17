import {initVault,securityInfo,isUnlocked,lockVault,createVault,unlockPassword,unlockPasskey,beginPasskey,finishPasskey,removePasskey,changePassword} from './storage.js';
import {platformAvailable,explainAuthError} from './passkeys.js';
const root=document.querySelector('#app'),dialog=document.querySelector('#editor');
const face='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M5 16V9a4 4 0 0 1 4-4h7m16 0h7a4 4 0 0 1 4 4v7M5 32v7a4 4 0 0 0 4 4h7m16 0h7a4 4 0 0 0 4-4v-7M16 17v5m16-5v5m-9-4v9h-3m-4 5q8 7 16 0"/></svg>';
let callbacks={},pending=null,authController=null,working=false,systemAuth=false,hiddenDuringAuth=false,idleTimer=null,supported=false,initialized=false,failedAttempts=0,nextTry=0;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('moj-budzet-vault-lock'):null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function curtain(on){document.documentElement.classList.toggle('privacy-hidden',on);}
function message(text){const box=document.querySelector('#security-error');if(box){box.textContent=text;box.focus();}}
function sharedNote(){return '<p class="security-footnote">Samo finansijska evidencija ostaje lokalno. Apple ili izabrani čuvar može sinhronizovati passkey; to ne sinhronizuje tvoje troškove. Biometriju obrađuje uređaj, ne ova aplikacija.</p>';}
function recoveryFields(){return '<label>Rezervna lozinka<input name="password" type="password" minlength="12" maxlength="1024" autocomplete="new-password" required placeholder="Najmanje 12 znakova"></label><label>Ponovi lozinku<input name="confirm" type="password" minlength="12" maxlength="1024" autocomplete="new-password" required></label><label class="check-label"><input name="saved" type="checkbox" required>Sačuvaću lozinku na bezbednom mestu. Bez lozinke ili ispravnog passkey-a ne mogu otključati ovu bazu.</label>';}
function gate(){
 const info=securityInfo();
 root.innerHTML=`<main class="security-shell"><div class="security-brand">Moj budžet <span>0.2</span></div><section class="security-card"><div class="face-symbol">${face}</div><p class="eyebrow">${info.exists?'ZAKLJUČANA EVIDENCIJA':'ZAŠTITA TVOJE EVIDENCIJE'}</p><h1>${info.exists?'Tvoj budžet.<br>Samo za tebe.':'Prvo zaštitimo<br>tvoj budžet.'}</h1><p class="security-lead">${info.exists?'Iznosi su skriveni, a lokalna baza je šifrovana. Otključaj da nastaviš.':'Postavi rezervnu lozinku. Zatim uključi Face ID i unesi odvojena početna stanja.'}</p>
 ${info.exists?`${info.faceId?`<button class="btn primary security-primary" data-action="sec-unlock-face">${face}<span>Otključaj sa Face ID</span></button><p class="field-help">Sistemski passkey: iOS može ponuditi i šifru uređaja.</p>`:''}<details class="security-password" ${info.faceId?'':'open'}><summary>Otključaj rezervnom lozinkom</summary><form id="security-unlock-form"><label>Rezervna lozinka<input name="password" type="password" autocomplete="current-password" required></label><button class="btn secondary security-primary" type="submit">Otključaj</button></form></details><p class="security-footnote">Zaboravljena lozinka? Kada otključaš Face ID-om, promeni je u Podešavanjima. Ako oba načina nisu dostupna, potrebna je ranije izvezena kopija. Brisanje aplikacije nije reset lozinke.</p>`:`<form id="security-setup-form">${recoveryFields()}<button class="btn primary security-primary" type="submit">Zaštiti evidenciju</button></form><p class="security-footnote">Postojeći podaci iz verzije 0.1 biće prebačeni u šifrovani sef. Pre nadogradnje sačuvaj kopiju.</p>`}
 <div id="security-error" class="form-error" role="alert" tabindex="-1"></div></section>${!standalone()?'<p class="install-tip">Na iPhone-u prvo otvori stalni HTTPS link u Safariju → Share → Add to Home Screen. Zaštitu podesi u aplikaciji otvorenoj preko ikonice.</p>':''}<p class="security-footnote">Bez naloga za budžet · Bez cloud baze</p><p id="offline-status" class="security-footnote">${navigator.serviceWorker?.controller?'Aplikacija je spremna za rad bez interneta.':'Za offline rad sačekaj potvrdu pripreme aplikacije.'}</p></main>`;
}
function resetIdle(){clearTimeout(idleTimer);if(isUnlocked())idleTimer=setTimeout(()=>{if(systemAuth){resetIdle();return;}lockNow();},120000);}
export function lockNow(broadcast=true){
 if(!initialized)return;
 authController?.abort();pending=null;clearTimeout(idleTimer);lockVault();callbacks.beforeLock?.();
 if(dialog.open)dialog.close();dialog.innerHTML='';document.querySelector('#toast')?.replaceChildren();document.querySelector('#toast')?.classList.remove('visible');
 gate();if(!document.hidden)curtain(false);if(broadcast)channel?.postMessage('lock');
}
async function unlocked(data){if(document.hidden){lockNow();return;}failedAttempts=0;nextTry=0;curtain(false);await callbacks.afterUnlock?.(data);resetIdle();}
async function run(operation,{auth=false,onSuccess}={}){
 if(working)return;working=true;systemAuth=auth;hiddenDuringAuth=false;authController=auth?new AbortController():null;
 const controls=[...document.querySelectorAll('.security-card button, #security-dialog button, .security-card input, #security-dialog input')];controls.forEach(b=>b.disabled=true);
 document.querySelector('#security-error')?.replaceChildren();
 let success=false;
 try{const result=await operation(authController?.signal);success=true;if(onSuccess)await onSuccess(result);}
 catch(error){if(error.code!=='LOCKED')message(explainAuthError(error));}
 finally{
  const hidden=hiddenDuringAuth;systemAuth=false;authController=null;working=false;controls.forEach(b=>{b.disabled=false;});
  if(document.hidden||(hidden&&!success))lockNow();else {curtain(false);resetIdle();}
 }
}
function showSecurityDialog(body){
 if(!isUnlocked())return;
 dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">Face ID i zaštita</h2><button class="icon-btn" data-action="close" aria-label="Zatvori">×</button></div><div id="security-dialog" class="dialog-body">${body}<div id="security-error" class="form-error" role="alert" tabindex="-1"></div></div>`;
 if(!dialog.open)dialog.showModal();
}
export function openSecurity(){
 const info=securityInfo();pending=null;
 showSecurityDialog(`<div class="security-feature-icon">${face}</div><h3>${info.faceId?'Face ID je uključen':'Uključi Face ID'}</h3><p>Koristi sistemski passkey da otključaš šifrovanu lokalnu bazu. Na iPhone-u može se pojaviti Face ID ili šifra telefona. Ne koristimo kameru i ne dobijamo podatke o tvom licu.</p><p>Za ovu zaštitu potrebna je podrška za WebAuthn PRF. Ako je uređaj nema, ostaje rezervna lozinka; ne prelazimo na slabiju, nešifrovanu zaštitu.</p>${info.faceId?'<button class="btn secondary" data-action="sec-disable-face">Isključi Face ID</button>':`<button class="btn primary" data-action="sec-register-face" ${supported?'':'disabled'}>1. Napravi passkey</button>${!supported?'<p>Platformski passkey nije dostupan u ovom pregledaču. Na iPhone-u koristi Safari/PWA na HTTPS adresi, sa uključenim Face ID-om i šifrom telefona.</p>':''}`}<button class="btn ghost" data-action="sec-change-password">Promeni rezervnu lozinku</button>${sharedNote()}`);
}
export function securityPanel(){const info=securityInfo();return `<section class="card"><h2>Face ID i zaštita</h2><p><strong>${info.faceId?'Face ID / passkey uključen':'Rezervna lozinka je aktivna · Face ID još nije uključen'}</strong></p><p>Baza i stanje pre uvoza šifrovani su AES-GCM ključem. Aplikacija se zaključava pri prelasku u pozadinu i nakon 2 minuta bez aktivnosti. Nesačuvan unos se tada zatvara.</p><button class="btn primary" data-action="sec-settings">${info.faceId?'Podesi zaštitu':'Uključi Face ID'}</button><button class="btn secondary" data-action="sec-lock">Zaključaj sada</button><p>Šifrovanje nije zamena za rezervnu kopiju. Kopije imaju zasebnu lozinku koju biraš pri izvozu.</p></section>`;}
export async function initializeSecurity(cb){
 callbacks=cb;if(!globalThis.crypto?.subtle)throw new Error('Šifrovanje zahteva HTTPS adresu ili localhost. Ne otvaraj ZIP/HTML direktno iz Files.');await initVault();initialized=true;gate();
 // Nonblocking capability check; re-evaluated before a settings dialog opens.
 platformAvailable().then(v=>{supported=v;});
}
document.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]')?.dataset.action;if(!action?.startsWith('sec-'))return;
 if(action==='sec-lock'){lockNow();return;}
 if(action==='sec-settings'){platformAvailable().then(v=>{supported=v;openSecurity();});return;}
 if(action==='sec-unlock-face')run(signal=>unlockPasskey(signal),{auth:true,onSuccess:unlocked});
 if(action==='sec-register-face')run(signal=>beginPasskey(signal),{auth:true,onSuccess:record=>{
  pending=record;showSecurityDialog(`<h3>Ključ je napravljen. Sada ga proveri.</h3><p>Još jedna sistemska potvrda proverava da passkey zaista otključava šifrovanu bazu. Tek nakon toga uključujemo Face ID.</p><button class="btn primary" data-action="sec-confirm-face">2. Potvrdi i uključi Face ID</button>${sharedNote()}`);
 }});
 if(action==='sec-confirm-face'&&pending)run(signal=>finishPasskey(pending,signal),{auth:true,onSuccess:()=>{pending=null;dialog.close();dialog.innerHTML='';callbacks.changed?.();}});
 if(action==='sec-disable-face'&&confirm('Isključi Face ID za ovu bazu? Rezervna lozinka i šifrovanje ostaju. Sam passkey može ostati u Apple Passwords.'))run(()=>removePasskey(),{onSuccess:()=>{openSecurity();callbacks.changed?.();}});
 if(action==='sec-change-password')showSecurityDialog(`<h3>Nova rezervna lozinka</h3><p>Promena ne menja lozinke ranije izvezenih kopija.</p><form id="security-password-form">${recoveryFields()}<button class="btn primary" type="submit">Sačuvaj novu lozinku</button></form>`);
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!form.id.startsWith('security-'))return;event.preventDefault();
 // Read values BEFORE temporarily disabling controls.
 const f=new FormData(form),password=String(f.get('password')||'');
 if(form.id==='security-unlock-form'){
  if(Date.now()<nextTry){message('Previše neuspešnih pokušaja. Pokušaj ponovo za '+Math.ceil((nextTry-Date.now())/1000)+' s.');return;}
  run(async()=>{try{return await unlockPassword(password);}catch(e){failedAttempts++;nextTry=Date.now()+Math.min(30000,1000*2**Math.min(failedAttempts-1,5));throw e;}},{onSuccess:unlocked});return;
 }
 if(password!==String(f.get('confirm'))){message('Lozinke se ne poklapaju.');return;}
 if(!f.get('saved')){message('Potvrdi da ćeš sačuvati rezervnu lozinku.');return;}
 if(form.id==='security-setup-form')run(()=>createVault(password),{onSuccess:async data=>{await unlocked(data);supported=await platformAvailable();openSecurity();}});
 if(form.id==='security-password-form')run(()=>changePassword(password),{onSuccess:()=>{dialog.close();dialog.innerHTML='';callbacks.changed?.();}});
});
for(const event of ['pointerdown','keydown'])document.addEventListener(event,resetIdle,{passive:true});
document.addEventListener('visibilitychange',()=>{
 if(!initialized)return;
 if(document.hidden){curtain(true);if(systemAuth){hiddenDuringAuth=true;return;}lockNow();}
 else if(!systemAuth)curtain(false);
});
window.addEventListener('pagehide',()=>{if(initialized){curtain(true);lockNow();}});
window.addEventListener('pageshow',()=>{if(initialized&&!document.hidden)curtain(false);});
channel?.addEventListener('message',event=>{if(event.data==='lock'&&initialized)lockNow(false);});
