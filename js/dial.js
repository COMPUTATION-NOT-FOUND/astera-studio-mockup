/* The action dial: a ring of up to 6 labelled actions for whatever is on screen or selected.
   It compacts actions, it never hides them: every critical action also exists inline.
   Fixed slots per context build spatial memory; the search field is the linear fallback. */
window.Dial = (function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let layer = null, cfg = null, results = [], resIdx = -1, closing = false;

  function geometry() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const phone = vw < 700;
    // ring sized around a 100px center: items (64px) clear it by a few pixels
    return { vw, vh, phone, R: phone ? 128 : 120, ir: phone ? 88 : 84 };
  }

  // Search lives inside the dial (the right half of the center), so nothing hangs below the ring any more.
  function place(g, anchor) {
    const capH = 44, pad = 16;
    let cx, cy;
    if (g.phone) {
      const bar = document.querySelector('.placebar');
      const barTop = bar && bar.offsetParent ? bar.getBoundingClientRect().top : g.vh;
      cx = g.vw / 2;
      cy = barTop - 16 - g.R;
    } else if (anchor && anchor.side) { // desktop rail: the ring opens to the right of the circle
      cx = anchor.x + 24 + Math.max(g.R, 160); cy = anchor.y; // 160: half the caption/search field, so it clears the rail
    } else if (anchor && anchor.below) {
      cx = anchor.x; cy = anchor.y + 16 + capH + g.R;
    } else if (anchor) {
      cx = anchor.x; cy = anchor.y;
    } else {
      cx = g.vw / 2; cy = g.vh / 2;
    }
    cx = Math.min(Math.max(cx, g.R + pad), g.vw - g.R - pad);
    cy = Math.min(Math.max(cy, g.R + pad + capH), g.vh - g.R - pad);
    return { cx, cy };
  }

  /* cfg: { title, subject, items:[{id,label,icon,run,disabled,hint}], anchor, returnFocus, actions() } */
  function open(options) {
    if (layer) close(true);
    cfg = options; closing = false;
    const g = geometry();
    const pos = place(g, cfg.anchor);
    const items = cfg.items.slice(0, 6);
    const n = items.length;
    layer = document.createElement('div');
    layer.className = 'dial-layer' + (g.phone ? ' phone' : '');
    layer.innerHTML = `<div class="dial-scrim" data-dial-close></div>
      <div class="dial" role="dialog" aria-modal="true" aria-labelledby="dial-cap" tabindex="-1" style="left:${pos.cx}px;top:${pos.cy}px;--R:${g.R}px;--ir:${g.ir}px">
        <p class="dial-cap"><span id="dial-cap"><span class="dial-cap-k">Actions for</span> <b>${esc(cfg.subject || cfg.title)}</b></span></p>
        <div class="dial-disc" aria-hidden="true"></div>
        <div class="dial-menu" role="menu" aria-labelledby="dial-cap">
          ${items.map((it, i) => `<button type="button" role="menuitem" class="dial-item${it.disabled ? ' off' : ''}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}"
              style="--a:${(i * 360 / n).toFixed(2)}deg;--i:${i}"${it.disabled ? ' aria-disabled="true"' : ''}${it.hint ? ` aria-description="${esc(it.hint)}"` : ''}>
              <span class="di-ic">${ic(it.icon)}</span><span class="di-l">${esc(it.label)}</span></button>`).join('')}
        </div>
        <div class="dial-center${cfg.onCustomize ? ' y' : ''}">
          ${cfg.onCustomize ? '<svg class="dc-lines" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 50V100M50 50L6.7 25M50 50L93.3 25"/></svg>' : ''}
          <button type="button" class="dc dc-search" data-dial-search aria-label="Search all actions" aria-haspopup="listbox" title="Search">${ic('search')}</button>
          <button type="button" class="dc dc-close" data-dial-close aria-label="Close actions" title="Close">${ic('xmark')}</button>
          ${cfg.onCustomize ? `<button type="button" class="dc dc-edit" data-dial-edit aria-label="Customize this dial" title="Customize">${ic('edit-pencil')}</button>` : ''}
        </div>
        <div class="dial-search" hidden>
          ${ic('search')}
          <input type="search" class="dial-input" placeholder="Search all actions" aria-label="Search all actions" autocomplete="off" enterkeyhint="go" role="combobox" aria-expanded="false" aria-controls="dial-results">
          <kbd class="dial-kbd" aria-hidden="true">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
          <button type="button" class="ds-back" data-dial-unsearch aria-label="Back to actions">${ic('xmark', 'sm')}</button>
          <ul class="dial-results" id="dial-results" role="listbox" aria-label="Matching actions"></ul>
        </div>
        <p class="dial-hint" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(layer);
    document.documentElement.classList.add('dial-open');
    layer.addEventListener('click', onClick);
    layer.addEventListener('keydown', onKey);
    layer.querySelector('.dial-input').addEventListener('input', onSearch);
    requestAnimationFrame(() => requestAnimationFrame(() => layer && layer.classList.add('open')));
    // keyboard users land on the first action; touch and mouse users land on the dialog itself,
    // so no action looks pre-selected under their finger
    if (cfg.focusSearch) { enterSearch(); return; }
    const first = cfg.viaKeyboard ? layer.querySelector('.dial-item') : layer.querySelector('.dial');
    setTimeout(() => first && first.focus({ preventScroll: true }), 60);
  }

  // Search mode: the ring fades and the caption becomes the search field, in the same spot
  function enterSearch() {
    if (!layer) return;
    const d = layer.querySelector('.dial'), box = layer.querySelector('.dial-search');
    d.classList.add('searching'); box.hidden = false;
    setTimeout(() => { const i = layer && layer.querySelector('.dial-input'); i && i.focus({ preventScroll: true }); }, 30);
  }
  function exitSearch() {
    if (!layer) return;
    const d = layer.querySelector('.dial'), inp = layer.querySelector('.dial-input');
    d.classList.remove('searching'); layer.querySelector('.dial-search').hidden = true;
    inp.value = ''; results = []; resIdx = -1;
    layer.querySelector('.dial-results').innerHTML = '';
    inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant');
    layer.querySelector('.dc-search').focus({ preventScroll: true });
  }

  function close(instant) {
    if (!layer || closing) return;
    const l = layer, back = cfg && cfg.returnFocus;
    closing = true;
    document.documentElement.classList.remove('dial-open');
    const done = () => { l.remove(); if (layer === l) { layer = null; closing = false; } };
    if (instant) { done(); closing = false; layer = null; return; }
    l.classList.remove('open'); l.classList.add('closing');
    setTimeout(done, 160);
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }

  function run(item) {
    if (!item) return;
    if (item.disabled) { hint(item.hint || 'Not available right now'); return; }
    close();
    setTimeout(() => item.run && item.run(), 40);
  }

  function hint(text) {
    const h = layer && layer.querySelector('.dial-hint');
    if (h) { h.textContent = text; h.classList.add('on'); }
  }

  function itemsEls() { return [...layer.querySelectorAll('.dial-item')]; }
  function focusItem(i) {
    const els = itemsEls(); if (!els.length) return;
    const k = (i + els.length) % els.length;
    els.forEach((e, j) => e.tabIndex = j === k ? 0 : -1);
    els[k].focus();
  }

  function onClick(e) {
    if (e.target.closest('[data-dial-close]')) { close(); return; }
    if (e.target.closest('[data-dial-search]')) { enterSearch(); return; }
    if (e.target.closest('[data-dial-unsearch]')) { exitSearch(); return; }
    if (e.target.closest('[data-dial-edit]')) { const fn = cfg.onCustomize; close(); setTimeout(fn, 60); return; }
    const it = e.target.closest('.dial-item');
    if (it) { run(cfg.items[+it.dataset.i]); return; }
    const r = e.target.closest('.dial-res');
    if (r) run(results[+r.dataset.i]);
  }

  function onKey(e) {
    const t = e.target;
    // Esc steps back one level: out of search first, then out of the dial
    if (e.key === 'Escape') { e.preventDefault(); if (layer.querySelector('.dial').classList.contains('searching')) exitSearch(); else close(); return; }
    if (t.classList.contains('dial') && /^Arrow|^Home$|^End$/.test(e.key)) { e.preventDefault(); focusItem(e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'End' ? -1 : 0); return; }
    if (t.classList.contains('dial-item')) {
      const i = +t.dataset.i;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
      else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
      else if (e.key === 'End') { e.preventDefault(); focusItem(itemsEls().length - 1); }
      else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
        enterSearch(); layer.querySelector('.dial-input').focus(); // the typed character lands in the field
      }
    } else if (t.classList.contains('dial-input')) {
      if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setRes(Math.min(resIdx + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setRes(Math.max(resIdx - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (results.length) run(results[Math.max(resIdx, 0)]); }
    }
    if (e.key === 'Tab') { // keep focus inside the dial
      const searching = layer.querySelector('.dial').classList.contains('searching');
      const f = (searching ? [layer.querySelector('.dial-input'), layer.querySelector('.ds-back')]
        : [layer.querySelector('.dial-item[tabindex="0"]'), layer.querySelector('.dc-search'), layer.querySelector('.dc-close'), layer.querySelector('.dc-edit')]).filter(Boolean);
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }

  function onSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    const list = layer.querySelector('.dial-results');
    const all = (cfg.actions ? cfg.actions() : cfg.items).filter(a => !a.disabled);
    results = q ? all.filter(a => (a.label + ' ' + (a.keywords || '') + ' ' + (a.scope || '')).toLowerCase().includes(q)).slice(0, 6) : [];
    resIdx = results.length ? 0 : -1;
    e.target.setAttribute('aria-expanded', results.length ? 'true' : 'false');
    list.innerHTML = results.map((a, i) => `<li><button type="button" class="dial-res" role="option" id="dial-res-${i}" data-i="${i}" aria-selected="${i === resIdx}">
      ${ic(a.icon)}<span>${esc(a.label)}</span>${a.scope ? `<small>${esc(a.scope)}</small>` : ''}</button></li>`).join('') ||
      (q ? `<li class="dial-none">No action matches “${esc(e.target.value)}”</li>` : '');
    if (resIdx >= 0) e.target.setAttribute('aria-activedescendant', 'dial-res-0'); else e.target.removeAttribute('aria-activedescendant');
  }
  function setRes(i) {
    resIdx = i;
    layer.querySelectorAll('.dial-res').forEach((b, j) => b.setAttribute('aria-selected', j === i));
    layer.querySelector('.dial-input').setAttribute('aria-activedescendant', 'dial-res-' + i);
  }

  window.addEventListener('resize', () => { if (layer) close(true); });
  return { open, close, isOpen: () => !!layer };
})();
