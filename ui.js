/** Shared accessible sheets. No financial data is written to browser storage. */
const dialog = document.querySelector('#editor');
let returnFocus = null, returnSelector = null, scrollY = 0, dirty = false, working = false;
let discardGuard = null;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function updateViewport() {
  const vp = window.visualViewport;
  if (vp && vp.scale > 1.05) return; // Do not defeat pinch zoom.
  const height = vp?.height ?? innerHeight;
  document.documentElement.style.setProperty('--visible-height', `${Math.round(height)}px`);
  document.documentElement.style.setProperty('--viewport-top', `${Math.round(vp?.offsetTop ?? 0)}px`);
}
function identifyOpener(el) {
  if (!el?.dataset?.action) return null;
  const fields = ['action', 'screen', 'id', 'scope'];
  return fields.filter(k => el.dataset[k]).map(k => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
}
export function enhanceForm(form) {
  if (!form) return;
  for (const field of form.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!field.name) continue;
    field.id ||= `${form.id || 'form'}-${field.name}`;
    const label = field.closest('label');
    if (label) label.htmlFor = field.id;
    const help = label?.querySelector('.field-help');
    if (help) { help.id ||= `${field.id}-help`; field.setAttribute('aria-describedby', help.id); }
  }
}
export function openSheet(title, body) {
  const wasOpen = dialog.open;
  if (!wasOpen) {
    returnFocus = document.activeElement;
    returnSelector = identifyOpener(returnFocus);
    scrollY = window.scrollY;
  }
  dirty = false; working = false; discardGuard = null;
  dialog.removeAttribute('aria-busy');
  dialog.classList.remove('discard-mode');
  dialog.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div><header class="dialog-head"><div><p class="sheet-eyebrow">MOJ BUDŽET</p><h2 id="dialog-title" tabindex="-1">${escapeHTML(title)}</h2></div><button type="button" class="icon-btn" data-action="close" aria-label="Zatvori prozor"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="dialog-body">${body}</div>`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.setAttribute('aria-modal', 'true');
  for (const form of dialog.querySelectorAll('form')) enhanceForm(form);
  // Keep a real form owner while moving actions outside its scrolling region.
  const actions = dialog.querySelector('form > .form-actions');
  if (actions) {
    const form = actions.closest('form');
    for (const button of actions.querySelectorAll('button')) button.setAttribute('form', form.id);
    actions.classList.add('sheet-footer'); dialog.append(actions);
  }
  updateViewport();
  if (!wasOpen) {
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add('sheet-open');
    dialog.showModal();
  }
  // The title receives focus, avoiding an unexpected mobile keyboard on open.
  dialog.querySelector('#dialog-title').focus({preventScroll:true});
}
export function markSheetDirty() { if (dialog.open) dirty = true; }
export function setSheetBusy(value) {
  working = Boolean(value);
  if (dialog.open) {
    dialog.setAttribute('aria-busy', String(working));
    dialog.querySelector('[data-action=close]')?.toggleAttribute('disabled', working);
  }
}
export function clearSheetDirty() { dirty = false; }
export function closeSheet(force = false) {
  if (working && !force) return;
  if (!force && dirty && !discardGuard) {
    const guard = document.createElement('section');
    guard.className = 'discard-guard'; guard.setAttribute('role', 'alert');
    guard.innerHTML = '<h3>Nesačuvane izmene</h3><p>Unos još nije sačuvan. Nastavi uređivanje ili odbaci izmene.</p><div class="guard-actions"><button type="button" class="btn primary" data-sheet="keep">Nastavi unos</button><button type="button" class="btn danger" data-sheet="discard">Odbaci izmene</button></div>';
    discardGuard = guard;
    for (const el of dialog.querySelectorAll('.dialog-body, .sheet-footer')) { el.inert = true; el.hidden = true; }
    dialog.append(guard); dialog.classList.add('discard-mode');
    guard.querySelector('button').focus(); return;
  }
  if (!force && discardGuard) { keepEditing(); return; }
  dirty = false; working = false;
  if (dialog.open) dialog.close();
}
function keepEditing() {
  discardGuard?.remove(); discardGuard = null; dialog.classList.remove('discard-mode');
  for (const el of dialog.querySelectorAll('.dialog-body, .sheet-footer')) { el.inert = false; el.hidden = false; }
  dialog.querySelector('#dialog-title')?.focus({preventScroll:true});
}
export function fieldError(form, name, text) {
  const field = form.elements.namedItem(name);
  if (!field || !field.closest) return;
  field.setAttribute('aria-invalid', 'true');
  const id = `${field.id || form.id+'-'+name}-error`;
  let message = document.getElementById(id);
  if (!message) { message = document.createElement('span'); message.className='field-error'; message.id=id; field.closest('label')?.append(message); }
  message.textContent = text;
  const previous=(field.getAttribute('aria-describedby')||'').split(' ').filter(Boolean);
  field.setAttribute('aria-describedby', [...new Set([...previous,id])].join(' '));
  field.focus({preventScroll:true});
  field.scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});
}
export function clearFieldError(field) {
  if (!field?.matches?.('input,select,textarea')) return;
  field.removeAttribute('aria-invalid');
  const summary=field.form?.querySelector('.form-error');if(summary?.dataset.field===field.name){summary.textContent='';delete summary.dataset.field;}
  const ids=(field.getAttribute('aria-describedby')||'').split(' ').filter(Boolean);
  const keep=ids.filter(id=>{const e=document.getElementById(id);if(e?.classList.contains('field-error')){e.remove();return false;}return true;});
  if(keep.length)field.setAttribute('aria-describedby',keep.join(' '));else field.removeAttribute('aria-describedby');
}
export function validateForm(form) {
  for (const field of form.elements) {
    if (!field.willValidate || field.validity.valid) continue;
    let text = 'Proveri ovo polje.';
    if (field.validity.valueMissing) text=field.type==='checkbox'?'Potvrdi ovu stavku.':'Popuni ovo polje.';
    else if (field.validity.tooShort) text=`Unesi najmanje ${field.minLength} znakova.`;
    else if (field.validity.rangeUnderflow || field.validity.rangeOverflow) text=`Dozvoljeno je od ${field.min} do ${field.max}.`;
    fieldError(form,field.name,text); return false;
  }
  return true;
}
dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
dialog.addEventListener('click', event => {
  const action=event.target.closest('[data-sheet]')?.dataset.sheet;
  if (action==='keep') keepEditing();
  if (action==='discard') closeSheet(true);
});
let backdropStart=false;
dialog.addEventListener('pointerdown', e => { const r=dialog.getBoundingClientRect();backdropStart=e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom); });
dialog.addEventListener('pointerup', e => { if(backdropStart&&e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet();}backdropStart=false; });
for(const event of ['input','change'])dialog.addEventListener(event,e=>{if(e.target.matches('input,select,textarea')){dirty=true;clearFieldError(e.target);}});
dialog.addEventListener('close', () => {
  // A replacement sheet can have opened before this queued event fires.
  if (dialog.open) return;
  document.body.classList.remove('sheet-open'); document.body.style.top='';
  window.scrollTo({top:scrollY,behavior:'instant'});
  const candidate=returnFocus?.isConnected?returnFocus:(returnSelector?[...document.querySelectorAll(returnSelector)].find(el=>el.getClientRects().length):null);
  const target=candidate||document.querySelector('main h1, main h2');
  if(target){if(!target.matches('button,a,input,select,textarea'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
  dirty=false;working=false;discardGuard=null;returnFocus=null;returnSelector=null;
  dialog.innerHTML='';
});
window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',updateViewport,{passive:true});
window.addEventListener('resize',updateViewport,{passive:true});
updateViewport();
