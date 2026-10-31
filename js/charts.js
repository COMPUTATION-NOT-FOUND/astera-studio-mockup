/* Charts for the Astera Studio mockup. Plain HTML + SVG, no library.
   Rules (dataviz skill): bars at most 24px thick with a 4px rounded data end, 2px lines, solid hairline grids,
   text in text colors (never the series color), a legend for two or more series, and every chart has a table twin.
   Every bar is a <button>, so values and drill-down work by tap, mouse or keyboard. Nothing depends on hover. */
window.Charts = (function () {
  'use strict';

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('en-US');
  // under $1M reads better in thousands ($50K, not $0.1M)
  const money = v => Math.abs(v) < 0.995 ? '$' + nf0.format(Math.round(v * 1000)) + 'K' : '$' + nf1.format(v) + 'M';
  const pctDelta = (a, t) => Math.round((a / t - 1) * 100);
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

  function niceMax(v) {
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const s of steps) if (s * mag >= v) return s * mag;
    return 10 * mag;
  }

  /* ---------- actual vs target, horizontal bars ----------
     items: [{ key, label, actual, target }] ; opts: { id, drillable, selected, caption } */
  function vsTarget(items, opts = {}) {
    const max = niceMax(Math.max(...items.map(i => Math.max(i.actual, i.target))) * 1.04);
    const ticks = [0, max / 2, max];
    const missed = items.filter(i => i.actual < i.target).length;
    const rows = items.map(i => {
      const d = pctDelta(i.actual, i.target);
      const miss = i.actual < i.target;
      const sel = opts.selected === i.key;
      const label = `${i.label}: ${money(i.actual)} against a ${money(i.target)} target, ${miss ? Math.abs(d) + '% under' : Math.abs(d) + '% over'}.${opts.drillable ? ' Tap for details.' : ''}`;
      return `<button type="button" class="vt-row${miss ? ' miss' : ' hit'}${sel ? ' sel' : ''}" data-action="bar" data-chart="${esc(opts.id || '')}" data-key="${esc(i.key)}" aria-label="${esc(label)}" aria-pressed="${sel}">
        <span class="vt-label"><span class="vt-name">${esc(i.label)}</span><span class="vt-val num">${money(i.actual)} <span class="${miss ? 'st-failed' : 'st-succeeded'}">${signed(d)}%</span></span></span>
        <span class="vt-track">
          <span class="vt-bar" style="width:${(i.actual / max * 100).toFixed(2)}%"></span>
          <span class="vt-target" style="left:${(i.target / max * 100).toFixed(2)}%"></span>
        </span>
      </button>`;
    }).join('');
    const axis = ticks.map(t => `<span class="vt-tick" style="left:${(t / max * 100).toFixed(2)}%"><em class="num">${t === 0 ? '$0' : '$' + nf0.format(t) + 'M'}</em></span>`).join('');
    return `<div class="vt" data-chart-root="${esc(opts.id || '')}">
      <ul class="legend" aria-label="Legend">
        ${missed ? '<li><i class="key key-miss"></i>Missed target</li>' : ''}
        ${missed < items.length ? '<li><i class="key key-hit"></i>Hit target</li>' : ''}
        <li><i class="key key-target"></i>Target</li>
      </ul>
      <div class="vt-plot" role="group" aria-label="${esc(opts.caption || 'Actual against target')}">
        <div class="vt-grid" aria-hidden="true">${axis}</div>
        ${rows}
      </div>
    </div>`;
  }

  /* popover shown under a tapped bar (the tooltip twin for touch) */
  function barTip(item, opts = {}) {
    const d = pctDelta(item.actual, item.target);
    const miss = item.actual < item.target;
    return `<div class="tip" role="status">
      <div class="tip-vals">
        <p><b class="num">${money(item.actual)}</b> <span class="muted">actual</span></p>
        <p><b class="num">${money(item.target)}</b> <span class="muted">target</span></p>
        <p class="${miss ? 'st-failed' : 'st-succeeded'} status">${ic(miss ? 'arrow-down' : 'arrow-up', 'sm')}${Math.abs(d)}% ${miss ? 'under' : 'over'} target</p>
      </div>
      ${opts.drill ? `<button type="button" class="btn primary" data-action="drill" data-chart="${esc(opts.chart)}" data-key="${esc(item.key)}">${ic('zoom-in')}See ${esc(item.label)} by country</button>` : ''}
    </div>`;
  }

  /* ---------- bridge: how a total target turns into actual sales ----------
     The axis is the gap to target, so 0 means "on target". Each region moves the running gap by its own
     actual − target; the last row is the total gap. Bars never pretend to start at $0 sales.
     b: { start:{label,v}, items:[{key,label,d}], end:{label,v} }  (v in $M, d = actual − target) */
  function bridge(b, opts = {}) {
    let cum = 0;
    const rows = b.items.map(i => { const from = cum; cum += i.d; return Object.assign({ from, to: cum }, i); });
    const vals = rows.flatMap(r => [r.from, r.to]).concat(cum, 0);
    const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.08 || 0.1;
    const lo = mn < 0 ? mn - pad : 0, hi = mx > 0 ? mx + pad : pad;
    const P = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
    const sgn = v => Math.abs(v) < 0.05 ? 'On target' : (v >= 0 ? '+' : '−') + money(Math.abs(v));
    const bar = (a, z, cls) => `<span class="br-bar ${cls}" style="left:${P(Math.min(a, z))}%;width:${Math.max(0.6, Math.abs(z - a) / (hi - lo) * 100).toFixed(2)}%"></span>`;
    const row = (label, val, track, cls = '', aria = '') => `<div class="br-row ${cls}" role="listitem" aria-label="${esc(aria || label + ', ' + val)}">
      <span class="vt-label"><span class="vt-name">${esc(label)}</span><span class="vt-val num">${val}</span></span><span class="vt-track">${track}</span></div>`;
    return `<div class="vt br" data-chart-root="${esc(opts.id || '')}">
      <ul class="legend" aria-label="Legend"><li><i class="key key-miss"></i>Below target</li><li><i class="key key-ok"></i>Above target</li><li><i class="key key-target"></i>On target</li></ul>
      <div class="vt-plot" role="list" aria-label="${esc(opts.caption || 'Gap to target')}">
        <div class="vt-grid" aria-hidden="true"><span class="vt-tick br-zero" style="left:${P(0)}%"><em class="num">On target</em></span></div>
        ${row(b.start.label, money(b.start.v), '', 'br-total')}
        ${rows.map(r => row(r.label, `<span class="${r.d < 0 ? 'st-failed' : 'st-succeeded'}">${sgn(r.d)}</span>`, bar(r.from, r.to, r.d < 0 ? 'neg' : 'pos'), '', `${r.label}: ${sgn(r.d)} against target`)).join('')}
        ${row(b.end.label, `${money(b.end.v)} <span class="${cum < 0 ? 'st-failed' : 'st-succeeded'}">${sgn(cum)}</span>`, bar(0, cum, (cum < 0 ? 'neg' : 'pos') + ' end'), 'br-total', `${b.end.label}: ${money(b.end.v)}, ${sgn(cum)} against target`)}
      </div>
    </div>`;
  }

  /* ---------- plain horizontal bars with one reference line (for derived metrics) ----------
     items: [{key,label,v,note}] ; opts: { fmt, ref, refLabel, caption } */
  function hbars(items, opts = {}) {
    const fmt = opts.fmt || money;
    const max = niceMax(Math.max(...items.map(i => i.v), opts.ref || 0) * 1.04);
    const P = v => (v / max * 100).toFixed(2);
    return `<div class="vt hb" data-chart-root="${esc(opts.id || '')}">
      ${opts.ref != null ? `<ul class="legend" aria-label="Legend"><li><i class="key key-target"></i>${esc(opts.refLabel || 'Average')} ${fmt(opts.ref)}</li></ul>` : ''}
      <div class="vt-plot" role="list" aria-label="${esc(opts.caption || 'Bars')}">
        <div class="vt-grid" aria-hidden="true">${[0, max / 2, max].map(t => `<span class="vt-tick" style="left:${P(t)}%"><em class="num">${fmt(t)}</em></span>`).join('')}</div>
        ${items.map(i => `<div class="br-row" role="listitem" aria-label="${esc(i.label + ': ' + fmt(i.v) + (i.note ? ', ' + i.note : ''))}">
          <span class="vt-label"><span class="vt-name">${esc(i.label)}</span><span class="vt-val num"><b>${fmt(i.v)}</b>${i.note ? ' · ' + esc(i.note) : ''}</span></span>
          <span class="vt-track"><span class="vt-bar hb-bar" style="width:${P(i.v)}%"></span>${opts.ref != null ? `<span class="vt-target" style="left:${P(opts.ref)}%"></span>` : ''}</span></div>`).join('')}
      </div>
    </div>`;
  }

  /* ---------- line: this year vs last year ----------
     d: { labels, a, b, aLabel, bLabel, band:[i0,i1] }
     Forecast extras: labels may run past a. proj { v, lo, hi } continues a from its last point
     (dashed, with a shaded range); pace { v, from, label } is a flat reference line from month `from` on. */
  function line(d, opts = {}) {
    const pr = d.proj;
    const all = d.a.concat(d.b || [], pr ? pr.lo.concat(pr.hi) : [], d.pace ? [d.pace.v] : []);
    const mn = Math.min(...all), mx = Math.max(...all), pad = Math.max((mx - mn) * 0.15, mx * 0.03);
    const big = mx >= 3; // whole-million gridlines suit company-sized values; one small country scales to its own range
    const lo = big ? Math.floor(mn - 0.4) : Math.max(0, mn - pad), hi = big ? Math.ceil(mx + 0.3) : mx + pad;
    const W = 600, H = 200, n = d.labels.length, la = d.a.length - 1;
    const x = i => (i / (n - 1)) * W;
    const y = v => H - ((v - lo) / (hi - lo)) * H;
    const path = (arr, o = 0) => arr.map((v, i) => (i ? 'L' : 'M') + x(i + o).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const area = path(d.a) + ` L${x(la).toFixed(1)} ${H} L0 ${H} Z`;
    // the projection starts at the last real point, so the dashed line joins the solid one
    const pv = pr ? [d.a[la]].concat(pr.v) : null;
    const pband = pr ? path([d.a[la]].concat(pr.hi), la) + ' ' + [d.a[la]].concat(pr.lo).map((v, i) => 'L' + x(la + i).toFixed(1) + ' ' + y(v).toFixed(1)).reverse().join(' ') + ' Z' : '';
    const pace = d.pace ? `<span class="ln-pace" style="left:${(x(d.pace.from) / W * 100).toFixed(2)}%;bottom:${((d.pace.v - lo) / (hi - lo) * 100).toFixed(2)}%" aria-hidden="true"></span>` : '';
    const ticks = [lo, (lo + hi) / 2, hi];
    const grid = ticks.map(t => `<span class="ln-grid" style="bottom:${((t - lo) / (hi - lo) * 100).toFixed(2)}%"><em class="num">${big ? money(Math.round(t)) : money(t)}</em></span>`).join('');
    const band = d.band ? `<span class="ln-band" style="left:${(x(d.band[0]) / W * 100 - (d.band[0] ? 50 / (n - 1) : 0)).toFixed(2)}%;right:${(100 - x(d.band[1]) / W * 100 - (d.band[1] < n - 1 ? 50 / (n - 1) : 0)).toFixed(2)}%" aria-hidden="true"></span>` : '';
    const last = n - 1;
    const endA = pr ? `<span class="ln-end" style="top:${(y(pv[pv.length - 1]) / H * 100).toFixed(2)}%"><b class="num">${money(pv[pv.length - 1])}</b> projected</span>`
      : `<span class="ln-end" style="top:${(y(d.a[last]) / H * 100).toFixed(2)}%"><b class="num">${money(d.a[last])}</b> ${esc(d.aLabel)}</span>`;
    const endB = d.b && !pr ? `<span class="ln-end b" style="top:${(y(d.b[last]) / H * 100).toFixed(2)}%"><b class="num">${money(d.b[last])}</b> ${esc(d.bLabel)}</span>` : '';
    const endP = d.pace ? `<span class="ln-end b" style="top:${(y(d.pace.v) / H * 100).toFixed(2)}%"><b class="num">${money(d.pace.v)}</b> ${esc(d.pace.short || d.pace.label)}</span>` : '';
    const summary = `${d.aLabel}: ${d.a.map((v, i) => d.labels[i] + ' ' + money(v)).join(', ')}.${pr ? ' Projected: ' + pr.v.map((v, i) => d.labels[la + 1 + i] + ' ' + money(v)).join(', ') + '.' : ''}`;
    return `<div class="ln" data-chart-root="${esc(opts.id || '')}" data-series='${esc(JSON.stringify({ labels: d.labels, a: d.a, b: d.b || null, aLabel: d.aLabel, bLabel: d.bLabel || '', p: pr ? pr.v : null }))}'>
      <ul class="legend" aria-label="Legend"><li><i class="key key-line"></i>${esc(d.aLabel)}</li>${pr ? '<li><i class="key key-line p"></i>Projected</li>' : ''}${d.b ? `<li><i class="key key-line b"></i>${esc(d.bLabel)}</li>` : ''}${d.pace ? `<li><i class="key key-line pace"></i>${esc(d.pace.label)}</li>` : ''}</ul>
      <div class="ln-wrap">
        <div class="ln-plot" tabindex="0" role="img" aria-label="${esc((opts.caption || 'Line chart') + '. ' + summary + ' Use the arrow keys to read each month.')}">
          ${grid}${band}${pace}
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <path class="ln-area" d="${area}"/>
            ${d.b ? `<path class="ln-b" d="${path(d.b)}" vector-effect="non-scaling-stroke"/>` : ''}
            ${pr ? `<path class="ln-pband" d="${pband}"/>` : ''}
            <path class="ln-a" d="${path(d.a)}" vector-effect="non-scaling-stroke"/>
            ${pr ? `<path class="ln-p" d="${path(pv, la)}" vector-effect="non-scaling-stroke"/>` : ''}
          </svg>
          <span class="ln-dot" style="left:${(x(la) / W * 100).toFixed(2)}%;top:${(y(d.a[la]) / H * 100).toFixed(2)}%" aria-hidden="true"></span>
          <span class="ln-cross" aria-hidden="true"></span>
          <div class="ln-tip" aria-live="polite"></div>
        </div>
        <div class="ln-ends" aria-hidden="true">${endA}${endB}${endP}</div>
      </div>
      <div class="ln-x" aria-hidden="true">${d.labels.map(l => `<span>${esc(l)}</span>`).join('')}</div>
    </div>`;
  }

  /* crosshair: tap or drag on touch, move on mouse, arrow keys on keyboard */
  function attachLine(root) {
    root.querySelectorAll('.ln').forEach(el => {
      if (el._wired) return; el._wired = true;
      const d = JSON.parse(el.dataset.series);
      const plot = el.querySelector('.ln-plot'), cross = el.querySelector('.ln-cross'), tip = el.querySelector('.ln-tip');
      let idx = -1;
      const show = i => {
        const n = d.labels.length;
        idx = Math.max(0, Math.min(n - 1, i));
        const pct = idx / (n - 1) * 100;
        const proj = idx >= d.a.length, va = proj ? (d.p ? d.p[idx - d.a.length] : null) : d.a[idx];
        cross.style.left = pct + '%'; cross.classList.add('on');
        tip.innerHTML = `<p class="tip-m">${esc(d.labels[idx])}</p>` +
          (va == null ? '' : `<p><i class="key key-line${proj ? ' p' : ''}"></i><b class="num">${money(va)}</b> <span class="muted">${proj ? 'projected' : esc(d.aLabel)}</span></p>`) +
          (d.b && d.b[idx] != null ? `<p><i class="key key-line b"></i><b class="num">${money(d.b[idx])}</b> <span class="muted">${esc(d.bLabel)}</span></p>` : '');
        tip.classList.add('on');
        tip.style.left = Math.min(Math.max(pct, 18), 82) + '%';
      };
      const hide = () => { cross.classList.remove('on'); tip.classList.remove('on'); idx = -1; };
      const fromEvent = e => { const r = plot.getBoundingClientRect(); return Math.round((e.clientX - r.left) / r.width * (d.labels.length - 1)); };
      plot.addEventListener('pointerdown', e => { show(fromEvent(e)); });
      plot.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) show(fromEvent(e)); });
      plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
      plot.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show((idx < 0 ? d.labels.length - 1 : idx) + (e.key === 'ArrowRight' ? 1 : -1)); }
        if (e.key === 'Escape') hide();
      });
      plot.addEventListener('blur', hide);
    });
  }

  /* ---------- monthly columns (alternate form for the revenue line) ---------- */
  function columns(d, opts = {}) {
    const max = niceMax(Math.max(...d.a) * 1.05);
    const cols = d.labels.map((l, i) => `<span class="col" role="img" aria-label="${esc(l)}: ${money(d.a[i])}">
        <span class="col-t"><span class="col-bar" style="height:${(d.a[i] / max * 100).toFixed(2)}%"></span></span><span class="col-l">${esc(l)}</span></span>`).join('');
    return `<div class="cols" data-chart-root="${esc(opts.id || '')}"><div class="cols-plot" role="group" aria-label="${esc(opts.caption || 'Monthly values')}">
      <span class="cols-max num" aria-hidden="true">${money(max)}</span>${cols}</div></div>`;
  }

  /* ---------- table twin ---------- */
  function table(head, rows, opts = {}) {
    return `<div class="tbl-wrap"><table class="tbl">${opts.caption ? `<caption class="sr-only">${esc(opts.caption)}</caption>` : ''}
      <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td class="r num${c.cls ? ' ' + c.cls : ''}">${esc(c.v !== undefined ? c.v : c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }
  function vsTargetTable(items, caption) {
    return table(['Name', 'Actual', 'Target', 'Gap'], items.map(i => {
      const d = pctDelta(i.actual, i.target);
      return [i.label, money(i.actual), money(i.target), { v: signed(d) + '%', cls: d < 0 ? 'st-failed' : 'st-succeeded' }];
    }), { caption });
  }
  function lineTable(d, caption) {
    return table(['Month', d.aLabel, d.bLabel || ''], d.labels.map((l, i) => [l, money(d.a[i]), d.b ? money(d.b[i]) : '']), { caption });
  }

  /* ---------- small figures ---------- */
  function spark(vals) {
    const W = 96, H = 28, min = Math.min(...vals), max = Math.max(...vals);
    const pts = vals.map((v, i) => [i / (vals.length - 1) * W, H - 4 - (v - min) / (max - min || 1) * (H - 8)]);
    const p = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const l = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${p}"/><circle cx="${l[0].toFixed(1)}" cy="${l[1].toFixed(1)}" r="3.5"/></svg>`;
  }
  function runHistory(h) {
    const ok = h.filter(x => x === 'ok').length, fail = h.filter(x => x === 'fail').length, run = h.filter(x => x === 'run').length;
    const text = `Last ${h.length} runs: ${ok} succeeded${fail ? ', ' + fail + ' failed' : ''}${run ? ', 1 running now' : ''}. Oldest on the left.`;
    return `<div class="runs" role="img" aria-label="${text}">${h.map(x => `<i class="run run-${x}"></i>`).join('')}</div>`;
  }

  return { esc, money, nf0, nf1, pctDelta, signed, vsTarget, barTip, bridge, hbars, line, attachLine, columns, table, vsTargetTable, lineTable, spark, runHistory };
})();
