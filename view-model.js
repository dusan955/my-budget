/** Pure UI helpers shared with tests; persisted schema remains version 1. */
import {parseMoney,validDate,today,effect,balance,createTransactions,CURRENCIES,CATEGORIES} from './core.js';
export function shiftMonth(month,step) {
  if(!/^\d{4}-\d{2}$/.test(month)) throw new Error('Neispravan mesec.');
  const [y,m]=month.split('-').map(Number);
  if(m<1||m>12)throw new Error('Neispravan mesec.');
  const date=new Date(Date.UTC(y,m-1+step,1));
  if(date.getUTCFullYear()<1900||date.getUTCFullYear()>2199)return month;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
export function searchKey(text){return String(text).toLocaleLowerCase('sr-Latn').replaceAll('đ','dj').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
export function entryValues(values,now=today()) {
  const problem=(field,message)=>{const e=new Error(message);e.field=field;throw e;};
  let amountMinor;try{amountMinor=parseMoney(values.amount);}catch(e){problem('amount',e.message);}
  if(amountMinor<=0)problem('amount','Iznos mora biti veći od nule.');
  const title=String(values.title||'').trim();if(!title)problem('title','Unesi naziv.');
  if(title.length>80)problem('title','Naziv može imati najviše 80 znakova.');
  const date=String(values.date),status=String(values.status),kind=String(values.kind);
  if(!validDate(date))problem('date','Izaberi ispravan datum.');
  if(status==='paid'&&date>now)problem('status','Budući unos mora biti planiran.');
  if(!['income','expense','transfer'].includes(kind))problem('kind','Izaberi vrstu unosa.');
  if(!['paid','planned'].includes(status))problem('status','Izaberi status.');
  const budget=String(values.budget),toBudget=kind==='transfer'?String(values.toBudget):null;
  if(!['personal','shared'].includes(budget))problem('budget','Izaberi budžet.');
  if(kind==='transfer'&&(!['personal','shared'].includes(toBudget)||toBudget===budget))problem('toBudget','Za prenos izaberi drugi budžet.');
  if(!CURRENCIES.includes(values.currency))problem('currency','Izaberi RSD ili EUR.');
  if(!CATEGORIES.includes(values.category))problem('category','Izaberi kategoriju sa liste.');
  if(String(values.note||'').length>500)problem('note','Napomena može imati najviše 500 znakova.');
  return {kind,budget,toBudget,currency:String(values.currency),amountMinor,title,category:kind==='transfer'?'Ostalo':String(values.category),date,status,note:String(values.note||'').trim()};
}
export function previewImpact(state,base,old=null) {
  // Earlier paid records change history, not the opening balance.
  const existing=old?{...state,transactions:state.transactions.filter(t=>t.id!==old.id)}:state;
  return Object.fromEntries(['personal','shared'].map(b=>[b,balance(existing,b,base.currency)+(base.status==='paid'&&base.date>=state.openingDate?effect(base,b):0)]));
}
export function buildEntries(base,frequency,count,old=null){return old?[{...old,...base}]:createTransactions(base,frequency,count);}
