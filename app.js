import {openSheet,closeSheet,setSheetBusy,markSheetDirty,enhanceForm,fieldError,validateForm,clearFieldError} from './ui.js';
import {shiftMonth,searchKey,entryValues,previewImpact,buildEntries} from './view-model.js';
import {VERSION,BUDGETS,CURRENCIES,CATEGORIES,MAX_RECORDS,today,uid,validDate,addDays,parseMoney,money,inputMoney,dateLabel,blankState,validateState,effect,belongs,balance,forecast,monthStats,createTransactions} from './core.js';
import {readState,writeState,readRecovery,isUnlocked} from './storage.js';
import {initializeSecurity,securityPanel,lockNow} from './security-ui.js';
import {encodeBackup,decodeBackup} from './backup.js';
const root=document.querySelector('#app'),dialog=document.querySelector('#editor');
const preview=Boolean(window.PREVIEW_ONLY);
let state,screen='dashboard',scope='all',currency='RSD',horizon=30,historyMonth=today().slice(0,7),historyKind='all',search='',historyLimit=50,planLimit=50,planFilter='all',calendarMonth=today().slice(0,7),selectedDay=null,busy=false,offlineReady=false,persisted=false,swRegistration=null,reloadForUpdate=false,updateReady=false,historyCategory='',undoDeleted=null;
let theme='system';try{theme=localStorage.getItem('moj-budzet-theme')||'system';}catch{}
if(!['system','light','dark'].includes(theme))theme='system';
document.documentElement.dataset.theme=theme;
const iconPaths={wallet:'<path d="M4 7V5a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="19" height="14" rx="3"/><path d="M22 12h-6v5h6"/><path d="M18 14.5h.01"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',transfer:'<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',person:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a6 6 0 0 1 3 5"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',cloud:'<path d="M7 18H6a4 4 0 0 1-.4-8 7 7 0 0 1 13-1A4.5 4.5 0 0 1 18 18h-1M12 12v9m-3-3 3 3 3-3"/>',chart:'<path d="M4 20V11M10 20V4M16 20V8M22 20H2"/>',bag:'<path d="M4 7h16l1 14H3zM8 8V6a4 4 0 0 1 8 0v2"/>',home:'<path d="m3 10 9-8 9 8v11h-7v-7h-4v7H3z"/>',car:'<path d="m5 5-3 8v6h3v-3h14v3h3v-6l-3-8zM2 12h20M6 14h.01M18 14h.01"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.wallet}</svg>`;}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function brand(){return `<div class="brand"><span class="brand-symbol">${icon('wallet')}</span>Moj budžet<span class="version-pill">${VERSION}</span></div>`;}
function toast(text,{undo=false}={}){
 const el=document.querySelector('#toast');if(!undo)undoDeleted=null;
 el.innerHTML=`<span>${esc(text)}</span>${undo?'<button type="button" data-action="undo-delete">Poništi</button>':''}<button type="button" data-action="dismiss-toast" aria-label="Zatvori poruku">×</button>`;
 el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.classList.remove('visible');if(undo)undoDeleted=null;},undo?12000:6000);
}
function err(form,error){
 const message=typeof error==='string'?error:error.message||'Radnja nije uspela.';
 let el=form.querySelector('.form-error');if(!el){el=document.createElement('div');el.className='form-error';el.setAttribute('role','alert');form.append(el);}
 el.textContent=message;el.dataset.field=error.field||'';
 if(error.field)fieldError(form,error.field,message);else{el.tabIndex=-1;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'});}
}
async function mutate(change,{recovery=false}={}){
 if(busy)throw new Error('Čuvanje je u toku.');busy=true;
 try{const next=structuredClone(state);change(next);const clean=validateState(next);if(clean.transactions.length>MAX_RECORDS)throw new Error('Dostignut je limit evidencije.');state=preview?clean:await writeState(clean,state.revision,{saveRecovery:recovery});render();return true;}
 catch(e){if(e.code==='CONFLICT'){state=await readState();render();}throw e;}finally{busy=false;}
}
function openDialog(title,body){if(!preview&&!isUnlocked())return;openSheet(title,body);}
function empty(title,text,name='wallet'){return `<div class="empty">${icon(name)}<strong>${title}</strong><p>${text}</p></div>`;}
function scopeText(){return scope==='all'?'Ukupno':BUDGETS[scope];}
function navItem(id,label,name,cls=''){return `<button class="${screen===id?'active ':''}${cls}" data-action="nav" data-screen="${id}" ${screen===id?'aria-current="page"':''}>${icon(name)}<span>${label}</span></button>`;}
function render(){
 const previous=document.activeElement,hadFocus=root.contains(previous),focusId=previous?.id,focusData={...previous?.dataset};
 if(!state||(!preview&&!isUnlocked()))return;
 if(!state.setup){root.innerHTML=onboarding();enhanceForm(document.querySelector('#opening-form'));return;}
 const titles={dashboard:'Tvoj novac, na jednom mestu.',history:'Evidencija',plans:'Planovi i obaveze',settings:'Podešavanja'};
 const subtitles={dashboard:'PREGLED FINANSIJA',history:'EVIDENCIJA',plans:'BUDUĆE OBAVEZE',settings:'PODEŠAVANJA'};
 root.innerHTML=`${preview?'<div class="preview-banner">PREGLED SA IZMIŠLJENIM PODACIMA · Izmene u ovom pregledu se ne čuvaju.</div>':''}<aside class="sidebar">${brand()}<nav class="side-links" aria-label="Glavna navigacija">${navItem('dashboard','Pregled','grid')}${navItem('history','Evidencija','list')}${navItem('plans','Planovi','calendar')}${navItem('settings','Podešavanja','settings')}</nav><div class="side-foot">${icon('shield')}<p><strong>Samo na ovom uređaju</strong><br>Bez naloga. Bez cloud baze.</p><p>Verzija ${VERSION}</p></div></aside>
 <main class="workspace" id="main-content"><div class="mobile-brand">${brand()}<div class="mobile-security-actions">${preview?'':'<button class="icon-btn" data-action="sec-lock" aria-label="Zaključaj aplikaciju">'+icon('shield')+'</button>'}<button class="icon-btn" data-action="backup" aria-label="Rezervna kopija">${icon('cloud')}</button></div></div><header class="topbar"><div><p class="greeting eyebrow">${subtitles[screen]}</p><h1>${titles[screen]}</h1></div><div class="top-actions"><span class="chip"><i class="dot"></i>Lokalna evidencija</span><button class="btn primary" data-action="add">${icon('plus')}Novi unos</button></div></header>
 ${screen!=='settings'?`<div class="toolbar"><div class="segment" role="group" aria-label="Izbor budžeta">${[['all','Sve'],['personal','Lični'],['shared','Zajednički']].map(([id,label])=>`<button class="${scope===id?'active':''}" data-action="scope" data-scope="${id}" aria-pressed="${scope===id}">${label}</button>`).join('')}</div><select class="currency" id="currency" aria-label="Valuta">${CURRENCIES.map(c=>`<option ${c===currency?'selected':''}>${c}</option>`).join('')}</select></div>`:''}
 ${updateReady?`<div class="update-banner" role="status"><div><strong>Nova verzija je spremna</strong><span>Podaci ostaju na ovom uređaju.</span></div><button class="btn primary" data-action="activate-update">Ažuriraj</button></div>`:''}<div id="screen-content">${screen==='dashboard'?dashboard():screen==='history'?historyView():screen==='plans'?plansView():settingsView()}</div>
 <div class="status-line">${icon(offlineReady?'check':'info')}<span id="offline-status">${preview?'Pregled nije instalirana aplikacija.':offlineReady?'Aplikacija je spremna za rad bez interneta.':'Priprema za offline rad nije potvrđena.'}</span></div></main>
 <nav class="bottom-nav" aria-label="Mobilna navigacija">${navItem('dashboard','Pregled','grid')}${navItem('history','Evidencija','list')}<button class="add" data-action="add" aria-label="Novi unos">${icon('plus')}</button>${navItem('plans','Planovi','calendar')}${navItem('settings','Podešavanja','settings')}</nav>`;
 if(hadFocus&&!dialog.open){
  const isNavigation=['nav','history-shortcut','category-history'].includes(focusData.action);
  const selector=focusId?'#'+CSS.escape(focusId):focusData.action?Object.entries(focusData).map(([key,value])=>`[data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(value)}"]`).join(''):null;
  const target=isNavigation?root.querySelector('main h1'):selector?[...root.querySelectorAll(selector)].find(el=>el.getClientRects().length):null;
  if(target){if(isNavigation)target.tabIndex=-1;target.focus({preventScroll:true});}
 }
}
function openingFields(){return `<label>Datum početnog stanja<input name="openingDate" type="date" value="${state.openingDate}" max="${today()}" min="1900-01-01" required><span class="field-help">Stanje na početku ovog dana, pre transakcija tog dana.</span></label>${Object.entries(BUDGETS).map(([id,name])=>`<div class="budget-fields"><h3>${name} budžet</h3><div class="form-grid">${CURRENCIES.map(c=>`<label>${c}<input name="${id}_${c}" type="text" inputmode="decimal" value="${inputMoney(state.opening[id][c])}" required autocomplete="off"></label>`).join('')}</div></div>`).join('')}<p class="field-help">Raniji plaćeni unosi ulaze u istoriju i statistiku, ali se ne oduzimaju ponovo od početnog stanja. RSD i EUR se ne sabiraju i ne konvertuju.</p>`;}
function onboarding(){return `${preview?'<div class="preview-banner">Pregled bez čuvanja podataka.</div>':''}<main class="intro">${brand()}<p class="eyebrow">JEDAN UREĐAJ. DVA BUDŽETA.</p><h1>Počnimo od onoga<br>što sada imaš.</h1><p>Lični i zajednički novac vodiš odvojeno. Troškovi ostaju u ovom pregledaču ili instaliranoj aplikaciji.</p><form id="opening-form" class="card">${openingFields()}<div class="form-error" role="alert"></div><button class="btn primary full-mobile" type="submit">Sačuvaj početna stanja ${icon('arrow')}</button>${preview?'':'<button class="btn secondary" type="button" data-action="sec-settings">Face ID i zaštita</button>'}<p class="privacy-note">Na iPhone-u prvo dodaj aplikaciju na početni ekran, pa unesi stvarne podatke. Rezervnu kopiju čuvaš samostalno kroz Podešavanja.</p></form><button class="btn ghost" data-action="restore">Već imaš rezervnu kopiju? Vrati podatke</button></main>`;}
function transactionRow(t){
 const txIcon=t.kind==='income'?'down':t.kind==='transfer'?'transfer':t.category==='Računi'||t.category==='Stanovanje'?'home':['Auto','Prevoz'].includes(t.category)?'car':'bag';
 const amount=effect(t,scope),sign=t.kind==='transfer'&&scope==='all'?'↔ ':amount<0?'−':amount>0?'+':'';
 const late=t.status==='planned'&&t.date<today(),soon=t.status==='planned'&&t.date>=today()&&t.date<=addDays(today(),7);
 return `<article class="transaction"><button class="tx-main" data-action="edit" data-id="${esc(t.id)}" aria-label="Izmeni: ${esc(t.title)}, ${esc(money(t.amountMinor,t.currency))}"><span class="tx-icon ${t.kind}">${icon(txIcon)}</span><span class="tx-body"><span class="tx-title">${esc(t.title)}</span><span class="tx-meta"><span>${dateLabel(t.date,t.date.slice(0,4)!==today().slice(0,4))}</span><span aria-hidden="true">·</span><span class="badge ${t.budget==='shared'?'shared':''}">${BUDGETS[t.budget]}${t.kind==='transfer'?' → '+BUDGETS[t.toBudget]:''}</span>${t.repeatId?'<span title="Unos iz serije" aria-label="Ponavljanje">↻</span>':''}</span></span><span class="tx-amount ${amount>0?'positive':''}">${sign}${money(t.amountMinor,t.currency)}</span></button>${t.status==='planned'?`<div class="tx-actions"><span class="badge ${late?'late':soon?'soon':'planned'}">${late?'Kasni':soon?'Uskoro':'Planirano'}</span><button class="pay-btn" data-action="settle" data-id="${esc(t.id)}" aria-label="${t.kind==='income'?'Potvrdi prijem':'Potvrdi realizaciju'}: ${esc(t.title)}">${icon('check')}${t.kind==='income'?'Primljeno':t.kind==='transfer'?'Preneto':'Plaćeno'}</button></div>`:''}</article>`;
}
function dashboard(){
 const month=today().slice(0,7),stats=monthStats(state,scope,currency,month),f=forecast(state,scope,currency,horizon);
 const planned=state.transactions.filter(t=>t.status==='planned'&&t.currency===currency&&belongs(t,scope)).sort((a,b)=>a.date.localeCompare(b.date));
 const recent=state.transactions.filter(t=>t.status==='paid'&&t.currency===currency&&belongs(t,scope)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).slice(0,4);
 const monthName=new Intl.DateTimeFormat('sr-Latn-RS',{month:'long'}).format(new Date());
 const backupOld=!state.lastBackupPrepared||Date.now()-Date.parse(state.lastBackupPrepared)>7*86400000;
 const late=planned.filter(t=>t.date<today()).length;
 return `<div class="two-col"><section class="card hero"><div class="hero-label">${icon('wallet')}<span>${scopeText()} raspoloživo</span><span class="hero-currency">${currency}</span></div><div class="hero-amount">${money(f.current,currency)}</div><p class="hero-caption">Realizovani unosi · bez budućih obaveza</p><div class="hero-bottom">${Object.entries(BUDGETS).map(([id,label])=>`<button class="budget-tile ${scope===id?'selected':''}" data-action="scope" data-scope="${id}" aria-pressed="${scope===id}"><span class="label">${icon(id==='personal'?'person':'people')}${label}</span><strong>${money(balance(state,id,currency),currency)}</strong></button>`).join('')}</div></section>
 <section class="card projection"><div class="card-top"><h2>Posle planiranih obaveza</h2><span class="projection-icon">${icon('calendar')}</span></div><div class="tiny-segment" role="group" aria-label="Period prognoze">${[7,30,90].map(n=>`<button data-action="horizon" data-days="${n}" aria-pressed="${horizon===n}" class="${horizon===n?'active':''}">${n} dana</button>`).join('')}</div><div class="projection-amount ${f.projected<0?'negative':''}">${money(f.projected,currency)}</div><p class="explainer">Prognoza do ${dateLabel(f.end)}${late?` · ${late} ranijih neizmirenih planova`:''}</p><div class="projection-lines"><div class="line"><span>Planirani prilivi</span><strong class="positive">+${money(f.income,currency)}</strong></div><div class="line"><span>Planirani odlivi</span><strong>−${money(f.expense,currency)}</strong></div></div>${f.projected<0?'<p class="balance-warning">Planirani odlivi prelaze raspoloživi novac.</p>':''}</section></div>
 <div class="quick-actions" role="group" aria-label="Brzi unos"><button data-action="quick-entry" data-kind="expense">${icon('up')}<span>Trošak</span></button><button data-action="quick-entry" data-kind="income">${icon('down')}<span>Prihod</span></button><button data-action="add-plan">${icon('calendar')}<span>Planiraj</span></button><button data-action="quick-entry" data-kind="transfer">${icon('transfer')}<span>Prenos</span></button></div>
 <div class="section-caption"><h2>Ovaj mesec</h2><span>${monthName} · ${currency}</span></div><div class="month-strip">${[['income','Prihodi',stats.income,'down'],['expense','Troškovi',stats.expense,'up'],['all','Razlika',stats.net,'chart']].map(([kind,label,n,img])=>`<button class="metric" data-action="history-shortcut" data-kind="${kind}" aria-label="${label}, otvori evidenciju"><span class="metric-icon ${kind==='expense'?'red':''}">${icon(img)}</span><span><small>${label}</small><strong class="${kind==='income'?'positive':n<0?'negative':''}">${money(n,currency)}</strong></span></button>`).join('')}</div>
 ${backupOld?`<div class="notice backup-notice">${icon('shield')}<div><strong>Tvoja evidencija zaslužuje kopiju</strong><span>Sačuvaj je izvan aplikacije.</span></div><button class="btn" data-action="backup" aria-label="Napravi rezervnu kopiju">Sačuvaj ${icon('chevron')}</button></div>`:''}
 <div class="content-grid"><div class="stack"><section class="card"><div class="section-head"><div><h2>Sledeće na redu</h2><p class="section-sub">Plaćanje potvrđuješ ručno.</p></div><button class="btn ghost" data-action="nav" data-screen="plans">Sve ${icon('chevron')}</button></div><div class="transactions">${planned.length?planned.slice(0,4).map(transactionRow).join(''):empty('Nema planiranih obaveza','Dodaj račun ili trošak koji te očekuje.','calendar')+'<button class="btn secondary full-mobile" data-action="add-plan">Isplaniraj trošak</button>'}</div></section><section class="card"><div class="section-head"><h2>Poslednji unosi</h2><button class="btn ghost" data-action="nav" data-screen="history">Sve ${icon('chevron')}</button></div><div class="transactions">${recent.length?recent.map(transactionRow).join(''):empty('Prvi unos je početak','Zabeleži trošak ili prihod dugmetom +.','list')}</div></section></div><section class="card categories-card"><div class="section-head"><div><h2>Gde odlazi novac?</h2><p class="section-sub">${monthName} · dodirni kategoriju za detalje</p></div>${icon('chart')}</div>${stats.categories.length?stats.categories.map(([name,value])=>`<button class="category-row" data-action="category-history" data-category="${esc(name)}" aria-label="${esc(name)}, ${Math.round(value/stats.expense*100)}%, otvori unose"><span class="category-line"><span>${esc(name)} <small>${Math.round(value/stats.expense*100)}%</small></span><strong>${money(value,currency)}</strong></span><span class="progress" aria-hidden="true"><i style="width:${(value/stats.expense*100).toFixed(1)}%"></i></span></button>`).join(''):empty('Potrošnja po kategorijama','Prikaz će se popuniti nakon prvog troška.','chart')}</section></div>`;
}
function filteredHistory(){return state.transactions.filter(t=>t.status==='paid'&&t.currency===currency&&belongs(t,scope)&&t.date.startsWith(historyMonth)&&(historyKind==='all'||t.kind===historyKind)&&(!historyCategory||t.category===historyCategory)&&searchKey(`${t.title} ${t.category} ${t.note}`).includes(searchKey(search))).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));}
function historyRows(){
 const items=filteredHistory();let last='';
 const rows=items.slice(0,historyLimit).map(t=>{const head=t.date!==last?`<h3 class="date-group">${t.date===today()?'Danas':dateLabel(t.date,true)}</h3>`:'';last=t.date;return head+transactionRow(t);}).join('');
 return `<p class="result-count" role="status">${items.length} unosa${historyCategory?' · '+esc(historyCategory):''}</p>${items.length?rows:empty('Nema odgovarajućih unosa','Promeni mesec ili filter, ili dodaj novi unos.','list')}${items.length>historyLimit?`<button class="btn secondary" data-action="more-history">Prikaži još (${items.length-historyLimit})</button>`:''}`;
}
function historyView(){
 const stats=monthStats(state,scope,currency,historyMonth);
 return `<section class="card table-card"><div class="month-picker"><button class="icon-btn" data-action="history-prev" aria-label="Prethodni mesec"><span class="rotate">${icon('chevron')}</span></button><label class="sr-only" for="history-month">Mesec evidencije</label><input type="month" id="history-month" aria-label="Mesec evidencije" value="${historyMonth}" min="1900-01" max="2199-12"><button class="icon-btn" data-action="history-next" aria-label="Sledeći mesec">${icon('chevron')}</button></div><div class="filter-row"><label class="search-field"><span class="sr-only">Pretraga evidencije</span><input type="search" id="history-search" placeholder="Naziv, kategorija ili napomena…" value="${esc(search)}" autocomplete="off"></label><label><span class="sr-only">Vrsta unosa</span><select id="history-kind" aria-label="Vrsta unosa">${[['all','Sve vrste'],['expense','Troškovi'],['income','Prihodi'],['transfer','Prenosi']].map(([v,n])=>`<option value="${v}" ${historyKind===v?'selected':''}>${n}</option>`).join('')}</select></label></div>${historyCategory?`<button class="filter-chip" data-action="clear-category">${esc(historyCategory)} <span aria-hidden="true">×</span><span class="sr-only">Ukloni filter kategorije</span></button>`:''}<div class="history-totals"><span>Prihodi za ceo mesec<strong class="positive">${money(stats.income,currency)}</strong></span><span>Troškovi za ceo mesec<strong>${money(stats.expense,currency)}</strong></span></div><div class="transactions" id="history-list">${historyRows()}</div></section><p class="privacy-note">Prenos nije novi prihod ili trošak. Plaćeni unosi pre ${dateLabel(state.openingDate,true)} ne menjaju početno stanje.</p>`;
}
function calendarView(){
 const [y,m]=calendarMonth.split('-').map(Number),first=new Date(y,m-1,1),count=new Date(y,m,0).getDate(),offset=(first.getDay()+6)%7;
 const days=new Set(state.transactions.filter(t=>t.currency===currency&&belongs(t,scope)&&t.date.startsWith(calendarMonth)).map(t=>t.date));
 return `<div class="calendar-title"><button class="icon-btn" data-action="calendar-prev" aria-label="Prethodni mesec"><span style="transform:rotate(180deg)">${icon('chevron')}</span></button><strong>${new Intl.DateTimeFormat('sr-Latn-RS',{month:'long',year:'numeric'}).format(first)}</strong><button class="icon-btn" data-action="calendar-next" aria-label="Sledeći mesec">${icon('chevron')}</button></div><div class="calendar">${['P','U','S','Č','P','S','N'].map(x=>`<span class="calendar-label">${x}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{const d=`${calendarMonth}-${String(i+1).padStart(2,'0')}`;return `<button class="${d===today()?'today ':''}${d===selectedDay?'selected ':''}${days.has(d)?'has-data':''}" data-action="day" data-date="${d}" aria-pressed="${d===selectedDay}" ${d===today()?'aria-current="date"':''} aria-label="${dateLabel(d,true)}${days.has(d)?', ima unosa':''}">${i+1}</button>`;}).join('')}</div><p class="privacy-note">Tačka označava dan sa unosima. Izaberi datum za pregled plaćenih i planiranih stavki.</p>`;
}
function plansView(){
 const items=state.transactions.filter(t=>t.currency===currency&&belongs(t,scope)&&(selectedDay?t.date===selectedDay:t.status==='planned')&&(selectedDay||planFilter==='all'||(planFilter==='late'?t.date<today():t.date<=addDays(today(),Number(planFilter))))).sort((a,b)=>a.date.localeCompare(b.date)||a.status.localeCompare(b.status));
 return `<div class="plan-layout"><section class="card">${calendarView()}</section><section class="card"><div class="section-head"><h2>${selectedDay?dateLabel(selectedDay,true):'Planirane stavke'}</h2><button class="btn ghost" data-action="add-plan">${icon('plus')}Dodaj</button></div><div class="plan-filters">${[['all','Svi planovi'],['7','Do 7 dana'],['30','Do 30 dana'],['late','Kasne']].map(([v,n])=>`<button data-action="plan-filter" data-filter="${v}" aria-pressed="${!selectedDay&&planFilter===v}" class="${!selectedDay&&planFilter===v?'active':''}">${n}</button>`).join('')}${selectedDay?'<button data-action="clear-day">Poništi datum ×</button>':''}</div><div class="transactions" style="margin-top:20px">${items.length?items.slice(0,planLimit).map(transactionRow).join(''):empty('Nema stavki za ovaj izbor','Dodaj buduću obavezu ili izaberi drugi datum.','calendar')}${items.length>planLimit?`<button class="btn secondary" data-action="more-plans">Prikaži još (${items.length-planLimit})</button>`:''}</div></section></div>`;
}
function settingsView(){return `<div class="settings-grid"><section class="card"><div class="section-head"><h2>Izgled aplikacije</h2>${icon('grid')}</div><p>Izaberi temu koja ti odgovara. „Sistemski“ prati podešavanje telefona.</p><div class="theme-options" role="group" aria-label="Tema aplikacije">${[['system','Sistemski'],['light','Svetlo'],['dark','Tamno']].map(([id,label])=>`<button class="${theme===id?'active':''}" data-action="theme" data-theme="${id}" aria-pressed="${theme===id}">${label}</button>`).join('')}</div><p class="version-note">Verzija <strong>${VERSION}</strong> · bez promene tvoje baze.</p><button class="btn secondary" data-action="updates">Proveri novu verziju</button></section>${preview?'':securityPanel()}<section class="card"><h2>Početna stanja</h2><p>Stanje pre prvog unosa na dan <span class="settings-value">${dateLabel(state.openingDate,true)}</span>.</p>${Object.entries(BUDGETS).map(([b,n])=>`<p><strong>${n}</strong><br>${money(state.opening[b].RSD,'RSD')} · ${money(state.opening[b].EUR,'EUR')}</p>`).join('')}<button class="btn secondary" data-action="opening">Izmeni početna stanja</button><p>Promena početnog stanja preračunava raspoloživi novac. Za svakodnevne promene koristi novi prihod ili trošak.</p></section>
 <section class="card"><h2>Rezervna kopija</h2><p>Izvezi sve budžete i unose u jedan fajl, uz opcionu lozinku. Na iPhone-u izaberi Files → On My iPhone za lokalnu kopiju.</p><button class="btn primary" data-action="backup">${icon('cloud')}Napravi kopiju</button><button class="btn secondary" data-action="restore">Vrati kopiju</button><p>Poslednja priprema fajla: <span class="settings-value">${state.lastBackupPrepared?new Date(state.lastBackupPrepared).toLocaleString('sr-Latn-RS'):'Još nije pripremljena'}</span></p><p>Priprema ne potvrđuje da si sačuvao fajl. Kopiju čuvaj izvan aplikacije; ona se ne pravi automatski.</p><button class="btn ghost" data-action="recovery">Vrati stanje pre poslednjeg uvoza</button></section>
 <section class="card"><h2>Lokalno čuvanje</h2><p>Unosi se čuvaju u IndexedDB bazi ove aplikacije. Nema prijavljivanja, analitike, bankarskih integracija niti slanja unosa serveru.</p><p>Status trajnog skladištenja: <span class="settings-value" id="persistence-state">${persisted?'Odobreno':'Nije potvrđeno'}</span></p><button class="btn secondary" data-action="persist">Zatraži trajno čuvanje</button><p>Sistem ipak može izgubiti podatke pri brisanju aplikacije/podataka, kvaru ili gubitku uređaja. Kopija na istom telefonu ne štiti od gubitka telefona; povremeno sačuvaj kopiju i na svom računaru.</p><p>Verzija ${VERSION} · ${state.transactions.length} unosa. Lokalna baza je šifrovana. Face ID podešavaš u kartici zaštite; dok ga ne uključiš, koristi se rezervna lozinka.</p></section>
 <section class="card"><h2>Dodavanje na iPhone</h2><p>Otvori HTTPS adresu u Safariju → Share → Add to Home Screen. Ostavi uključeno Open as Web App ako se pojavi.</p><p>Pokreni preko ikonice dok ima interneta i sačekaj potvrdu na dnu da je spremna za offline rad. Tek tada unosi stvarne podatke.</p><p>Ovaj ZIP ili lokalni HTML fajl ne predstavljaju instalaciju na iPhone. Fajlovi aplikacije moraju imati stabilnu HTTPS adresu za instaliranje, ponovno preuzimanje i nadogradnje. Finansijski unosi ostaju lokalno.</p><p>Ova verzija nema sistemske podsetnike kada je zatvorena. Predstojeće obaveze prikazuje unutar aplikacije.</p></section></div>`;}
function openEntry(id=null,{planned=false,settle=false,kind='expense'}={}){
 const existing=id?state.transactions.find(t=>t.id===id):null;if(id&&!existing){toast('Unos više ne postoji.');return;}
 const budget=scope==='shared'?'shared':'personal';
 const t=existing?structuredClone(existing):{kind,budget,toBudget:budget==='personal'?'shared':'personal',currency,amountMinor:0,title:kind==='transfer'?'Prenos između budžeta':'',category:kind==='income'?'Plata':'Ostalo',date:planned?((screen==='plans'&&selectedDay)||addDays(today(),1)):today(),status:planned?'planned':'paid',note:''};
 if(settle){t.status='paid';t.date=today();}
 openDialog(settle?(t.kind==='income'?'Potvrdi prijem':t.kind==='transfer'?'Potvrdi prenos':'Potvrdi plaćanje'):existing?'Izmeni unos':planned?'Planiraj novi unos':'Novi unos',`<form id="entry-form" novalidate data-id="${esc(id||'')}"><input type="hidden" name="kind" value="${t.kind}"><div class="kind-switch" role="group" aria-label="Vrsta unosa">${[['expense','Trošak','up'],['income','Prihod','down'],['transfer','Prenos','transfer']].map(([k,n,img])=>`<button type="button" data-action="kind" data-kind="${k}" aria-pressed="${k===t.kind}" class="${k===t.kind?'active':''}">${icon(img)}${n}</button>`).join('')}</div>${settle?'<div class="notice info">Potvrdi stvarni iznos i datum. Ovim menjaš plan, bez dupliranja unosa.</div>':''}<div class="amount-entry"><label>Iznos<input name="amount" inputmode="decimal" type="text" value="${t.amountMinor?inputMoney(t.amountMinor):''}" placeholder="0,00" required autocomplete="off" enterkeyhint="next"></label><label>Valuta<select name="currency">${CURRENCIES.map(c=>`<option ${t.currency===c?'selected':''}>${c}</option>`).join('')}</select></label></div><div class="form-grid"><label class="full">Naziv<input name="title" maxlength="80" value="${esc(t.title)}" placeholder="Npr. namirnice, struja, plata…" required autocomplete="off" enterkeyhint="next"></label><label><span id="budget-label">${t.kind==='transfer'?'Iz budžeta':'Budžet'}</span><select name="budget">${Object.entries(BUDGETS).map(([id,n])=>`<option value="${id}" ${t.budget===id?'selected':''}>${n}</option>`).join('')}</select></label><label id="category-field" class="${t.kind==='transfer'?'hide':''}">Kategorija<select name="category">${CATEGORIES.map(c=>`<option ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label id="to-budget-field" class="${t.kind==='transfer'?'':'hide'}">U budžet<select name="toBudget">${Object.entries(BUDGETS).map(([id,n])=>`<option value="${id}" ${id===t.toBudget?'selected':''}>${n}</option>`).join('')}</select></label><label>Datum<input name="date" type="date" value="${t.date}" min="1900-01-01" max="2199-12-31" required></label><label>Status<select name="status"><option value="paid" ${t.status==='paid'?'selected':''}>Realizovano</option><option value="planned" ${t.status==='planned'?'selected':''}>Planirano</option></select></label></div><div class="date-shortcuts" role="group" aria-label="Brzi izbor datuma">${[[0,'Danas'],[1,'Sutra'],[7,'Za 7 dana']].map(([n,label])=>`<button type="button" data-action="entry-date" data-offset="${n}">${label}</button>`).join('')}</div><output id="entry-impact" class="entry-impact" aria-live="polite"></output><details class="entry-details" ${t.note?'open':''}><summary>Napomena${!existing?' i ponavljanje':''}<span aria-hidden="true">+</span></summary><div class="form-grid">${!existing?`<label>Ponavljanje<select name="frequency"><option value="none">Bez ponavljanja</option><option value="weekly">Nedeljno</option><option value="monthly">Mesečno</option><option value="yearly">Godišnje</option></select></label><label id="repeat-count-field" class="hide">Broj pojavljivanja<input name="repeatCount" type="number" inputmode="numeric" min="2" max="120" value="12" disabled><span class="field-help">Prvi unos + budući planovi.</span></label>`:''}<label class="full">Napomena <span class="muted">(opciono)</span><textarea name="note" maxlength="500" rows="3" placeholder="Dodatni detalji…">${esc(t.note)}</textarea></label></div></details>${existing?.repeatId?'<p class="field-help">Menjaš samo ovo pojavljivanje, ne celu seriju.</p>':''}<div class="form-error" role="alert"></div><div class="form-actions">${existing?'<button class="btn danger" type="button" data-action="delete-entry" data-id="'+esc(id)+'">Obriši</button>':'<button class="btn secondary" type="button" data-action="close">Odustani</button>'}<button class="btn primary" type="submit">${settle?'Potvrdi':'Sačuvaj unos'} ${icon('check')}</button></div></form>`);
 updateEntryImpact();
}
function updateEntryImpact(){
 const form=document.querySelector('#entry-form'),out=document.querySelector('#entry-impact');if(!form||!out||!state)return;
 const v=Object.fromEntries(new FormData(form));
 if(!v.amount?.trim()){out.innerHTML='<span>Unesi iznos da vidiš uticaj na budžet.</span>';return;}
 try{
  // A title is not required for a live amount preview.
  const base=entryValues({...v,title:v.title||'Pregled'}),old=state.transactions.find(t=>t.id===form.dataset.id);
  if(base.status==='planned'){out.innerHTML='<strong>Planirano, ne potrošeno</strong><span>Trenutno stanje se ne menja dok ne potvrdiš realizaciju.</span>';return;}
  const result=previewImpact(state,base,old);
  out.innerHTML=`<strong>Stanje nakon čuvanja</strong><span>${BUDGETS[base.budget]}: <b class="${result[base.budget]<0?'negative':''}">${money(result[base.budget],base.currency)}</b>${base.kind==='transfer'?` · ${BUDGETS[base.toBudget]}: <b>${money(result[base.toBudget],base.currency)}</b>`:''}</span>${base.date<state.openingDate?'<span>Unos je pre početnog stanja i menja samo istoriju.</span>':''}`;
 }catch{out.innerHTML='<span>Proveri iznos i datum za pregled stanja.</span>';}
}
function openOpening(){openDialog('Početna stanja',`<form id="opening-form"><div class="notice info">Ovo nije novi prihod. Menjaš polaznu osnovu za računanje oba budžeta.</div>${openingFields()}<div class="form-error" role="alert"></div><div class="form-actions"><button class="btn secondary" type="button" data-action="close">Odustani</button><button class="btn primary" type="submit">Sačuvaj stanja</button></div></form>`);}
async function submitOpening(form){
 const values=new FormData(form),date=String(values.get('openingDate'));
 if(!validDate(date)||date>today())throw new Error('Datum početnog stanja mora biti danas ili ranije.');
 const amounts={};for(const b of Object.keys(BUDGETS)){amounts[b]={};for(const c of CURRENCIES)try{amounts[b][c]=parseMoney(values.get(`${b}_${c}`),true);}catch(e){e.field=`${b}_${c}`;throw e;}}
 await mutate(s=>{s.openingDate=date;s.opening=amounts;s.setup=true;});if(dialog.open)closeSheet(true);toast('Početna stanja su sačuvana.');requestPersistence(false);
}
async function submitEntry(form){
 const v=Object.fromEntries(new FormData(form)),id=form.dataset.id,old=id?state.transactions.find(t=>t.id===id):null;
 if(id&&!old)throw new Error('Unos više ne postoji. Zatvori obrazac i pokušaj ponovo.');
 const base=entryValues(v),frequency=v.frequency||'none',count=frequency==='none'?1:Number(v.repeatCount);
 const entries=buildEntries(base,frequency,count,old);
 await mutate(s=>{if(old)s.transactions=s.transactions.map(t=>t.id===id?entries[0]:t);else s.transactions.push(...entries);});closeSheet(true);toast(entries.length>1?`Sačuvano ${entries.length} pojavljivanja.`:base.status==='planned'?'Plan je sačuvan. Stanje nije umanjeno.':'Unos je sačuvan.');
}
function confirmDelete(id){const t=state.transactions.find(t=>t.id===id);if(!t)return;const remaining=t.repeatId?state.transactions.filter(x=>x.repeatId===t.repeatId&&x.status==='planned'&&x.id!==t.id).length:0;
 openDialog('Obriši unos?',`<form id="delete-form" data-id="${esc(id)}"><p><strong>${esc(t.title)}</strong> · ${money(t.amountMinor,t.currency)} · ${dateLabel(t.date,true)}</p><p>Brisanje realizovanog unosa preračunava stanje. Posle brisanja imaćeš 12 sekundi da poništiš radnju.</p>${remaining?`<label class="check-label"><input type="checkbox" name="series">Obriši i preostalih ${remaining} planiranih pojavljivanja iste serije. Drugi realizovani unosi ostaju.</label>`:''}<div class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close">Odustani</button><button type="submit" class="btn danger">Obriši unos</button></div></form>`);
}
function openBackup(){openDialog('Rezervna kopija',`<form id="backup-form"><p>Kopija sadrži oba budžeta, sva početna stanja i sve unose. Čuvaj je izvan aplikacije.</p><label class="check-label"><input type="checkbox" name="encrypted" id="backup-encrypted" checked>Zaštiti kopiju lozinkom</label><div id="backup-passwords" class="form-grid"><label class="full">Lozinka za kopiju<input name="password" type="password" minlength="10" autocomplete="new-password" placeholder="Najmanje 10 znakova" required></label><label class="full">Ponovi lozinku<input name="passwordAgain" type="password" minlength="10" autocomplete="new-password" required></label></div><p id="backup-warning" class="privacy-note">Lozinka se ne čuva. Bez nje ne možeš otvoriti šifrovanu kopiju. Ovo ne zaključava samu aplikaciju.</p><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn secondary" type="button" data-action="close">Odustani</button><button class="btn primary" type="submit">Pripremi fajl</button></div></form>`);}
async function prepareBackup(form){
 const v=new FormData(form),encrypted=v.get('encrypted')==='on',password=encrypted?String(v.get('password')):'';
 if(encrypted&&password!==String(v.get('passwordAgain'))){const e=new Error('Lozinke se ne poklapaju.');e.field='passwordAgain';throw e;}
 const snapshot=structuredClone(state);snapshot.lastBackupPrepared=new Date().toISOString();
 const content=await encodeBackup(snapshot,password);
 const blob=new Blob([content],{type:'application/json'}),name=`moj-budzet-${today()}-${encrypted?'sifrovano':'kopija'}.json`;
 const file=new File([blob],name,{type:'application/json'});const url=URL.createObjectURL(blob);
 await mutate(s=>{s.lastBackupPrepared=snapshot.lastBackupPrepared;});
 openDialog('Sačuvaj rezervnu kopiju',`<div class="file-ready"><strong>Fajl je pripremljen.</strong><p>${esc(name)}</p><a class="btn primary" id="download-backup" href="${url}" download="${esc(name)}">Preuzmi fajl</a><button class="btn secondary" id="share-backup" ${navigator.canShare?.({files:[file]})?'':'hidden'}>Podeli / sačuvaj u Files</button></div><p class="privacy-note">Na iPhone-u izaberi „Save to Files” → „On My iPhone”. Proveri da fajl stvarno postoji pre zatvaranja. Nije napravljen automatski cloud backup.</p>${!encrypted?'<div class="notice error">Ova kopija nije šifrovana. Svako ko dobije fajl može da pročita finansijske podatke.</div>':''}<div class="form-error" role="alert"></div>`);
 document.querySelector('#share-backup').addEventListener('click',async()=>{try{await navigator.share({files:[file],title:'Moj budžet — rezervna kopija'});}catch(e){if(e.name!=='AbortError')err(dialog.querySelector('.dialog-body'),'Deljenje nije uspelo. Pokušaj dugmetom Preuzmi fajl.');}});
 dialog.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});
}
function openRestore(){openDialog('Vrati rezervnu kopiju',`<form id="restore-form"><p>Uvoz zamenjuje celu trenutnu evidenciju. Pre toga izvezi postojeće podatke. Aplikacija zadržava i jedno lokalno stanje pre uvoza.</p><label>Fajl kopije<input name="backupFile" type="file" accept=".json,application/json" required></label><label style="margin-top:17px">Lozinka <span class="muted">(samo za šifrovanu kopiju)</span><input name="password" type="password" autocomplete="current-password"></label><label class="check-label"><input type="checkbox" name="confirmReplace" required>Razumem da se oba budžeta i svi postojeći unosi zamenjuju sadržajem kopije.</label><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn secondary" type="button" data-action="close">Odustani</button><button class="btn primary" type="submit">Proveri i vrati</button></div></form>`);}
async function submitRestore(form){
 const v=new FormData(form),file=v.get('backupFile');if(!(file instanceof File)||!file.size)throw new Error('Izaberi fajl kopije.');if(file.size>20*1024*1024)throw new Error('Fajl može imati najviše 20 MB.');
 if(v.get('confirmReplace')!=='on')throw new Error('Potvrdi zamenu postojećih podataka.');
 const imported=await decodeBackup(await file.text(),String(v.get('password')||''));
 if(!window.confirm(`Vrati kopiju sa ${imported.transactions.length} unosa? Ovo zamenjuje oba budžeta.`))return;
 await mutate(s=>Object.assign(s,imported),{recovery:true});closeSheet(true);toast('Kopija je vraćena.');
}
async function requestPersistence(notify=true){
 if(preview){if(notify)toast('Ovo je samo pregled.');return;}
 try{persisted=Boolean(await navigator.storage?.persist?.());document.querySelector('#persistence-state')?.replaceChildren(document.createTextNode(persisted?'Odobreno':'Nije odobreno'));if(notify)toast(persisted?'Trajno čuvanje je odobreno. Kopija je i dalje potrebna.':'Trajno čuvanje nije odobreno. Čuvaj redovne kopije.');}catch{if(notify)toast('Sistem ne dozvoljava proveru trajnog čuvanja.');}
}
function changeCalendar(step){const[y,m]=calendarMonth.split('-').map(Number),d=new Date(y,m-1+step,1);if(d.getFullYear()<1900||d.getFullYear()>2199)return;calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;selectedDay=null;render();}
async function handleAction(button){
 const a=button.dataset.action;
 if(!preview&&!isUnlocked()&&a!=='close')return;
 if(a==='close'){if(!busy)closeSheet();return;}

 if(a==='dismiss-toast'){document.querySelector('#toast').classList.remove('visible');undoDeleted=null;return;}
 if(a==='theme'){theme=button.dataset.theme;document.documentElement.dataset.theme=theme;try{localStorage.setItem('moj-budzet-theme',theme);}catch{}render();return;}
 if(a==='quick-entry'){openEntry(null,{kind:button.dataset.kind});return;}
 if(a==='history-shortcut'||a==='category-history'){
  historyMonth=today().slice(0,7);historyKind=a==='category-history'?'expense':button.dataset.kind;historyCategory=a==='category-history'?button.dataset.category:'';search='';historyLimit=50;screen='history';render();window.scrollTo({top:0});return;
 }
 if(a==='clear-category'){historyCategory='';render();return;}
 if(a==='history-prev'||a==='history-next'){historyMonth=shiftMonth(historyMonth,a==='history-prev'?-1:1);historyLimit=50;render();return;}
 if(a==='entry-date'){
  const f=document.querySelector('#entry-form');f.elements.date.value=addDays(today(),Number(button.dataset.offset));
  if(f.elements.date.value>today())f.elements.status.value='planned';markSheetDirty();updateEntryImpact();return;
 }
 if(a==='undo-delete'){
  if(!undoDeleted)return;const rows=undoDeleted;await mutate(s=>{if(rows.some(r=>s.transactions.some(t=>t.id===r.id)))throw new Error('Neki unosi već postoje. Osveži evidenciju.');s.transactions.push(...rows);});undoDeleted=null;toast('Brisanje je poništeno.');return;
 }
 if(a==='nav'){screen=button.dataset.screen;render();window.scrollTo({top:0});return;}
 if(a==='scope'){scope=button.dataset.scope;historyLimit=planLimit=50;render();return;}
 if(a==='horizon'){horizon=Number(button.dataset.days);render();return;}
 if(a==='add'||a==='add-plan'){openEntry(null,{planned:a==='add-plan'});return;}
 if(a==='edit'||a==='settle'){openEntry(button.dataset.id,{settle:a==='settle'});return;}
 if(a==='opening'){openOpening();return;}
 if(a==='kind'){
  const f=document.querySelector('#entry-form');f.elements.kind.value=button.dataset.kind;
  f.querySelectorAll('[data-action=kind]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});markSheetDirty();
  const transfer=button.dataset.kind==='transfer';document.querySelector('#category-field').classList.toggle('hide',transfer);document.querySelector('#to-budget-field').classList.toggle('hide',!transfer);document.querySelector('#budget-label').textContent=transfer?'Iz budžeta':'Budžet';
  f.elements.toBudget.value=f.elements.budget.value==='personal'?'shared':'personal';
  if(!f.elements.title.value&&transfer)f.elements.title.value='Prenos između budžeta';if(button.dataset.kind==='income'&&f.elements.category.value==='Ostalo')f.elements.category.value='Plata';updateEntryImpact();return;
 }
 if(a==='delete-entry'){confirmDelete(button.dataset.id);return;}
 if(a==='backup'){openBackup();return;}
 if(a==='restore'){openRestore();return;}
 if(a==='persist'){await requestPersistence();return;}
 if(a==='recovery'){
  if(preview){toast('Povrat prethodnog stanja nije dostupan u pregledu.');return;}
  const old=await readRecovery();if(!old){toast('Nema sačuvanog stanja pre uvoza.');return;}
  if(!window.confirm(`Vrati prethodno stanje sa ${old.transactions.length} unosa? Trenutno stanje biće sačuvano kao prethodno.`))return;
  await mutate(s=>Object.assign(s,old),{recovery:true});toast('Prethodno stanje je vraćeno.');return;
 }
 if(a==='more-history'){historyLimit+=50;document.querySelector('#history-list').innerHTML=historyRows();return;}
 if(a==='more-plans'){planLimit+=50;render();return;}
 if(a==='day'){selectedDay=selectedDay===button.dataset.date?null:button.dataset.date;planLimit=50;render();return;}
 if(a==='clear-day'){selectedDay=null;render();return;}
 if(a==='calendar-prev'||a==='calendar-next'){changeCalendar(a==='calendar-prev'?-1:1);return;}
 if(a==='plan-filter'){planFilter=button.dataset.filter;selectedDay=null;planLimit=50;render();return;}
 if(a==='activate-update'){
  if(busy){toast('Sačekaj da se unos sačuva.');return;}
  openDialog('Ažuriraj aplikaciju',`<p>Prelazimo na novu verziju na istoj adresi. Lokalna baza i Face ID ostaju. Nakon ponovnog otvaranja otključaj aplikaciju.</p><p>Za svaki slučaj redovno čuvaj rezervnu kopiju. Aplikaciju ne treba brisati niti ponovo instalirati.</p><div class="form-actions"><button class="btn secondary" data-action="close">Kasnije</button><button class="btn primary" data-action="install-update">Ažuriraj sada</button></div>`);return;
 }
 if(a==='install-update'){
  if(busy)return;
  if(swRegistration?.waiting){reloadForUpdate=true;setSheetBusy(true);swRegistration.waiting.postMessage({type:'ACTIVATE'});}
  else window.location.reload();return;
 }
 if(a==='updates'){
  if(!swRegistration){toast('Provera je dostupna u instaliranoj HTTPS aplikaciji.');return;}
  if(!navigator.onLine){toast('Za proveru nove verzije potreban je internet.');return;}
  if(swRegistration.waiting){updateReady=true;render();toast('Nova verzija je spremna. Izaberi Ažuriraj.');return;}
  toast('Proveravam dostupnu verziju…');await swRegistration.update();
  if(swRegistration.waiting){updateReady=true;render();toast('Nova verzija je spremna.');}
  else if(!swRegistration.installing)toast(`Koristiš verziju ${VERSION}. Trenutno nema nove verzije.`);
 }

}
document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button)handleAction(button).catch(error=>toast(error.message||'Radnja nije uspela.'));});
document.addEventListener('input',e=>{if(e.target.form?.id==='entry-form'){clearTimeout(updateEntryImpact.timer);updateEntryImpact.timer=setTimeout(updateEntryImpact,180);}clearFieldError(e.target);if(e.target.id==='history-search'){search=e.target.value;historyLimit=50;document.querySelector('#history-list').innerHTML=historyRows();}});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.id==='currency'){currency=t.value;render();}
 if(t.id==='history-month'){if(/^\d{4}-\d{2}$/.test(t.value)){historyMonth=t.value;historyLimit=50;render();}}
 if(t.id==='history-kind'){historyKind=t.value;historyLimit=50;render();}
 if(t.name==='frequency'){document.querySelector('#repeat-count-field').classList.toggle('hide',t.value==='none');t.form.elements.repeatCount.disabled=t.value==='none';t.form.elements.repeatCount.required=t.value!=='none';}
 if(t.id==='backup-encrypted'){
  document.querySelector('#backup-passwords').classList.toggle('hide',!t.checked);
  document.querySelectorAll('#backup-passwords input').forEach(x=>{x.required=t.checked;x.disabled=!t.checked;});
  document.querySelector('#backup-warning').textContent=t.checked?'Lozinka se ne čuva. Bez nje ne možeš otvoriti šifrovanu kopiju. Ovo ne zaključava samu aplikaciju.':'Nešifrovanu kopiju može pročitati svako ko dobije fajl.';
 }
 if(t.form?.id==='entry-form'){
  if(t.name==='date'&&t.value>today())t.form.elements.status.value='planned';
  if(t.name==='budget')t.form.elements.toBudget.value=t.value==='personal'?'shared':'personal';updateEntryImpact();
 }
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['opening-form','entry-form','delete-form','backup-form','restore-form'].includes(form.id))return;e.preventDefault();
 if(busy||(!preview&&!isUnlocked()))return;if(!validateForm(form))return;const submit=form.querySelector('[type=submit]')||dialog.querySelector(`[form="${form.id}"][type=submit]`);if(submit)submit.disabled=true;setSheetBusy(true);
 const error=form.querySelector('.form-error');if(error)error.textContent='';
 try{
  if(form.id==='opening-form')await submitOpening(form);
  if(form.id==='entry-form')await submitEntry(form);
  if(form.id==='backup-form')await prepareBackup(form);
  if(form.id==='restore-form')await submitRestore(form);
  if(form.id==='delete-form'){
   const id=form.dataset.id,t=state.transactions.find(x=>x.id===id);if(!t)throw new Error('Unos više ne postoji.');const series=new FormData(form).get('series')==='on';
   const removed=state.transactions.filter(x=>x.id===id||(series&&t.repeatId&&x.repeatId===t.repeatId&&x.status==='planned'));await mutate(s=>{s.transactions=s.transactions.filter(x=>!removed.some(r=>r.id===x.id));});undoDeleted=removed;closeSheet(true);toast(removed.length>1?`${removed.length} unosa je obrisano.`:'Unos je obrisan.',{undo:true});
  }
 }catch(error){if(preview||isUnlocked())err(form,error);}finally{if(submit)submit.disabled=false;setSheetBusy(false);}
});

