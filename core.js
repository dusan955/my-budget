/** Pure budget logic. All money is stored in integer minor units, never floats. */
export const VERSION = '0.3.0';
export const BUDGETS = {personal: 'Lični', shared: 'Zajednički'};
export const CURRENCIES = ['RSD', 'EUR'];
export const CATEGORIES = ['Namirnice', 'Računi', 'Stanovanje', 'Prevoz', 'Auto', 'Hrana i piće', 'Kupovina', 'Zdravlje', 'Zabava', 'Putovanja', 'Pretplate', 'Plata', 'Dodatni prihod', 'Ostalo'];
export const MAX_AMOUNT = 100_000_000_000;
export const MAX_RECORDS = 30_000;
export function today() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function uid() { if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID(); const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=Array.from(a,n=>n.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
export function validDate(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||s>'2199-12-31') return false;
  const d=new Date(s+'T12:00:00Z'); return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
}
export function addDays(date, n) { const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
export function repeatDate(anchor, frequency, n) {
  if(frequency==='weekly') return addDays(anchor,n*7);
  if(!['monthly','yearly'].includes(frequency)) return anchor;
  const [y,m,day]=anchor.split('-').map(Number); const shift=frequency==='yearly'?12*n:n;
  const d=new Date(Date.UTC(y,m-1+shift,1,12));
  const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();
  d.setUTCDate(Math.min(day,max)); return d.toISOString().slice(0,10);
}
export function parseMoney(input, allowNegative=false) {
  let s=String(input).trim().replace(/[\s\u00a0]/g,''); let sign=1;
  if(s.startsWith('-')&&allowNegative){sign=-1;s=s.slice(1);}
  if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s=s.replace(/\./g,'');
  if(!/^\d+(?:[,.]\d{1,2})?$/.test(s)) throw new Error('Unesi ispravan iznos, npr. 1250 ili 1.250,50.');
  const [whole,decimal='']=s.replace(',','.').split('.');
  const n=sign*(Number(whole)*100+Number(decimal.padEnd(2,'0')));
  if(!Number.isSafeInteger(n)||Math.abs(n)>MAX_AMOUNT) throw new Error('Iznos je prevelik. Najviše 1.000.000.000 po unosu.');
  return n;
}
export function money(n,currency='RSD') { return new Intl.NumberFormat('sr-Latn-RS',{style:'currency',currency,minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100); }
export function inputMoney(n) { return (n/100).toFixed(2).replace('.',','); }
export function dateLabel(s,year=false) { if(!validDate(s)) return '—'; return new Intl.DateTimeFormat('sr-Latn-RS',{day:'numeric',month:'short',...(year?{year:'numeric'}:{})}).format(new Date(s+'T12:00:00')); }
export function blankState(date=today()) {
 return {schemaVersion:1,revision:0,setup:false,openingDate:date,opening:{personal:{RSD:0,EUR:0},shared:{RSD:0,EUR:0}},transactions:[],lastBackupPrepared:null};
}
export function validateState(raw) {
 const fail=()=>{throw new Error('Fajl nije ispravna rezervna kopija ove verzije aplikacije.');};
 if(!raw||raw.schemaVersion!==1||typeof raw.setup!=='boolean'||(!validDate(raw.openingDate)||raw.openingDate>today())||!Array.isArray(raw.transactions)||raw.transactions.length>MAX_RECORDS) fail();
 const result=blankState(raw.openingDate); result.setup=raw.setup;
 result.revision=Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0;
 for(const b of Object.keys(BUDGETS)) for(const c of CURRENCIES) {const n=raw.opening?.[b]?.[c];if(!Number.isSafeInteger(n)||Math.abs(n)>MAX_AMOUNT)fail();result.opening[b][c]=n;}
 if(raw.lastBackupPrepared!=null) { if(typeof raw.lastBackupPrepared!=='string'||!Number.isFinite(Date.parse(raw.lastBackupPrepared)))fail(); result.lastBackupPrepared=raw.lastBackupPrepared; }
 const ids=new Set();
 result.transactions=raw.transactions.map(t=>{
   if(!t||typeof t.id!=='string'||t.id.length>100||!t.id||ids.has(t.id))fail(); ids.add(t.id);
   if(!Object.hasOwn(BUDGETS,t.budget)||!CURRENCIES.includes(t.currency)||!['income','expense','transfer'].includes(t.kind)||!['paid','planned'].includes(t.status)||(!validDate(t.date)||(t.status==='paid'&&t.date>today())))fail();
   if(!Number.isSafeInteger(t.amountMinor)||t.amountMinor<=0||t.amountMinor>MAX_AMOUNT)fail();
   if(typeof t.title!=='string'||!t.title.trim()||t.title.length>80||typeof t.note!=='string'||t.note.length>500||!CATEGORIES.includes(t.category))fail();
   if(t.kind==='transfer'&&(!Object.hasOwn(BUDGETS,t.toBudget)||t.toBudget===t.budget))fail();
   if(t.repeatId!=null&&(typeof t.repeatId!=='string'||t.repeatId.length>100))fail();
   if(typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt)))fail();
   return {id:t.id,budget:t.budget,toBudget:t.kind==='transfer'?t.toBudget:null,currency:t.currency,kind:t.kind,status:t.status,date:t.date,amountMinor:t.amountMinor,title:t.title.trim(),category:t.category,note:t.note,repeatId:t.repeatId??null,createdAt:t.createdAt};
 });
 return result;
}
export function effect(t,budget) {
 if(budget==='all') return effect(t,'personal')+effect(t,'shared');
 if(t.kind==='transfer') return (t.toBudget===budget?t.amountMinor:0)-(t.budget===budget?t.amountMinor:0);
 return t.budget===budget?(t.kind==='income'?t.amountMinor:-t.amountMinor):0;
}
export function belongs(t,budget) {return budget==='all'||t.budget===budget||(t.kind==='transfer'&&t.toBudget===budget);}
export function balance(state,budget,currency,asOf=today()) {
 let n=budget==='all'?state.opening.personal[currency]+state.opening.shared[currency]:state.opening[budget][currency];
 for(const t of state.transactions) if(t.currency===currency&&t.status==='paid'&&t.date>=state.openingDate&&t.date<=asOf)n+=effect(t,budget);
 return n;
}
export function forecast(state,budget,currency,days=30,asOf=today()) {
 const end=addDays(asOf,days); let income=0,expense=0;
 for(const t of state.transactions)if(t.currency===currency&&t.status==='planned'&&t.date<=end){const e=effect(t,budget);if(e>0)income+=e;else expense-=e;}
 const current=balance(state,budget,currency,asOf);return {current,income,expense,projected:current+income-expense,end};
}
export function monthStats(state,budget,currency,month) {
 let income=0,expense=0; const categories={};
 for(const t of state.transactions)if(t.status==='paid'&&t.currency===currency&&t.date.startsWith(month)&&belongs(t,budget)&&t.kind!=='transfer'){
  if(t.kind==='income')income+=t.amountMinor;else {expense+=t.amountMinor;categories[t.category]=(categories[t.category]||0)+t.amountMinor;}
 }
 return {income,expense,net:income-expense,categories:Object.entries(categories).sort((a,b)=>b[1]-a[1])};
}
export function createTransactions(base,frequency='none',count=1) {
 if(!['none','weekly','monthly','yearly'].includes(frequency))throw new Error('Nepoznato ponavljanje.');
 if(!Number.isInteger(count)||count<1||count>120)throw new Error('Broj ponavljanja mora biti od 1 do 120.');
 if(frequency==='none')count=1;
 const repeatId=count>1?uid():null;
 return Array.from({length:count},(_,i)=>({...base,id:uid(),createdAt:new Date().toISOString(),repeatId,date:repeatDate(base.date,frequency,i),status:i===0?base.status:'planned'}));
}