async function initOffline(){
 if(preview||!('serviceWorker'in navigator)||!['https:','http:'].includes(location.protocol)||!window.isSecureContext)return;
 try{
  let previousController=navigator.serviceWorker.controller;
  swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
  const ready=()=>{if(swRegistration.waiting&&navigator.serviceWorker.controller){updateReady=true;if(!dialog.open)render();}};
  ready();swRegistration.addEventListener('updatefound',()=>{const worker=swRegistration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')ready();});});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!navigator.serviceWorker.controller)return;if(reloadForUpdate){window.location.reload();return;}if(previousController){updateReady=true;if(!dialog.open)render();}previousController=navigator.serviceWorker.controller;offlineReady=true;const el=document.querySelector('#offline-status');if(el)el.textContent='Aplikacija je spremna za rad bez interneta.';});
  await navigator.serviceWorker.ready;offlineReady=true;
  persisted=Boolean(await navigator.storage?.persisted?.());
  const el=document.querySelector('#offline-status');if(el)el.textContent='Aplikacija je spremna za rad bez interneta.';
 }catch{const el=document.querySelector('#offline-status');if(el)el.textContent='Offline priprema nije uspela. Proveri vezu pre korišćenja bez interneta.';}
}
document.addEventListener('visibilitychange',async()=>{if(document.hidden||preview||busy||dialog.open||!isUnlocked()||!state)return;try{const current=await readState();if(current.revision!==state.revision){state=current;render();}}catch{toast('Provera lokalnih podataka nije uspela.');}});
async function start(){
 try{
  initOffline();
  if(preview){state=validateState(window.PREVIEW_STATE||blankState());render();return;}
  await initializeSecurity({
   beforeLock(){state=null;undoDeleted=null;search='';historyCategory='';selectedDay=null;screen='dashboard';clearTimeout(updateEntryImpact.timer);},
   async afterUnlock(data){state=data;render();},
   changed(){render();}
  });
 }catch(error){root.innerHTML=`<main class="intro">${brand()}<div class="notice error"><div><strong>Lokalna evidencija nije otvorena.</strong>${esc(error.message)}<p>Ne briši podatke pregledača. Probaj normalan Safari/Chrome prozor, ne privatni režim, i proveri slobodan prostor. Postojeća baza nije prepisana.</p></div></div></main>`;}
}
start();
